import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import bodyParser from 'body-parser';
import express, {Request, Response} from 'express';
import passport from 'passport';
import path from 'path';
import {URL} from 'url';
import {CollectionDAO} from './collections';

import {DAOPool} from './db';
import {BaseResource, Resource, using} from './resources';
import * as darwin from './routes/darwin';
import * as membership from './routes/membership';
import * as metadata from './routes/metadata';
import * as similarity from './routes/similarity';
import * as tags from './routes/tags';
import {TagsDAO} from './routes/tags-impl';
import * as transcription from './routes/transcription';
import * as translation from './routes/translation';
import {XTF} from './xtf';
import {CUDLMetadataRepository} from './metadata/cudl';
import {NestedArray, unNest} from './util';

const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const logger = require('morgan');
const Strategy = require('passport-accesstoken').Strategy;

export interface Application extends Resource {
  expressApp: express.Application;
}

export interface Users<U = User> {
  [apiKey: string]: U;
}

export interface User {
  username: string;
  email: string;
}

export interface AppOptions {
  collectionsDAOPool: DAOPool<CollectionDAO>;
  darwinXtfUrl: string;
  metadataRepository: CUDLMetadataRepository;
  tagsDAOPool: DAOPool<TagsDAO>;
  users: Users;
  xtf: XTF;
  zacynthiusServiceURL: URL;
}

export interface Component extends Resource {
  register(express: express.Express): Promise<void>;
}

export abstract class BaseComponent extends BaseResource implements Component {
  abstract register(express: express.Express): Promise<void>;
}

class FnComponent extends BaseComponent {
  readonly register: Component['register'];
  constructor(registrationFn: Component['register']) {
    super();
    this.register = registrationFn;
  }
}
export function fnComponent(
  registrationFn: (express: express.Express) => unknown
): Component {
  return new FnComponent(async express => {
    await registrationFn(express);
  });
}

export class SettingsComponent extends BaseComponent {
  readonly settings: ReadonlyMap<string, unknown>;

  constructor(settings: Record<string, unknown>) {
    super();
    this.settings = new Map(Object.entries(settings));
  }

  async register(express: express.Express): Promise<void> {
    for (const [key, value] of this.settings.entries()) {
      express.set(key, value);
    }
  }
}

export class MiddlewareComponent extends BaseComponent {
  readonly path?: string;
  readonly handler:
    | express.RequestHandler[]
    | express.RequestHandler
    | express.Application;

  constructor(options: {
    path?: string;
    handler:
      | express.RequestHandler[]
      | express.RequestHandler
      | express.Application;
  }) {
    super();
    this.path = options.path;
    this.handler = options.handler;
  }

  async register(express: express.Router): Promise<void> {
    if (this.path !== undefined) {
      if (Array.isArray(this.handler)) {
        express.use(this.path, ...this.handler);
      } else {
        express.use(this.path, this.handler);
      }
    } else {
      if (Array.isArray(this.handler)) {
        express.use(...this.handler);
      } else {
        express.use(this.handler);
      }
    }
  }
}

export class ComponentApp extends BaseResource implements Application {
  readonly components: ReadonlyArray<Component>;
  readonly expressApp: express.Application;

  private constructor(
    expressApp: express.Application,
    components: Iterable<Component>
  ) {
    super();
    this.components = [...components];
    this.expressApp = expressApp;
  }

  static async from(
    ...components: NestedArray<Component>
  ): Promise<ComponentApp> {
    const expressApp = express();
    const flatComponents = [...unNest(components)];
    for (const component of flatComponents) {
      await component.register(expressApp);
    }
    return new ComponentApp(expressApp, flatComponents);
  }

  async close(): Promise<void> {
    await Promise.all([super.close(), ...this.components.map(c => c.close())]);
  }
}

export class App extends BaseResource implements Application {
  readonly options: AppOptions;
  readonly expressApp: express.Application;
  protected readonly xsltExecutor: XSLTExecutor;

  constructor(options: AppOptions) {
    super();
    this.options = Object.freeze({...options});
    this.xsltExecutor = XSLTExecutor.getInstance();
    this.expressApp = this.createExpressApp();
  }

  private createExpressApp(): express.Application {
    const app = express();

    // Disable parsing of query strings into nested objects
    app.set('query parser', 'simple');

    passport.use(
      new Strategy(
        (token: string, done: (err: unknown, user: unknown) => void) => {
          process.nextTick(() => {
            const user = findByApiKey(this.options.users, token);
            return done(null, user || false);
          });
        }
      )
    );

    app.use(
      favicon(path.resolve(__dirname, '../public/images/brand/favicon.ico'))
    );
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));
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

    app.use('/v1/tags', tags.getRoutes({daoPool: this.options.tagsDAOPool}));

    app.use(
      '/v1/transcription',
      transcription.getRoutes({
        metadataRepository: this.options.metadataRepository,
        xsltExecutor: this.xsltExecutor,
        zacynthiusServiceURL: this.options.zacynthiusServiceURL,
      })
    );

    app.use(
      '/v1/translation',
      translation.getRoutes({
        metadataRepository: this.options.metadataRepository,
        xsltExecutor: this.xsltExecutor,
        zacynthiusServiceURL: this.options.zacynthiusServiceURL,
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
      passport.authenticate('token', {session: false}),
      darwin.getRoutes({darwinXtfUrl: this.options.darwinXtfUrl})
    );

    // 404 if no route matched
    app.use((req: Request, res: Response) => {
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
