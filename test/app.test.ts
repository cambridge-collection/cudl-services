import express from 'express';
import * as fs from 'fs';
import { IM_A_TEAPOT, OK, UNAUTHORIZED } from 'http-status-codes';
import * as path from 'path';
import request from 'supertest';
import { promisify } from 'util';

import { App, AppOptions } from '../src/app';
import { MetadataRepository } from '../src/metadata';
import {
  STATIC_FILES,
  EXAMPLE_STATIC_FILES,
  TEST_DATA_PATH,
} from './constants';
import { DummyHttpServer, MemoryDatabasePool } from './utils';

describe('app', () => {
  let mockDarwinUpstream: DummyHttpServer;
  let application: App;
  let app: express.Application;

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
      metadataRepository: new MetadataRepository(
        path.resolve(TEST_DATA_PATH, 'metadata')
      ),
      users: {
        supersecret: { username: 'foo', email: 'foo@example.com' },
      },
      databasePool: new MemoryDatabasePool({
        itemCollections: {
          'MS-ADD-03959': [
            { title: 'Foo', collectionOrder: 42, collectionID: 'foo' },
          ],
        },
      }),
    };
  }

  beforeEach(() => {
    mockDarwinUpstream.requestHandler.mockClear();
    application = new App(defaultAppOptions());
    app = application.expressApp;
  });

  describe('/v1/metadata', () => {
    test('route is registered', async () => {
      const response = await request(app).get('/v1/metadata/json/MS-ADD-03959');
      expect(response.status).toBe(OK);
      expect(response.get('content-type')).toMatch('application/json');
    });
  });

  describe('/v1/rdb/membership', () => {
    test('route is registered', async () => {
      const response = await request(app).get(
        '/v1/rdb/membership/collections/MS-ADD-03959'
      );
      expect(response.status).toBe(OK);
      expect(response.text).toMatch(`<title>Foo</title>`);
      expect(response.text).toMatch(`<collectionorder>42</collectionorder>`);
      expect(response.text).toMatch(`<collectionid>foo</collectionid>`);
    });
  });

  describe('/v1/darwin', () => {
    test('unauthenticated requests are rejected', async () => {
      const response = await request(app).get('/v1/darwin/foo?bar=baz');
      expect(response.status).toBe(UNAUTHORIZED);
    });

    test('authenticated requests with bad credentials are rejected', async () => {
      const response = await request(app)
        .get('/v1/darwin/foo?bar=baz')
        .set('x-token', 'not-a-valid-key');
      expect(response.status).toBe(UNAUTHORIZED);
    });

    test('authenticated requests with valid credentials are accepted', async () => {
      const response = await request(app)
        .get('/v1/darwin/foo?bar=baz')
        .set('x-token', 'supersecret');
      expect(response.status).toBe(IM_A_TEAPOT);
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
        expect(response.status).toBe(OK);
        expect(response.type).toBe(resource.type);

        expect(response.body).toEqual(
          await promisify(fs.readFile)(
            path.resolve(STATIC_FILES, resource.path)
          )
        );
      }
    );
  });
});