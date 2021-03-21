import express from 'express';
import {URL} from 'url';
import {CollectionDAO} from './collections';

import {DAOPool} from './db';
import {aggregate, BaseResource, Resource} from './resources';
import {TagsDAO} from './routes/tags-impl';
import {XTF} from './xtf';
import {CUDLMetadataRepository} from './metadata/cudl';
import {NestedArray, unNest} from './util';

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
  register(app: express.Application): Promise<void>;
}

export abstract class BaseComponent extends BaseResource implements Component {
  abstract register(express: express.Application): Promise<void>;
}

class FnComponent extends BaseComponent {
  readonly register: Component['register'];
  constructor(registrationFn: Component['register']) {
    super();
    this.register = registrationFn;
  }
}
export function fnComponent(
  registrationFn: (app: express.Application) => unknown
): Component {
  return new FnComponent(async app => {
    await registrationFn(app);
  });
}

export class SettingsComponent extends BaseComponent {
  readonly settings: ReadonlyMap<string, unknown>;

  constructor(settings: Record<string, unknown>) {
    super();
    this.settings = new Map(Object.entries(settings));
  }

  async register(app: express.Application): Promise<void> {
    for (const [key, value] of this.settings.entries()) {
      app.set(key, value);
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

/** A Component that closes a Resource when a ComponentApp is closed. */
export class ResourceCleanupComponent extends BaseComponent {
  private readonly resource: Resource;

  constructor(resource: Resource) {
    super();
    this.resource = resource;
  }

  static closing(...resources: Resource[]): ResourceCleanupComponent {
    return new ResourceCleanupComponent(aggregate(...resources));
  }

  async register(): Promise<void> {
    this.ensureNotClosed();
  }

  async close(): Promise<void> {
    await Promise.all([super.close(), this.resource.close()]);
  }
}

export type Components = Component | NestedArray<Component>;

/**
 * Register multiple ordered components with an app.
 *
 * @param app The target to register components with
 * @param components The components to register
 * @return The app and the flattened list of components in the order of registration
 */
export async function registerComponents(
  app: express.Application,
  ...components: NestedArray<Component>
): Promise<{app: express.Application; flatComponents: Component[]}> {
  const flatComponents = [...unNest(components)];
  for (const component of flatComponents) {
    await component.register(app);
  }
  return {app, flatComponents};
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
    const {app, flatComponents} = await registerComponents(
      express(),
      components
    );
    return new ComponentApp(app, flatComponents);
  }

  async close(): Promise<void> {
    await Promise.all([super.close(), ...this.components.map(c => c.close())]);
  }
}
