import express from 'express';
import { FORBIDDEN, IM_A_TEAPOT, UNAUTHORIZED } from 'http-status-codes';
import request from 'supertest';

import { getApp } from '../src/app';
import { Config } from '../src/config';
import { TEST_DATA_PATH } from './constants';
import { DummyHttpServer } from './utils';

describe('app', () => {
  let mockDarwinUpstream: DummyHttpServer;
  let config: Config;
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

  function defaultTestConfig(): Config {
    return {
      darwinXTF: `http://localhost:${mockDarwinUpstream.getPort()}`,
      dataDir: TEST_DATA_PATH,
      users: {
        supersecret: { username: 'foo', email: 'foo@example.com' },
      },
    };
  }

  beforeEach(() => {
    mockDarwinUpstream.requestHandler.mockClear();
    config = defaultTestConfig();
    app = getApp(config);
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
