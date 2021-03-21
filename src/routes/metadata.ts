import express, {Response} from 'express';
import expressAsyncHandler from 'express-async-handler';
import {StatusCodes} from 'http-status-codes';
import util from 'util';
import {
  IsExternalAccessPermitted,
  IsExternalEmbedPermitted,
  MetadataPredicate,
  MetadataProvider,
  MetadataResponse,
} from '../metadata';

import {
  applyLazyDefaults,
  CORS_HEADERS,
  ExternalCorsRequestMatcher,
  isSimplePathSegment,
} from '../util';
import {ErrorCategories, isTagged} from '../errors';

export interface MetadataResponseEmitter {
  canEmit(metadataResponse: MetadataResponse): boolean;
  emit(metadataResponse: MetadataResponse, resp: Response): Promise<void>;
}

export interface GetRoutesOptions {
  router?: express.Router;
  metadataProviders: ReadonlyMap<string, MetadataProvider>;
  isExternalEmbedPermitted?: MetadataPredicate;
  isExternalAccessPermitted?: MetadataPredicate;
  isExternalCorsRequest: ExternalCorsRequestMatcher;
  metadataEmitters?: Array<MetadataResponseEmitter>;
}

type CreateMetadataHandlerOptions = Omit<Required<GetRoutesOptions>, 'router'>;

export function getRoutes(options: GetRoutesOptions): express.Handler {
  const {router, ...handlerOptions} = applyLazyDefaults(options, {
    router: () => express.Router(),
    isExternalEmbedPermitted: () => IsExternalEmbedPermitted,
    isExternalAccessPermitted: () => IsExternalAccessPermitted,
    metadataEmitters: () => [],
  });

  /* GET home page. */
  router.get('/', (req, res) => {
    res.status(StatusCodes.UNAUTHORIZED).send('Unathorised');
  });

  router.get('/:format/:id', createMetadataHandler(handlerOptions));

  return router;
}

function createMetadataHandler(options: CreateMetadataHandlerOptions) {
  return expressAsyncHandler(async (req, res) => {
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
      res.status(StatusCodes.BAD_REQUEST).json({
        error: util.format(`Bad id: ${id}`),
      });
      return;
    }

    const provider = options.metadataProviders.get(format);
    if (!provider) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: `Bad format: ${format}`,
      });
      return;
    }

    let metadata: MetadataResponse;
    try {
      metadata = await provider.query(id);
    } catch (e) {
      if (isTagged(e) && new Set(e.tags).has(ErrorCategories.NotFound)) {
        res.status(StatusCodes.NOT_FOUND).json({
          error: `ID does not exist: ${id}`,
        });
        return;
      }
      throw e;
    }

    // If the request is an external CORS request we'll restrict
    // access to items which are not embeddable. This prevents
    // external sites using CORS request to get at non-embeddable
    // content, while allowing cudl itself to get at it. Note that
    // there's nothing to stop someone setting up a proxy which
    // strips or fakes the origin header.
    if (
      options.isExternalCorsRequest(req) &&
      (await options.isExternalEmbedPermitted(metadata)) === false
    ) {
      res.status(StatusCodes.FORBIDDEN).json({
        error: `This metadata is only available from ${options.isExternalCorsRequest.internalDomainNameMatcher.describeMatchingDomains()}`,
      });
      return;
    }

    if ((await options.isExternalAccessPermitted(metadata)) === false) {
      res.status(StatusCodes.FORBIDDEN).json({
        error: util.format('Access not allowed to requested metadata'),
      });
      return;
    }

    for (const emitter of options.metadataEmitters) {
      if (emitter.canEmit(metadata)) {
        await emitter.emit(metadata, res);
        return;
      }
    }
    // Send metadata as UTF-8 text if not specifically handled
    res.contentType('text/plain; charset=utf-8');
    res.send((await metadata.getBytes()).toString('utf-8'));
  });
}
