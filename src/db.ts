/**
 * This module contains functions for working with Postgres.
 */
import pg from 'pg';
import { StrictConfig } from './config';
import { Resource } from './resources';
import { factory, UnaryConstructorArg } from './util';

export type DatabaseConfig = Pick<
  StrictConfig,
  'postHost' | 'postPort' | 'postUser' | 'postPass' | 'postDatabase'
>;

export interface DatabasePool<Client> extends Resource {
  getClient<T>(clientFactory: ClientFactory<Client, T>): T | Promise<T>;
}

type ClientFactory<C, T> = (client: C) => T | Promise<T>;

export class PostgresDatabasePool implements DatabasePool<pg.PoolClient> {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static fromConfig(config: DatabaseConfig) {
    return new PostgresDatabasePool(
      new pg.Pool({
        host: config.postHost,
        user: config.postUser,
        port: config.postPort,
        password: config.postPass,
        database: config.postDatabase,
      })
    );
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  async getClient<T>(
    clientFactory: ClientFactory<pg.PoolClient, T>
  ): Promise<T> {
    const pgClient = await this.pool.connect();
    return clientFactory(pgClient);
  }
}

export interface DAOPool<DAO> {
  getInstance(): DAO | Promise<DAO>;
}

export class DefaultDAOPool<DAO, Client> implements DAOPool<DAO> {
  private readonly pool: DatabasePool<Client>;
  private readonly factory: ClientFactory<Client, DAO>;

  constructor(pool: DatabasePool<Client>, factory: ClientFactory<Client, DAO>) {
    this.pool = pool;
    this.factory = factory;
  }

  async getInstance() {
    return this.pool.getClient(this.factory);
  }
}

export class BaseDAO<DB> {
  protected readonly db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  static createPool<DAO extends new (db: unknown) => InstanceType<DAO>>(
    this: DAO,
    pool: DatabasePool<UnaryConstructorArg<DAO>>
  ): DAOPool<InstanceType<DAO>> {
    return new DefaultDAOPool(pool, factory(this));
  }
}

export class BasePostgresDAO extends BaseDAO<pg.PoolClient>
  implements Resource {
  getClient(): pg.PoolClient {
    return this.db;
  }

  async close(): Promise<void> {
    this.db.release();
  }
}
