import express from 'express';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

import {getRoutes} from '../../src/routes/darwin';
import {DummyHttpServer} from '../utils';

function getTestApp(routePrefix: string, darwinXtfUrl: string) {
  const app = express();
  app.use(routePrefix, getRoutes({darwinXtfUrl}));
  return app;
}

// Requests to the darwin proxy endpoint look like this:
// /v1/darwin/view?docId=letters/DCP-LETT-10362F.xml;query=Linnean%20Society;brand=default;hit.rank=4
// /v1/darwin/search?keyword=Linnean%20Society;foo=bar

describe('darwin proxy /*', () => {
  // We test the proxy by setting up a temporary HTTP server to act as the
  // upstream.
  let dummyUpstream: DummyHttpServer;

  async function startMockHttpBackend() {
    dummyUpstream = new DummyHttpServer();
    await dummyUpstream.start();
  }

  beforeEach(async () => {
    await startMockHttpBackend();
  });

  afterEach(async () => {
    if (dummyUpstream) {
      await dummyUpstream.stop();
    }
  });

  test.each([
    [
      '',
      'view?docId=letters/DCP-LETT-10362F.xml;query=Foo%20Bar;brand=default;hit.rank=4',
    ],
    ['', 'search?keyword=Foo%20Bar;f1-correspondent=Darwin%2C%20C.%20R.'],
    [
      '/some/path',
      'view?docId=letters/DCP-LETT-10362F.xml;query=Foo%20Bar;brand=default;hit.rank=4',
    ],
    [
      '/some/path',
      'search?keyword=Foo%20Bar;f1-correspondent=Darwin%2C%20C.%20R.',
    ],
  ])('GET /v1/darwin/%s', async (xtfPathPrefix, requestPath) => {
    dummyUpstream.requestHandler.mockClear();

    const routePrefix = '/v1/darwin';
    const app = getTestApp(
      routePrefix,
      `http://localhost:${dummyUpstream.getPort()}${xtfPathPrefix}`
    );

    const response = await request(app).get(`${routePrefix}/${requestPath}`);
    expect(response.status).toBe(StatusCodes.IM_A_TEAPOT);
    expect(response.text).toBe('foobar');
    expect(dummyUpstream.requestHandler.mock.calls.length).toBe(1);
    const [req] = dummyUpstream.requestHandler.mock.calls[0];
    expect(req.url).toBe(`${xtfPathPrefix}/${requestPath}`);
  });
});
