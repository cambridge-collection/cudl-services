import express from 'express';
import { IM_A_TEAPOT, OK, UNAUTHORIZED } from 'http-status-codes';
import * as path from 'path';
import request from 'supertest';

import { AppOptions, getApp } from '../src/app';
import { MetadataRepository } from '../src/metadata';
import { TEST_DATA_PATH } from './constants';
import { DummyHttpServer, MemoryDatabase } from './utils';

describe('app', () => {
  let mockDarwinUpstream: DummyHttpServer;
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
      database: new MemoryDatabase({
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
    app = getApp(defaultAppOptions());
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
});
