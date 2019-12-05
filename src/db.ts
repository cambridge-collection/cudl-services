/**
 * This module contains functions for working with Postgres.
 */
import pg from 'pg';
import { Config } from './config';
import { Resource } from './resources';

type DatabaseConfig = Pick<
  Config,
  'postHost' | 'postUser' | 'postPass' | 'postDatabase'
>;

export interface Collection {
  title: string;
  collectionID: string;
  collectionOrder: number;
}
export type GetItemCollections = (itemID: string) => Promise<Collection[]>;

export interface DatabasePool<T extends Database = Database> extends Resource {
  getDatabase(): Promise<T>;
}

export interface Database extends Resource {
  getItemCollections: GetItemCollections;
}

export class PostgresDatabasePool implements DatabasePool<PostgresDatabase> {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static fromConfig(config: DatabaseConfig) {
    return new PostgresDatabasePool(
      new pg.Pool({
        host: config.postHost,
        user: config.postUser,
        password: config.postPass,
        database: config.postDatabase,
      })
    );
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  async getDatabase(): Promise<PostgresDatabase> {
    return new PostgresDatabase(await this.pool.connect());
  }
}

export class PostgresDatabase implements Database {
  private readonly client: pg.PoolClient;

  constructor(client: pg.PoolClient) {
    this.client = client;
  }

  getClient(): pg.ClientBase {
    return this.client;
  }

  async getItemCollections(itemID: string): Promise<Collection[]> {
    const sql = `\
WITH RECURSIVE collection_membership(collectionid, title, collectionorder) AS (
  SELECT collections.collectionid, title, collectionorder, parentcollectionid
  FROM collections
         JOIN itemsincollection on collections.collectionid = itemsincollection.collectionid
  WHERE itemsincollection.itemid = $1::text AND itemsincollection.visible
  UNION
  SELECT collections.collectionid, collections.title, collections.collectionorder, collections.parentcollectionid
  FROM collections,
       collection_membership
  WHERE collections.collectionid = collection_membership.parentcollectionid
)
SELECT *
FROM collection_membership;`;
    return (await this.client.query(sql, [itemID])).rows.map(row => ({
      title: row.title,
      collectionID: row.collectionid,
      collectionOrder: row.collectionorder,
    }));
  }

  async close(): Promise<void> {
    this.client.release();
  }
}
