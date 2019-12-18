import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import {
  BAD_REQUEST,
  FORBIDDEN,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  UNAUTHORIZED,
} from 'http-status-codes';
import NestedError from 'nested-error-stacks';
import { type } from 'os';
import path from 'path';
import util, { promisify } from 'util';
import { Config } from '../config';
import { ItemJSON, CUDLMetadataRepository, CUDLFormat } from '../metadata';

import {
  CORS_HEADERS,
  isEnumMember,
  isExternalCorsRequest,
  isSimplePathSegment,
} from '../util';

export function getRoutes(options: {
  router?: express.Router;
  metadataRepository: CUDLMetadataRepository;
}) {
  const router = options.router || express.Router();

  /* GET home page. */
  router.get('/', (req, res) => {
    res.status(UNAUTHORIZED).send('Unathorised');
  });

  router.get('/:format/:id', createMetadataHandler(options.metadataRepository));

  return router;
}

function createMetadataHandler(metadataRepository: CUDLMetadataRepository) {
  return expressAsyncHandler(
    async (req: express.Request, res: express.Response, next) => {
      // We always want to allow remote ajax access
      res.set(CORS_HEADERS);

      // The response depends on the Origin header, as we block access to
      // non-embeddable items from non-cudl origins. If we don't set
      // Vary: Origin then a response for a client on CUDL could be used by a
      // cache to service a request from an external site.
      res.set('Vary', 'Origin');

      // Ensure our path vars are safe to build FS paths from
      const id = req.params.id;
      const format = req.params.format;
      if (!isSimplePathSegment(id)) {
        res.status(BAD_REQUEST).json({
          error: util.format(`Bad id: ${id}`),
        });
        return;
      }

      if (!isEnumMember(CUDLFormat, format)) {
        res.status(BAD_REQUEST).json({
          error: util.format(`Bad format: ${format}`),
        });
        return;
      }

      let item: ItemJSON;
      try {
        item = await metadataRepository.getJSON(id);
      } catch (e) {
        if (e?.nested?.code === 'ENOENT') {
          res.status(NOT_FOUND).json({
            error: `ID does not exist: ${id}`,
          });
        } else {
          next(e);
        }
        return;
      }

      if (req.params.format === 'json') {
        // If the request is an external CORS request we'll restrict
        // access to items which are not embeddable. This prevents
        // external sites using CORS request to get at non-embeddable
        // content, while allowing cudl itself to get at it. Note that
        // there's nothing to stop someone setting up a proxy which
        // strips or fakes the origin header.
        if (
          isExternalCorsRequest(req) &&
          typeof item.embeddable === 'boolean' &&
          !item.embeddable
        ) {
          res.status(FORBIDDEN).json({
            error: 'This item is only available from ' + 'cudl.lib.cam.ac.uk',
          });
          return;
        }

        res.json(item);
      } else {
        // This returns the original metadata.  We only want to return the metadata if
        // the metadataRights field is present (and non-empty) in the JSON.
        if (item?.descriptiveMetadata?.[0]?.metadataRights?.trim()) {
          // Return metadata
          res.contentType('text/plain');
          res.sendFile(await metadataRepository.getPath(format, id));
        } else {
          res.status(FORBIDDEN).json({
            error: util.format('Access not allowed to requested metadata'),
          });
        }
      }
    }
  );
}
