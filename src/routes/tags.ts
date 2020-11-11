import accepts from 'accepts';
import stringify from 'csv-stringify';
import csvStringify from 'csv-stringify';
import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import { StatusCodes } from 'http-status-codes';
import util from 'util';
import xml2js from 'xml2js';
import { DAOPool } from '../db';
import { ValueError } from '../errors';
import { compare, isEnumMember, sorted, validateEnumMember } from '../util';
import {
  ItemTags,
  loadTags,
  NamedTagSources,
  selectTagSources,
  TagsDAO,
  TagSource,
} from './tags-impl';

export function getRoutes(options: {
  router?: express.Router;
  daoPool: DAOPool<TagsDAO>;
}) {
  const router = options.router || express.Router();
  const { daoPool } = options;

  router.get(
    ['/:classmark.:ext(json|xml|txt|csv)', '/:classmark'],
    expressAsyncHandler(async (req, res, next) => {
      const tagSources = getTagSources(await daoPool.getInstance());
      await sendTagResponse({
        req,
        res,
        sources: tagSources,
        sourceNames: req.query.sources,
        fixedResponseType:
          req.params.ext === undefined
            ? undefined
            : validateEnumMember(ResponseType, req.params.ext),
      });
    })
  );

  return router;
}

export enum ResponseType {
  JSON = 'json',
  XML = 'xml',
  TEXT = 'txt',
  CSV = 'csv',
}

export enum TagSourceName {
  THIRD_PARTY = '3rd-party',
  ANNOTATIONS = 'annotations',
  USER_REMOVES = 'user-removes',
}
const DEFAULT_TAG_SOURCE_NAMES: TagSourceName[] = Object.values(TagSourceName);

function getTagSources(dao: TagsDAO): NamedTagSources<TagSourceName> {
  return {
    [TagSourceName.THIRD_PARTY]: TagSource.fromTagsDAO(
      dao,
      'thirdPartyTags',
      1
    ),
    [TagSourceName.ANNOTATIONS]: TagSource.fromTagsDAO(
      dao,
      'annotationTags',
      1 / 5
    ),
    [TagSourceName.USER_REMOVES]: TagSource.fromTagsDAO(
      dao,
      'removedTags',
      1 / 5
    ),
  };
}

async function sendTagResponse(options: {
  req: express.Request;
  res: express.Response;
  sources: NamedTagSources<TagSourceName>;
  sourceNames: string | undefined;
  fixedResponseType?: ResponseType;
}) {
  const { req, res, sources, sourceNames, fixedResponseType } = options;
  try {
    const selectedSources = selectTagSources(
      sources,
      sourceNames || DEFAULT_TAG_SOURCE_NAMES
    );

    const classmark = req.params.classmark as string | undefined;
    if (!classmark) {
      throw new ValueError('req has no classmark param');
    }

    const itemTags = await loadTags(selectedSources, classmark);
    const response = await getNegotiatedResponse({
      req,
      itemTags,
      fixedResponseType,
    });
    sendResponse(res, response);
  } catch (e) {
    handleErrors(res, e);
  }
}

const xmlBuilder = new xml2js.Builder();

async function getNegotiatedResponse(options: {
  req: express.Request;
  itemTags: ItemTags;
  fixedResponseType?: ResponseType;
}): Promise<Response> {
  const { req, itemTags, fixedResponseType } = options;
  const accept = accepts(req);

  let negotiatedType =
    fixedResponseType || accept.type(Object.values(ResponseType));
  if (negotiatedType === false) {
    negotiatedType = ResponseType.TEXT;
  }
  if (
    Array.isArray(negotiatedType) ||
    !isEnumMember(ResponseType, negotiatedType)
  ) {
    throw new ValueError(
      `Unexpected negotiated response type: ${util.inspect(negotiatedType)}`
    );
  }

  switch (negotiatedType) {
    case ResponseType.JSON:
      const tagObj = itemTags.tags.asObject();
      const json = {
        tags: tagObj,
        count: tagObj.length,
        id: itemTags.id,
      };
      return {
        type: 'application/json',
        body: JSON.stringify(json),
      };
    case ResponseType.XML:
      const tags = Array.from(itemTags.tags.getTags());
      const xml = {
        tags: {
          $: {
            count: tags.length,
            id: itemTags.id,
          },
          tag: tags.map(tagName => {
            return {
              $: {
                value: itemTags.tags.getValue(tagName),
              },
              _: tagName,
            };
          }),
        },
      };

      xml.tags.tag = sorted(xml.tags.tag, tag => [
        [compare.desc, tag.$.value],
        tag._,
      ]);

      return {
        type: 'application/xml',
        body: xmlBuilder.buildObject(xml),
      };
    case ResponseType.CSV:
    /* falls through */
    case ResponseType.TEXT:
    /* falls through */
    default:
      const rows = sorted(itemTags.tags, ([name, value]) => [
        [compare.desc, value],
        name,
      ]);

      const csv = await util.promisify(
        csvStringify as CSVStringifyValueOptions
      )(rows, {
        header: true,
        columns: ['tag', 'value'],
      });

      if (csv === undefined) {
        throw new Error('failed to generate CSV');
      }

      return {
        type: negotiatedType === ResponseType.CSV ? 'text/csv' : 'text/plain',
        body: csv,
      };
  }
}

type CSVStringifyValueOptions = (
  input: stringify.Input,
  options?: stringify.Options,
  callback?: stringify.Callback
) => stringify.Stringifier;

interface Response {
  type: string;
  body: string;
}

function sendResponse(res: express.Response, responseData: Response) {
  res.set('Content-Type', responseData.type).send(responseData.body);
}

function handleErrors(res: express.Response, error: unknown) {
  if (error instanceof ValueError) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .type('text/plain')
      .send(`Bad request: ${error.message}`);
  } else {
    throw error;
  }
}
