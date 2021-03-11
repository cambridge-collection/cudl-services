import request from 'supertest';
import {leadingComponents} from '../../src/components/common';
import {Application, ComponentApp} from '../../src/app';
import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import {EXAMPLE_STATIC_FILES, STATIC_FILES} from '../constants';
import {StatusCodes} from 'http-status-codes';
import {promisify} from 'util';
import fs from 'fs';
import path from 'path';
import {mocked} from 'ts-jest/utils';
import {getPassport} from '../../src/components/api-key-auth';

describe('leading & trailing', () => {
  let componentApp: Application;
  let app: express.Application;

  beforeEach(async () => {
    jest.clearAllMocks();
    componentApp = await ComponentApp.from(leadingComponents());
    app = componentApp.expressApp;
  });

  describe('authentication', () => {
    test('is not registered by default', () => {
      expect(() => getPassport(app)).toThrowErrorMatchingSnapshot();
    });

    test('is registered if apiKeys are provided', async () => {
      const app = (
        await ComponentApp.from(
          leadingComponents({
            apiKeys: {secret: {email: 'foo@example.com', username: 'foo'}},
          })
        )
      ).expressApp;
      app.use(getPassport(app).authenticate('token'));
      app.use((req, res) => res.end());

      expect((await request(app).get('/')).status).toBe(
        StatusCodes.UNAUTHORIZED
      );
      expect(
        (await request(app).get('/').set('x-token', 'secret')).status
      ).toBe(StatusCodes.OK);
    });
  });

  test('favicon', async () => {
    const resp = await request(app).get('/favicon.ico');
    expect(resp.ok).toBeTruthy();
    expect(resp.type).toBe('image/x-icon');
  });

  describe('query parsing', () => {
    test('query strings are parsed with the simple parser', () => {
      expect(app.get('query parser')).toBe('simple');
    });

    test("the simple query parser doesn't produce nested objects", async () => {
      app.get(
        '/',
        expressAsyncHandler(async (req, resp) => {
          expect(req.query.a).toEqual(['1', '3']);
          expect(req.query.b).toEqual('2');
          expect(req.query['foo[bar]']).toEqual('baz');
          expect(req.query.foo).toBeUndefined();
          resp.send();
        })
      );
      await request(app).get('/?a=1&b=2&a=3&foo[bar]=baz');
      expect.assertions(4);
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

  test('json request bodies are parsed', async () => {
    app.post('/json', (req, res) => {
      expect(req.body).toEqual({json: true});
      res.end();
    });
    const resp = await request(app).post('/json').send({json: true});
    expect(resp.ok).toBeTruthy();
    expect.assertions(2);
  });

  test('urlencoded request bodies are parsed', async () => {
    app.post('/urlencoded', (req, res) => {
      expect(req.body).toEqual({a: '1', b: '2', foo: 'bar'});
      res.end();
    });
    const resp = await request(app)
      .post('/urlencoded')
      .type('urlencoded')
      .send('a=1&b=2&foo=bar');
    expect(resp.ok).toBeTruthy();
    expect.assertions(2);
  });

  test('cookies are parsed', async () => {
    app.get('/cookies', (req, res) => {
      expect(req.cookies).toEqual({foo: 'bar', bar: 'baz'});
      res.end();
    });
    const resp = await request(app)
      .get('/cookies')
      .set('Cookie', ['foo=bar', 'bar=baz']);
    expect(resp.ok).toBeTruthy();
    expect.assertions(2);
  });

  test('requests are logged', async () => {
    jest.spyOn(process.stdout, 'write');
    app.get('/foo', (req, res) => {
      res.end();
    });
    const resp = await request(app).get('/foo');
    expect(resp.ok).toBeTruthy();
    const output = mocked(process.stdout.write)
      .mock.calls.map(args => args[0])
      .join('');
    expect(output).toMatch(/GET \/foo .*200/);
  });

  test('trailing slashes on paths are removed via redirect', async () => {
    const resp = await request(app).get('/foo/');
    expect(resp.status).toBe(StatusCodes.MOVED_PERMANENTLY);
    expect(resp.headers.location).toBe('/foo');
  });

  test('unmatched requests 404', async () => {
    expect((await request(app).get('/foo')).status).toBe(StatusCodes.NOT_FOUND);
  });
});
