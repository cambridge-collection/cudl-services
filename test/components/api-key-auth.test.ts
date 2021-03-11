import express from 'express';
import {
  getPassport,
  passportApiKeyAuthenticationComponent,
  passportInitialiseComponent,
  Users,
} from '../../src/components/api-key-auth';
import passport from 'passport';
import request from 'supertest';
import {StatusCodes} from 'http-status-codes';

describe('getPassport', () => {
  test('throws if no Authenticator is set', () => {
    const app = express();
    expect(() => getPassport(app)).toThrowErrorMatchingSnapshot();
  });

  test('returns registered Authenticator', () => {
    const authenticator = new passport.Authenticator();
    const app = express();
    app.set('passport', authenticator);
    expect(getPassport(app)).toBe(authenticator);
  });
});

describe('passportApiKeyAuthenticationComponent', () => {
  const users: Users = {
    secret123: {username: 'bob', email: 'bob@example.com'},
  };
  let app: express.Express;
  beforeEach(async () => {
    app = express();
    await passportInitialiseComponent.register(app);
  });

  test.each([
    [undefined, StatusCodes.UNAUTHORIZED],
    ['invalidkey', StatusCodes.UNAUTHORIZED],
    ['secret123', StatusCodes.OK],
  ])('causes requests to be authenticated', async (key, expectedStatus) => {
    await passportApiKeyAuthenticationComponent(users).register(app);

    app.use(getPassport(app).authenticate('token'), (req, res) => {
      res.end(`user: ${JSON.stringify(req.user)}`);
    });

    let req = request(app).get('/');
    if (key !== undefined) {
      req = req.set('x-token', key);
    }
    const resp = await req;
    expect(resp.status).toBe(expectedStatus);
    if (resp.ok) {
      expect(resp.text).toMatchInlineSnapshot(
        '"user: {\\"username\\":\\"bob\\",\\"email\\":\\"bob@example.com\\"}"'
      );
    }
  });

  describe('registration', () => {
    test('throws if passport is not registered', async () => {
      await expect(
        passportApiKeyAuthenticationComponent(users).register(express())
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });
});
