import createDebugger from 'debug';
import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import {StatusCodes} from 'http-status-codes';
import {CORS_HEADERS, isEnumMember, requireRequestParam} from '../util';
import {XTF} from '../xtf';
import {embedMetadata, mapToJson, MetadataEmbedLevel} from './similarity-impl';
import {CUDLMetadataRepository} from '../metadata/cudl';

const debug = createDebugger('cudl-services:similarity');

export interface GetRouteOptions {
  router?: express.Router;
  metadataRepository: CUDLMetadataRepository;
  xtf: XTF;
}

export function getRoutes(options: GetRouteOptions): express.Handler {
  const router = options.router || express.Router();

  router.get(
    '/:itemid/:similarityId',
    createSimilarityHandler(options.metadataRepository, options.xtf)
  );

  return router;
}

function createSimilarityHandler(
  metadataRepository: CUDLMetadataRepository,
  xtf: XTF
) {
  return expressAsyncHandler(
    async (req: express.Request, res: express.Response) => {
      // Allow x-domain ajax access
      res.set(CORS_HEADERS);

      const item: string = requireRequestParam(req, 'itemid');
      const similarityId: string = requireRequestParam(req, 'similarityId');
      let metadataEmbedLevel: MetadataEmbedLevel;
      if (typeof req.query.embedMeta === 'string') {
        if (isEnumMember(MetadataEmbedLevel, req.query.embedMeta)) {
          metadataEmbedLevel = req.query.embedMeta as MetadataEmbedLevel;
        } else {
          res.status(StatusCodes.BAD_REQUEST).json({
            error: `Invalid embedMeta: available values are ${Object.values(
              MetadataEmbedLevel
            ).join(', ')}`,
          });
          return;
        }
      } else {
        metadataEmbedLevel = MetadataEmbedLevel.NONE;
      }

      let count: number | undefined = Number(req.query.count);
      count = isNaN(count) || count < 1 ? undefined : count;

      let resultXml;
      try {
        resultXml = await xtf.getSimilarItems(item, similarityId, count);
      } catch (e) {
        debug(`Failed to get response from XTF: ${e}`);
        res.status(StatusCodes.BAD_GATEWAY).json({
          error: 'Unable to get response from XTF',
        });
        return;
      }
      const results = mapToJson(resultXml);
      const resultsWithMeta = await embedMetadata(
        results,
        metadataEmbedLevel,
        metadataRepository
      );
      res.json(resultsWithMeta);
    }
  );
}
