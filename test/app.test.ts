import express from 'express';
import request from 'supertest';
import {mocked} from 'ts-jest/utils';

import 'jest-extended';

import {
  Component,
  ComponentApp,
  fnComponent,
  MiddlewareComponent,
  registerComponents,
  ResourceCleanupComponent,
  SettingsComponent,
} from '../src/app';
import {Resource} from '../src/resources';

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
