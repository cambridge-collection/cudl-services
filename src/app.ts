import { XSLTExecutor } from '@lib.cam/xslt-nailgun';
import bodyParser from 'body-parser';
import Debugger from 'debug';
import express, { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import path from 'path';
import { CollectionDAO, PostgresCollectionDAO } from './collections';
import { Config, User, Users } from './config';

import { DAOPool, PostgresDatabasePool } from './db';
import {
  CUDLMetadataRepository,
  DefaultCUDLMetadataRepository,
  LegacyDarwinMetadataRepository,
} from './metadata';
import { BaseResource, ExternalResources, using } from './resources';
import * as darwin from './routes/darwin';
import * as membership from './routes/membership';
import * as metadata from './routes/metadata';
import * as similarity from './routes/similarity';
import * as tags from './routes/tags';
import { PostgresTagsDAO, TagsDAO } from './routes/tags-impl';
import * as transcription from './routes/transcription';
import * as translation from './routes/translation';
import { DefaultXTF, XTF } from './xtf';

const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const logger = require('morgan');
const Strategy = require('passport-accesstoken').Strategy;

const debug = Debugger('cudl-services');

// FIXME: move this to server?
//cache directories
// fs.ensureDirSync(config.cacheDir);
// fs.ensureDirSync(config.cacheDir+'/transcriptions');
// fs.ensureDirSync(config.cacheDir+'/translations');

export interface AppOptions {
  users: Users;
  metadataRepository: CUDLMetadataRepository;
  legacyDarwinMetadataRepository: LegacyDarwinMetadataRepository;
  collectionsDAOPool: DAOPool<CollectionDAO>;
  tagsDAOPool: DAOPool<TagsDAO>;
  darwinXtfUrl: string;
  xtf: XTF;
}

export class App extends BaseResource {
  readonly options: AppOptions;
  readonly expressApp: express.Application;
  protected readonly xsltExecutor: XSLTExecutor;

  constructor(options: AppOptions) {
    super();
    this.options = Object.freeze({ ...options });
    this.xsltExecutor = XSLTExecutor.getInstance();
    this.expressApp = this.createExpressApp();
  }

  static fromConfig(config: Config): ExternalResources<App> {
    const dbPool = PostgresDatabasePool.fromConfig(config);

    return new ExternalResources(
      new App({
        metadataRepository: new DefaultCUDLMetadataRepository(config.dataDir),
        legacyDarwinMetadataRepository: new LegacyDarwinMetadataRepository(
          config.legacyDcpDataDir
        ),
        collectionsDAOPool: PostgresCollectionDAO.createPool(dbPool),
        tagsDAOPool: PostgresTagsDAO.createPool(dbPool),
        users: config.users,
        darwinXtfUrl: config.darwinXTF,
        xtf: new DefaultXTF(config),
      }),
      [dbPool]
    );
  }

  private createExpressApp(): express.Application {
    const app = express();

    passport.use(
      new Strategy((token: string, done: (err: any, user: any) => void) => {
        process.nextTick(() => {
          const user = findByApiKey(this.options.users, token);
          return done(null, user || false);
        });
      })
    );

    // view engine setup
    app.set('views', path.resolve(__dirname, '../views'));
    app.set('view engine', 'pug');

    app.use(
      favicon(path.resolve(__dirname, '../public/images/brand/favicon.ico'))
    );
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(passport.initialize());
    app.use(express.static(path.resolve(__dirname, '../public')));

    // Middleware to redirect trailing slashes to same URL without trailing slash
    app.use((req, res, next) => {
      if (req.url.substr(-1) === '/' && req.url.length > 1) {
        res.redirect(301, req.url.slice(0, -1));
      } else {
        next();
      }
    });

    app.use(
      '/v1/metadata',
      metadata.getRoutes({
        metadataRepository: this.options.metadataRepository,
      })
    );

    app.use(
      '/v1/rdb/membership',
      membership.getRoutes({
        getItemCollections: async (itemID: string) =>
          using(this.options.collectionsDAOPool.getInstance(), dao =>
            dao.getItemCollections(itemID)
          ),
      })
    );

    app.use('/v1/tags', tags.getRoutes({ daoPool: this.options.tagsDAOPool }));

    app.use(
      '/v1/transcription',
      transcription.getRoutes({
        metadataRepository: this.options.metadataRepository,
        legacyDarwinMetadataRepository: this.options
          .legacyDarwinMetadataRepository,
        xsltExecutor: this.xsltExecutor,
      })
    );

    app.use(
      '/v1/translation',
      translation.getRoutes({
        metadataRepository: this.options.metadataRepository,
        xsltExecutor: this.xsltExecutor,
      })
    );

    app.use(
      '/v1/xtf/similarity',
      similarity.getRoutes({
        metadataRepository: this.options.metadataRepository,
        xtf: this.options.xtf,
      })
    );

    app.use(
      '/v1/darwin',
      passport.authenticate('token', { session: false }),
      darwin.getRoutes({ darwinXtfUrl: this.options.darwinXtfUrl })
    );

    // 404 if no route matched
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.status(404).send('Not Found');
    });

    return app;
  }

  async close(): Promise<void> {
    await Promise.all([super.close(), this.xsltExecutor.close()]);
  }
}

function findByApiKey(users: Users, apiKey: string): User | null {
  if (apiKey in users) {
    return users[apiKey];
  }
  return null;
}
