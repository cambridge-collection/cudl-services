import pg from 'pg';
import {
  Collection as DBCollection,
  PostgresCollectionDAO,
} from '../src/collections';
import { PostgresDatabasePool } from '../src/db';
import { factory } from '../src/util';
import { connectionDetails } from './config';

interface Item {
  itemid: string;
}

interface Collection {
  collectionid: string;
  title: string;
  summaryurl: string;
  sponsorsurl: string;
  type: string;
  collectionorder: number;
  parentcollectionid?: string;
}

type MinimalCollection = Partial<Collection> & Pick<Collection, 'collectionid'>;

interface ItemsInCollection {
  itemid: string;
  collectionid: string;
  visible: boolean;
  itemorder: number;
}

type MinimalItemsInCollection = Partial<ItemsInCollection> &
  Pick<ItemsInCollection, 'itemid' | 'collectionid'>;

function collectionWithDefaults(c: MinimalCollection): Collection {
  return {
    title: 'title',
    summaryurl: 'http://example.com/',
    sponsorsurl: 'http://example.com/',
    type: 'foo',
    collectionorder: 0,
    ...c,
  };
}

function itemsInCollectionWithDefaults(
  ic: MinimalItemsInCollection
): ItemsInCollection {
  return {
    visible: true,
    itemorder: 0,
    ...ic,
  };
}

interface TestData {
  items?: Item[];
  collections?: MinimalCollection[];
  itemsInCollections?: MinimalItemsInCollection[];
}

async function insertTestData(client: pg.ClientBase, data: TestData) {
  if (data.items) {
    for (const item of data.items) {
      await client.query('INSERT INTO items (itemid) VALUES ($1)', [
        item.itemid,
      ]);
    }
  }

  if (data.collections) {
    for (const mc of data.collections) {
      const c = collectionWithDefaults(mc);
      const query = `INSERT INTO collections (
        collectionid,
        title,
        summaryurl,
        sponsorsurl,
        type,
        collectionorder,
        parentcollectionid
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
      await client.query(query, [
        c.collectionid,
        c.title,
        c.summaryurl,
        c.sponsorsurl,
        c.type,
        c.collectionorder,
        c.parentcollectionid,
      ]);
    }
  }

  if (data.itemsInCollections) {
    for (const mic of data.itemsInCollections) {
      const ic = itemsInCollectionWithDefaults(mic);
      const query = `INSERT INTO itemsincollection (
        itemid, collectionid, visible, itemorder
      ) VALUES ($1, $2, $3, $4)`;
      await client.query(query, [
        ic.itemid,
        ic.collectionid,
        ic.visible,
        ic.itemorder,
      ]);
    }
  }
}

describe('PostgresCollectionDAO', () => {
  let dbPool: PostgresDatabasePool;
  let db: PostgresCollectionDAO;

  // each test is wrapped in a transaction which is not committed, so tests
  // should be isolated from each other and have no outside effects.
  beforeEach(async () => {
    dbPool = PostgresDatabasePool.fromConfig({
      postHost: connectionDetails.host,
      postPort: connectionDetails.port,
      postUser: connectionDetails.user,
      postPass: connectionDetails.password,
      postDatabase: connectionDetails.database,
    });
    db = await dbPool.getClient(factory(PostgresCollectionDAO));
    await db.getClient().query('BEGIN');
  });

  afterEach(async () => {
    if (db) {
      await db.getClient().query('ROLLBACK');
      await db.close();
    }
    if (dbPool) {
      await dbPool.close();
    }
  });

  describe('getItemCollections()', () => {
    const testData: TestData = {
      items: [
        { itemid: 'foo' },
        { itemid: 'bar' },
        { itemid: 'baz' },
        { itemid: 'boz' },
      ],
      collections: [
        { collectionid: 'a', title: 'A', collectionorder: 1 },
        {
          collectionid: 'a.a',
          title: 'A.A',
          parentcollectionid: 'a',
          collectionorder: 1,
        },
        {
          collectionid: 'a.b',
          title: 'A.B',
          parentcollectionid: 'a',
          collectionorder: 2,
        },
        {
          collectionid: 'a.b.c',
          title: 'A.B.C',
          parentcollectionid: 'a.b',
          collectionorder: 1,
        },
        { collectionid: 'b', title: 'B', collectionorder: 2 },
      ],
      itemsInCollections: [
        // in 2 collections, but 1 hidden
        { itemid: 'foo', collectionid: 'a', visible: false },
        { itemid: 'foo', collectionid: 'b' },
        // bar has no collections
        // in everything apart from a.a
        { itemid: 'baz', collectionid: 'a.b.c' },
        { itemid: 'baz', collectionid: 'b' },
        // in both nested collections - has common parents which should only be
        // listed once in the results.
        { itemid: 'boz', collectionid: 'a.a' },
        { itemid: 'boz', collectionid: 'a.b.c' },
      ],
    };

    test('returns no collections with empty database', async () => {
      await expect(db.getItemCollections('foo')).resolves.toEqual([]);
    });

    test.each<[string, DBCollection[]]>([
      ['foo', [{ collectionID: 'b', title: 'B', collectionOrder: 2 }]],
      ['bar', []],
      [
        'baz',
        [
          { collectionID: 'a.b.c', title: 'A.B.C', collectionOrder: 1 },
          { collectionID: 'b', title: 'B', collectionOrder: 2 },
          { collectionID: 'a.b', title: 'A.B', collectionOrder: 2 },
          { collectionID: 'a', title: 'A', collectionOrder: 1 },
        ],
      ],
      [
        'boz',
        [
          { collectionID: 'a.a', title: 'A.A', collectionOrder: 1 },
          { collectionID: 'a.b.c', title: 'A.B.C', collectionOrder: 1 },
          { collectionID: 'a', title: 'A', collectionOrder: 1 },
          { collectionID: 'a.b', title: 'A.B', collectionOrder: 2 },
        ],
      ],
    ])('item %s has expected collections', async (itemID, collections) => {
      await insertTestData(db.getClient(), testData);
      await expect(db.getItemCollections(itemID)).resolves.toEqual(collections);
    });
  });
});
