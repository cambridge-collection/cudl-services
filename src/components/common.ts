import {Component, MiddlewareComponent, SettingsComponent} from '../app';
import path from 'path';
import bodyParser from 'body-parser';
import express from 'express';
import {
  passportApiKeyAuthenticationComponent,
  passportInitialiseComponent,
  Users,
} from './api-key-auth';

const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const logger = require('morgan');

/**
 * Components to register ahead of regular request handling middleware.
 *
 * @param options
 */
export function leadingComponents(options?: {apiKeys?: Users}): Component[] {
  options = options || {};

  const authMiddleware =
    options.apiKeys === undefined
      ? []
      : [
          passportInitialiseComponent,
          passportApiKeyAuthenticationComponent(options.apiKeys),
        ];

  return [
    // Disable parsing of query strings into nested objects
    new SettingsComponent({'query parser': 'simple'}),
    new MiddlewareComponent({
      handler: [
        favicon(
          path.resolve(__dirname, '../../public/images/brand/favicon.ico')
        ),
        logger('dev'),
        bodyParser.json(),
        bodyParser.urlencoded({extended: false}),
        cookieParser(),
        express.static(path.resolve(__dirname, '../../public')),
        stripTrailingSlashes,
      ],
    }),
    ...authMiddleware,
  ];
}

/**
 * Middleware to redirect trailing slashes to same URL without trailing slash
 */
const stripTrailingSlashes: express.Handler = (req, res, next) => {
  if (req.url.substr(-1) === '/' && req.url.length > 1) {
    res.redirect(301, req.url.slice(0, -1));
  } else {
    next();
  }
};
