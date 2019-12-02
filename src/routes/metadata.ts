import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import {
  BAD_REQUEST,
  FORBIDDEN,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
} from 'http-status-codes';
import NestedError from 'nested-error-stacks';
import { type } from 'os';
import path from 'path';
import util, { promisify } from 'util';
import { Config } from '../config';

import {
  CORS_HEADERS,
  isExternalCorsRequest,
  isSimplePathSegment,
} from '../util';

export type MetadataOptions = Pick<Config, 'dataDir'>;

export function getRoutes(
  options: { router?: express.Router } & MetadataOptions
) {
  const router = options.router || express.Router();

  /* GET home page. */
  router.get('/', (req, res) => {
    res.status(401).send('Unathorised');
  });

  router.get('/:format/:id', createMetadataHandler(options.dataDir));

  return router;
}

function createMetadataHandler(dataDir: string) {
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
      for (const prop of ['id', 'format']) {
        if (!isSimplePathSegment(req.params[prop])) {
          res.status(BAD_REQUEST).json({
            error: util.format(`Bad ${prop}: ${req.params[prop]}`),
          });
          return;
        }
      }

      const jsonPath = path.join(dataDir, 'json', `${req.params.id}.json`);
      let data: ItemJSON;
      try {
        data = await loadJsonMetadata(jsonPath);
      } catch (e) {
        if (e?.nested?.code === 'ENOENT') {
          res.status(NOT_FOUND).json({
            error: `ID does not exist: ${req.params.id}`,
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
          typeof data.embeddable === 'boolean' &&
          !data.embeddable
        ) {
          res.status(FORBIDDEN).json({
            error: 'This item is only available from ' + 'cudl.lib.cam.ac.uk',
          });
          return;
        }

        res.json(data);
      } else {
        // This returns the original metadata.  We only want to return the metadata if
        // the metadataRights field is present (and non-empty) in the JSON.
        if (data?.descriptiveMetadata?.[0]?.metadataRights?.trim()) {
          // Return metadata
          res.contentType('text/plain');
          res.sendFile(
            path.join(
              dataDir,
              'data',
              req.params.format,
              req.params.id,
              `${req.params.id}.xml`
            )
          );
        } else {
          res.status(FORBIDDEN).json({
            error: util.format(
              'Access not allowed to requested metadata file.'
            ),
          });
        }
      }
    }
  );
}

interface UnknownObject {
  [key: string]: unknown;
}

interface ItemJSON {
  embeddable?: boolean;
  descriptiveMetadata: [
    {
      metadataRights?: string;
    }
  ];
}

function isItemJSON(data: unknown): data is ItemJSON {
  if (typeof data !== 'object') {
    return false;
  }
  const itemJSON = data as UnknownObject;

  return (
    (itemJSON.embeddable === undefined ||
      typeof itemJSON.embeddable === 'boolean') &&
    (itemJSON.descriptiveMetadata === undefined ||
      Array.isArray(itemJSON.descriptiveMetadata)) &&
    (itemJSON.descriptiveMetadata || []).every(
      dmd =>
        (typeof dmd === 'object' && dmd.metadataRights === undefined) ||
        typeof dmd.metadataRights === 'string'
    )
  );
}

async function loadJsonMetadata(path: string): Promise<ItemJSON> {
  try {
    const content = await promisify(fs.readFile)(path, 'utf-8');
    const data = JSON.parse(content);
    if (!isItemJSON(data)) {
      throw new Error('unexpected JSON structure');
    }
    return data;
  } catch (e) {
    throw new NestedError(`Failed to load metadata from ${path}: ${e}`, e);
  }
}
