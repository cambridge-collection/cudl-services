jest.mock('../src/routes/similarity-impl');

import express from 'express';
import * as fs from 'fs';
import { StatusCodes } from 'http-status-codes';
import * as path from 'path';
import request from 'supertest';
import { mocked } from 'ts-jest/utils';
import { promisify } from 'util';

import { App, AppOptions } from '../src/app';
import { embedMetadata } from '../src/routes/similarity-impl';
import { TagSourceName } from '../src/routes/tags';
import { SimilaritySearch } from '../src/transforms/similarity';
import { XTF } from '../src/xtf';
import {
  EXAMPLE_STATIC_FILES,
  EXAMPLE_ZACYNTHIUS_URL,
  STATIC_FILES,
} from './constants';
import { mockGetResponder } from './mocking/superagent-mocking';
import {
  DummyHttpServer,
  getMockXTF,
  getTestDataLegacyDarwinMetadataRepository,
  getTestDataMetadataRepository,
  MemoryCollectionsDAO,
  MemoryDatabasePool,
  MemoryTagsDAO,
} from './utils';

describe('app', () => {
  let mockDarwinUpstream: DummyHttpServer;
  let application: App;
  let app: express.Application;
  let xtf: XTF;

  beforeAll(async () => {
    mockDarwinUpstream = new DummyHttpServer();
    await mockDarwinUpstream.start();
  });

  afterAll(async () => {
    if (mockDarwinUpstream) {
      await mockDarwinUpstream.stop();
    }
  });

  function defaultAppOptions(): AppOptions {
    return {
      darwinXtfUrl: `http://localhost:${mockDarwinUpstream.getPort()}`,
      metadataRepository: getTestDataMetadataRepository(),
      legacyDarwinMetadataRepository: getTestDataLegacyDarwinMetadataRepository(),
      users: {
        supersecret: { username: 'foo', email: 'foo@example.com' },
      },
      collectionsDAOPool: MemoryDatabasePool.createPooledDAO(
        MemoryCollectionsDAO,
        {
          'MS-ADD-03959': [
            { title: 'Foo', collectionOrder: 42, collectionID: 'foo' },
          ],
        }
      ),
      tagsDAOPool: MemoryDatabasePool.createPooledDAO(MemoryTagsDAO, {
        'MS-FOO': {
          [TagSourceName.THIRD_PARTY]: [
            ['foo', 42],
            ['bar', 1],
          ],
          [TagSourceName.ANNOTATIONS]: [
            ['foo', -10],
            ['bar', -5],
          ],
          [TagSourceName.USER_REMOVES]: [['bar', 5]],
        },
      }),
      xtf,
      zacynthiusServiceURL: EXAMPLE_ZACYNTHIUS_URL,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    xtf = getMockXTF();
    application = new App(defaultAppOptions());
    app = application.expressApp;
  });

  describe('/v1/metadata', () => {
    test('route is registered', async () => {
      const response = await request(app).get('/v1/metadata/json/MS-ADD-03959');
      expect(response.status).toBe(StatusCodes.OK);
      expect(response.get('content-type')).toMatch('application/json');
    });
  });

  describe('/v1/rdb/membership', () => {
    test('route is registered', async () => {
      const response = await request(app).get(
        '/v1/rdb/membership/collections/MS-ADD-03959'
      );
      expect(response.status).toBe(StatusCodes.OK);
      expect(response.text).toMatch(`<title>Foo</title>`);
      expect(response.text).toMatch(`<collectionorder>42</collectionorder>`);
      expect(response.text).toMatch(`<collectionid>foo</collectionid>`);
    });
  });

  describe('/v1/darwin', () => {
    test('unauthenticated requests are rejected', async () => {
      const response = await request(app).get('/v1/darwin/foo?bar=baz');
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test('authenticated requests with bad credentials are rejected', async () => {
      const response = await request(app)
        .get('/v1/darwin/foo?bar=baz')
        .set('x-token', 'not-a-valid-key');
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test('authenticated requests with valid credentials are accepted', async () => {
      const response = await request(app)
        .get('/v1/darwin/foo?bar=baz')
        .set('x-token', 'supersecret');
      expect(response.status).toBe(StatusCodes.IM_A_TEAPOT);
      expect(response.text).toBe('foobar');
    });
  });

  describe('static files', () => {
    test.each(Object.values(EXAMPLE_STATIC_FILES).map(sf => [sf]))(
      'static file %o is served',
      async (resource: { path: string; type: string }) => {
        const response = await request(app)
          .get(`/${resource.path}`)
          .responseType('blob');
        expect(response.status).toBe(StatusCodes.OK);
        expect(response.type).toBe(resource.type);

        expect(response.body).toEqual(
          await promisify(fs.readFile)(
            path.resolve(STATIC_FILES, resource.path)
          )
        );
      }
    );
  });

  describe('/v1/transcription', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('route is registered', async () => {
      const html =
        '<!DOCTYPE html><html><head><title>foo</title></head><body></body></html>';
      mockGetResponder.mockResolvedValueOnce({
        status: 200,
        text: html,
        body: Buffer.from(html, 'utf8'),
        type: 'text/html',
        ok: true,
        serverError: false,
      });

      const response = await request(app).get(
        '/v1/transcription/newton/normalized/external/foo/bar/baz'
      );
      expect(response.ok).toBeTruthy();
      expect(response.text).toBe(html);
    });
  });

  describe('/v1/similarity', () => {
    test('route is registered', async () => {
      mocked(embedMetadata).mockResolvedValueOnce(({
        example: 'example',
      } as unknown) as SimilaritySearch);
      const response = await request(app).get('/v1/xtf/similarity/MS-FOO/3');
      expect(response.ok).toBeTruthy();
      expect(response.body).toEqual({ example: 'example' });
    });
  });

  describe('/v1/tags', () => {
    test('route is registered', async () => {
      const response = await request(app).get('/v1/tags/MS-FOO');
      expect(response.ok).toBeTruthy();
      expect(response.body).toEqual({
        id: 'MS-FOO',
        tags: {
          foo: 40,
          bar: 1,
        },
      });
    });
  });
});
