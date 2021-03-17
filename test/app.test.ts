import expressAsyncHandler from 'express-async-handler';

import express from 'express';
import * as fs from 'fs';
import {StatusCodes} from 'http-status-codes';
import * as path from 'path';
import request from 'supertest';
import {mocked} from 'ts-jest/utils';
import {promisify} from 'util';

import 'jest-extended';

import {
  App,
  AppOptions,
  Component,
  ComponentApp,
  fnComponent,
  MiddlewareComponent,
  registerComponents,
  ResourceCleanupComponent,
  SettingsComponent,
} from '../src/app';
import {embedMetadata} from '../src/routes/similarity-impl';
import {TagSourceName} from '../src/routes/tags';
import {SimilaritySearch} from '../src/transforms/similarity';
import {XTF} from '../src/xtf';
import {
  EXAMPLE_STATIC_FILES,
  EXAMPLE_ZACYNTHIUS_URL,
  STATIC_FILES,
} from './constants';
import {mockGetResponder} from './mocking/superagent-mocking';
import {
  DummyHttpServer,
  getMockXTF,
  getTestDataMetadataRepository,
  MemoryCollectionsDAO,
  MemoryDatabasePool,
  MemoryTagsDAO,
} from './utils';
import {Resource} from '../src/resources';

jest.mock('../src/routes/similarity-impl');

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
      users: {
        supersecret: {username: 'foo', email: 'foo@example.com'},
      },
      collectionsDAOPool: MemoryDatabasePool.createPooledDAO(
        MemoryCollectionsDAO,
        {
          'MS-ADD-03959': [
            {title: 'Foo', collectionOrder: 42, collectionID: 'foo'},
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

  describe('query parsing', () => {
    test('query strings are parsed with the simple parser', () => {
      expect(app.get('query parser')).toBe('simple');
    });

    test("the simple query parser doesn't produce nested objects", async () => {
      const testApp = express();
      testApp.set('query parser', 'simple');
      testApp.get(
        '/',
        expressAsyncHandler(async (req, resp) => {
          expect(req.query.a).toEqual(['1', '3']);
          expect(req.query.b).toEqual('2');
          expect(req.query['foo[bar]']).toEqual('baz');
          expect(req.query.foo).toBeUndefined();
          resp.send();
        })
      );
      await request(testApp).get('/?a=1&b=2&a=3&foo[bar]=baz');
      expect.assertions(4);
    });
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
      expect(response.text).toMatch('<title>Foo</title>');
      expect(response.text).toMatch('<collectionorder>42</collectionorder>');
      expect(response.text).toMatch('<collectionid>foo</collectionid>');
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
      async (resource: {path: string; type: string}) => {
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
      expect(response.body).toEqual({example: 'example'});
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

describe('MiddlewareComponent', () => {
  let expressApp: express.Application;
  const handlerFn: express.Handler = jest.fn((req, res, next) => next());
  const handlerParams: Array<
    [
      express.RequestHandler[] | express.RequestHandler | express.Application,
      number
    ]
  > = [
    [handlerFn, 1],
    [[handlerFn, handlerFn], 2],
    [
      (() => {
        const app = express();
        app.use(handlerFn);
        return app;
      })(),
      1,
    ],
  ];
  beforeEach(() => {
    expressApp = express();
    mocked(handlerFn).mockClear();
  });

  test.each(handlerParams)(
    'is registered with express at specified path',
    async (handler, times) => {
      const component = new MiddlewareComponent({
        path: '/foo',
        handler: handler,
      });
      await component.register(expressApp);
      await request(expressApp).get('/foo');
      expect(handlerFn).toHaveBeenCalledTimes(times);
      await request(expressApp).get('/bar');
      expect(handlerFn).toHaveBeenCalledTimes(times);
    }
  );

  test.each(handlerParams)(
    'is registered with express without a path',
    async (handler, times) => {
      const component = new MiddlewareComponent({
        handler: handler,
      });

      await component.register(expressApp);
      await request(expressApp).get('/foo');
      expect(handlerFn).toHaveBeenCalledTimes(times);
      await request(expressApp).get('/bar');
      expect(handlerFn).toHaveBeenCalledTimes(2 * times);
    }
  );
});

describe('SettingsComponent', () => {
  test('holds provided settings', () => {
    const settings = {a: 1, b: 2};
    expect([...new SettingsComponent(settings).settings.entries()]).toEqual(
      Object.entries(settings)
    );
  });
  test('sets settings on app', async () => {
    const app = express();
    const settings = {
      foo: 'bar',
      bar: 'baz',
      baz: 42,
      boz: {a: 1},
    };
    await new SettingsComponent(settings).register(app);
    for (const [key, value] of Object.entries(settings)) {
      expect(app.get(key)).toEqual(value);
    }
  });
});

describe('fnComponent', () => {
  test('is applied to app when registered', async () => {
    const fn = jest.fn();
    const app = express();
    const comp = fnComponent(fn);
    expect(fn).not.toHaveBeenCalled();
    await comp.register(app);
    expect(fn).toHaveBeenCalledWith(app);
  });

  test('supplied function can return in order to avoid requiring braces', async () => {
    await fnComponent(() => true).register(express());
  });

  test('supplied function can be async', async () => {
    const asyncDependency = (async () => 42)();
    const app = express();
    await fnComponent(async app =>
      app.set('foo', await asyncDependency)
    ).register(app);
    expect(app.get('foo')).toBe(42);
  });
});

describe('ResourceCleanupComponent', () => {
  const MockResource = jest.fn<Resource, []>(() => ({close: jest.fn()}));

  test('closes held Resource when closed', async () => {
    const resource = new MockResource();
    const cleanup = new ResourceCleanupComponent(resource);

    expect(resource.close).not.toHaveBeenCalled();
    await cleanup.close();
    expect(resource.close).toHaveBeenCalled();
  });

  test('closes all resources from closing() factory function', async () => {
    const a = new MockResource();
    const b = new MockResource();
    const cleanup = ResourceCleanupComponent.closing(a, b);

    expect(a.close).not.toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    await cleanup.close();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  test('register() fails if already closed', async () => {
    const cleanup = ResourceCleanupComponent.closing();
    await cleanup.close();

    await expect(() =>
      cleanup.register()
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"operation on closed resource"'
    );
  });
});

describe('registerComponents', () => {
  const onRegister = jest.fn();
  const MockComponent = jest.fn<Component, [string]>(id => ({
    async register(app: express.Application): Promise<void> {
      onRegister(app, id);
    },
    async close(): Promise<void> {},
  }));

  test('registers components in order provided', async () => {
    const app = express();
    const a = MockComponent('a');
    const b = MockComponent('b');
    const c = MockComponent('c');
    const d = MockComponent('d');

    await expect(registerComponents(app, a, b, [c, [[d]]])).resolves.toEqual({
      app,
      flatComponents: [a, b, c, d],
    });
    expect(onRegister.mock.calls).toEqual([
      [app, 'a'],
      [app, 'b'],
      [app, 'c'],
      [app, 'd'],
    ]);
  });
});

describe('ComponentApp', () => {
  const components = [
    new SettingsComponent({a: 1}),
    new SettingsComponent({b: 1}),
    new SettingsComponent({c: 1}),
  ];
  test('holds provided components', async () => {
    const app = await ComponentApp.from(components[0], [
      components[1],
      [components[2]],
    ]);
    expect(app.components).toEqual(components);
  });

  test('registers components', async () => {
    const app = await ComponentApp.from(...components);
    expect(app.expressApp.settings).toContainEntries([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
  });

  test('close() closes app & components', async () => {
    const app = await ComponentApp.from(...components);
    expect(app.isClosed()).not.toBeTruthy();
    expect(components.every(c => !c.isClosed())).toBeTruthy();
    await app.close();
    expect(app.isClosed()).toBeTruthy();
    expect(components.every(c => c.isClosed())).toBeTruthy();
  });
});
