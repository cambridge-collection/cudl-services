/**
 * This module contains functions for working with Postgres.
 */
import pg from 'pg';
import { Config } from './config';

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

export interface Database {
  getItemCollections: GetItemCollections;
}

export class PostgresDatabase implements Database {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static fromConfig(config: DatabaseConfig) {
    return new PostgresDatabase(
      new pg.Pool({
        host: config.postHost,
        user: config.postUser,
        password: config.postPass,
        database: config.postDatabase,
      })
    );
  }

  /**
   * Obtain a db connection an execute a single query.
   */
  private async query(sql: string, bindParams: [any]) {
    const client = await this.pool.connect();
    try {
      return await client.query(sql, bindParams || []);
    } finally {
      client.release();
    }
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
    return (await this.query(sql, [itemID])).rows.map(row => ({
      title: row.title,
      collectionID: row.collectionid,
      collectionOrder: row.collectionorder,
    }));
  }
}
