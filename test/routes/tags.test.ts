function createMockTagsImpl() {
  // Only mock loadTags()
  return {
    ...jest.requireActual('../../src/routes/tags-impl'),
    loadTags: jest.fn(),
  };
}
jest.mock('../../src/routes/tags-impl', createMockTagsImpl);

import {AssertionError} from 'assert';
import express from 'express';
import {StatusCodes} from 'http-status-codes';
import supertest from 'supertest';
import request from 'supertest';
import {mocked} from 'ts-jest/utils';
import {promisify} from 'util';
import {getRoutes, ResponseType, TagSourceName} from '../../src/routes/tags';
import {DefaultTagSet, loadTags, TagsDAO} from '../../src/routes/tags-impl';
import {compare, sorted} from '../../src/util';
import {getAttribute, product, SingletonDAOPool} from '../utils';
import xml2js from 'xml2js';
import neatCsv from 'neat-csv';

const EMPTY_TAG_SET = new DefaultTagSet();

const MIME_TYPES = {
  [ResponseType.JSON]: 'application/json',
  [ResponseType.XML]: 'application/xml',
  [ResponseType.CSV]: 'text/csv',
  [ResponseType.TEXT]: 'text/plain',
};

const TAG_SOURCE_COMBINATIONS = [
  [TagSourceName.THIRD_PARTY],
  [TagSourceName.USER_REMOVES],
  [TagSourceName.ANNOTATIONS],
  [TagSourceName.THIRD_PARTY, TagSourceName.USER_REMOVES],
  [TagSourceName.THIRD_PARTY, TagSourceName.ANNOTATIONS],
  [TagSourceName.USER_REMOVES, TagSourceName.ANNOTATIONS],
  [
    TagSourceName.THIRD_PARTY,
    TagSourceName.USER_REMOVES,
    TagSourceName.ANNOTATIONS,
  ],
];

async function parseResponseTags(
  classmark: string,
  response: supertest.Response
) {
  if (response.type === 'application/json') {
    return {
      id: getAttribute(response.body, 'id'),
      tags: sorted(
        Object.entries(
          getAttribute(response.body, 'tags') as Record<string, number>
        ),
        ([name, value]) => [[compare.desc, value], name]
      ),
    };
  } else if (response.type === 'application/xml') {
    const body = await promisify(xml2js.parseString)(response.text);
    return {
      id: getAttribute(body, 'tags', '$', 'id'),
      tags: (getAttribute(body, 'tags', 'tag') as unknown[]).map(t => [
        getAttribute(t, '_'),
        Number(getAttribute(t, '$', 'value')),
      ]),
    };
  } else if (response.type === 'text/plain' || response.type === 'text/csv') {
    const tags = await neatCsv(response.text);
    return {
      id: classmark,
      tags: tags.map(row => [row.tag, Number(row.value)]),
    };
  }
  throw new AssertionError({message: 'Unexpected response type'});
}

describe('tag routes /:classmark', () => {
  const dao: TagsDAO = {
    removedTags: jest.fn(() => Promise.resolve(EMPTY_TAG_SET)),
    annotationTags: jest.fn(() => Promise.resolve(EMPTY_TAG_SET)),
    thirdPartyTags: jest.fn(() => Promise.resolve(EMPTY_TAG_SET)),
  };

  function getTestApp() {
    const app = express();
    app.use('/', getRoutes({daoPool: SingletonDAOPool.containing(dao)}));
    return app;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('requesting an unknown source results in HTTP BAD REQUEST', async () => {
    const result = await request(getTestApp()).get('/MS-FOO?sources=foo');
    expect(result.status).toBe(StatusCodes.BAD_REQUEST);
    expect(result.type).toBe('text/plain');
    expect(result.text).toBe(
      "\
Bad request: no tag source exists with name: 'foo', available sources: 3rd-party, annotations, user-removes"
    );
  });

  test.each(
    Array.from(
      product(
        ['accept-header', 'extension'],
        [
          ResponseType.JSON,
          ResponseType.XML,
          ResponseType.CSV,
          ResponseType.TEXT,
        ],
        TAG_SOURCE_COMBINATIONS.map(sources => sources.join(','))
      )
    )
  )(
    'tags can be requested in format: %s from sources: %s',
    async (method, format, sources) => {
      mocked(loadTags).mockResolvedValueOnce({
        id: 'MS-FOO',
        tags: new DefaultTagSet([
          ['foo', 42],
          ['bar', 24],
          ['abc', 42],
        ]),
      });

      const extension = method === 'extension' ? `.${format}` : '';

      let req = request(getTestApp()).get(
        `/MS-FOO${extension}?sources=${sources}`
      );
      if (method === 'accept-header') {
        req = req.set({accept: MIME_TYPES[format]});
      }

      const response = await req;

      expect(response.ok).toBeTruthy();
      expect(response.type).toBe(MIME_TYPES[format]);
      expect(await parseResponseTags('MS-FOO', response)).toEqual({
        id: 'MS-FOO',
        tags: [
          ['abc', 42],
          ['foo', 42],
          ['bar', 24],
        ],
      });
    }
  );
});
