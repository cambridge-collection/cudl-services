import {fnComponent, Component} from '../app';
import passport from 'passport';
import express from 'express';

const AccessTokenStrategy = require('passport-accesstoken').Strategy;

export interface Users<U = User> {
  [apiKey: string]: U;
}

export interface User {
  username: string;
  email: string;
}

export function passportApiKeyAuthenticationComponent(users: Users) {
  return fnComponent(express => {
    getPassport(express)
      .use(
        new AccessTokenStrategy(
          (token: string, done: (err: unknown, user: unknown) => void) => {
            process.nextTick(() => {
              const user = findByApiKey(users, token);
              return done(null, user || false);
            });
          }
        )
      )
      .serializeUser((user, done) => {
        done(null, user);
      });
  });
}

function findByApiKey(users: Users, apiKey: string): User | null {
  if (apiKey in users) {
    return users[apiKey];
  }
  return null;
}

export const passportInitialiseComponent: Component = fnComponent(express => {
  const localPassport = new passport.Authenticator();
  express.set('passport', localPassport);
  express.use(localPassport.initialize());
});

export function getPassport(app: express.Application): passport.Authenticator {
  const localPassport = app.get('passport');
  if (localPassport !== undefined && typeof localPassport === 'object') {
    return localPassport as passport.Authenticator;
  }
  throw new Error(
    'express app has no passport Authenticator on the "passport" setting. Has the passportInitialiseComponent been registered?'
  );
}
