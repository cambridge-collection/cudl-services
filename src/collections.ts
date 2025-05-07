import {BasePostgresDAO} from './db';
import {Resource} from './resources';

export interface Collection {
  title: string;
  collectionID: string;
  collectionOrder: number;
}

export type GetItemCollections = (itemID: string) => Promise<Collection[]>;

export interface CollectionDAO extends Resource {
  getItemCollections: GetItemCollections;
}

export class PostgresCollectionDAO
  extends BasePostgresDAO
  implements CollectionDAO
{
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
    return (await this.db.query(sql, [itemID])).rows.map(row => ({
      title: row.title,
      collectionID: row.collectionid,
      collectionOrder: Number(row.collectionorder),
    }));
  }
}
