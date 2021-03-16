import * as darwin from '../../src/routes/darwin';
import {
  DarwinProxyComponentOptions,
  darwinProxyComponents,
} from '../../src/components/darwin-correspondence-project';
import {URL} from 'url';
import {mocked} from 'ts-jest/utils';
import {registerComponents} from '../../src/app';
import express from 'express';
import request from 'supertest';
import passport from 'passport';

jest.mock('../../src/routes/darwin');
jest.mock('passport');

describe('darwinProxyComponents', () => {
  const options: DarwinProxyComponentOptions = {
    darwinXtfUrl: new URL('http://mock/'),
  };
  const mockAuthenticator = new passport.Authenticator();

  test('registers routes/darwin#getRoutes at /v1/darwin', async () => {
    mocked(darwin.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
    const mockAuthenticationHandler: express.Handler = (req, res, next) => {
      res.setHeader('passport', 'was here');
      next();
    };
    mocked(mockAuthenticator.authenticate).mockReturnValueOnce(
      mockAuthenticationHandler
    );

    const app = express();
    app.set('passport', mockAuthenticator);

    await registerComponents(app, darwinProxyComponents(options));

    expect(mocked(darwin.getRoutes).mock.calls[0][0]).toEqual({
      darwinXtfUrl: 'http://mock/',
    });
    const resp = await request(app).get('/v1/darwin');
    expect(resp.headers.passport).toEqual('was here');
    expect(resp.text).toEqual('mock');
  });
});
