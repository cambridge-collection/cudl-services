/**
 * This module contains functions for working with Postgres.
 */
import pg from 'pg';
import {StrictConfig} from './config';
import {Resource} from './resources';
import {factory} from './util';

export type DatabaseConfig = Pick<
  StrictConfig,
  'postHost' | 'postPort' | 'postUser' | 'postPass' | 'postDatabase'
>;

export interface DatabasePool<Client> extends Resource {
  getClient<T>(clientFactory: ClientFactory<Client, T>): T | Promise<T>;
}

type ClientFactory<C, T> = (client: C) => T | Promise<T>;

const PG_TIMEOUT = 1000 * 10;

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

        // By default pg allows operations to continue indefinitely. We don't do
        // anything which should take a long time, so the timeout can be
        // reasonably short to catch problems/bugs etc.
        statement_timeout: PG_TIMEOUT,
        query_timeout: PG_TIMEOUT,
        connectionTimeoutMillis: PG_TIMEOUT,
        idle_in_transaction_session_timeout: PG_TIMEOUT,
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

// TODO: I think implementing DAOs backed by a connection pool with a specific
//   type was a mistake. Look into refactoring this to see if we can simplify
//   Resource freeing, possibly via reference counting.
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

  static createPool<DB, DAO>(
    this: new (db: DB) => DAO,
    pool: DatabasePool<DB>
  ): DAOPool<DAO> {
    return new DefaultDAOPool(pool, factory(this));
  }
}

export class BasePostgresDAO
  extends BaseDAO<pg.PoolClient>
  implements Resource {
  getClient(): pg.PoolClient {
    return this.db;
  }

  async close(): Promise<void> {
    this.db.release();
  }
}
