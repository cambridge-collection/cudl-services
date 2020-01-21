import pg from 'pg';
import { PostgresDatabasePool } from '../src/db';
import { PostgresTagsDAO } from '../src/routes/tags-impl';
import { factory } from '../src/util';
import { connectionDetails } from './config';

interface TagJSON {
  name: string;
  raw: number;
}

interface AnnotationTagJSON extends TagJSON {
  type: string;
}

interface TagsJSON<TAG extends TagJSON> {
  tags: TAG[];
}

interface UserTagsJSON<TAG extends TagJSON> extends TagsJSON<TAG> {
  // Note: these redundant fields don't actually get used, but they're in the current data...

  /** User ID - same value as in parent table... */
  oid: string;
  /** Length of tags array... */
  total: number;
}

interface DocumentTags<TAGS extends TagsJSON<TagJSON> = TagsJSON<TagJSON>> {
  documentID: string;
  tags: TAGS;
}

interface UserDocumentTags<TAGS extends TagsJSON<TagJSON> = TagsJSON<TagJSON>>
  extends DocumentTags<TAGS> {
  /** Owner (user) ID */
  userID: string;
}

interface TestData {
  tags?: DocumentTags[];
  annotations?: Array<UserDocumentTags<UserTagsJSON<AnnotationTagJSON>>>;
  removedTags?: UserDocumentTags[];
}

type WithoutRedundantKeys<T extends UserTagsJSON<TagJSON>> = Omit<
  T,
  'oid' | 'total'
> &
  Partial<Pick<T, 'oid' | 'total'>>;

function userTags<TAG extends TagJSON>(options: {
  userID: string;
  documentID: string;
  tags: WithoutRedundantKeys<UserTagsJSON<TAG>>;
}): UserDocumentTags<UserTagsJSON<TAG>> {
  const { userID, documentID, tags } = options;
  return {
    userID,
    documentID,
    tags: {
      oid: tags.oid || userID,
      tags: tags.tags,
      total: tags.total || tags.tags.length,
    },
  };
}

// For some reason the Annotation tags store the tag list under "annotations" instead of "tags" like the other 2...
type AnnotationTagsJSON<T extends TagsJSON<TagJSON>> = Omit<T, 'tags'> & {
  annotations: T['tags'];
};

async function insertTestData(client: pg.ClientBase, data: TestData) {
  for (const item of data.tags || []) {
    await client.query(
      `INSERT INTO "DocumentTags" ("docId", tags) VALUES ($1, $2)`,
      [item.documentID, JSON.stringify(item.tags)]
    );
  }

  for (const item of data.annotations || []) {
    const annotationTagsJSON: AnnotationTagsJSON<typeof item.tags> = {
      oid: item.tags.oid,
      total: item.tags.total,
      annotations: item.tags.tags,
    };

    await client.query(
      `INSERT INTO "DocumentAnnotations" (oid, "docId", annos) VALUES ($1, $2, $3)`,
      [item.userID, item.documentID, JSON.stringify(annotationTagsJSON)]
    );
  }

  for (const item of data.removedTags || []) {
    await client.query(
      `INSERT INTO "DocumentRemovedTags" (oid, "docId", removedtags) VALUES ($1, $2, $3)`,
      [item.userID, item.documentID, JSON.stringify(item.tags)]
    );
  }
}

const testData: TestData = {
  tags: [
    {
      documentID: 'MS-FOO',
      tags: {
        tags: [
          // Duplicates are summed
          { name: 'foo', raw: 10 },
          { name: 'foo', raw: 12 },
          { name: 'bar', raw: 11 },
          { name: 'baz', raw: 12 },
        ],
      },
    },
    {
      documentID: 'MS-BAR',
      tags: {
        tags: [
          { name: 'foo', raw: 5 },
          { name: 'bar', raw: 6 },
          { name: 'baz', raw: 7 },
          { name: 'boz', raw: 7 },
        ],
      },
    },
    {
      documentID: 'MS-BAZ',
      tags: {
        tags: [],
      },
    },
  ],
  removedTags: [
    userTags({
      userID: 'bob',
      documentID: 'MS-FOO',
      tags: {
        tags: [
          { name: 'foo', raw: -1 },
          { name: 'bar', raw: -1 },
          { name: 'abc', raw: -1 },
        ],
      },
    }),
    userTags({
      userID: 'bill',
      documentID: 'MS-FOO',
      tags: {
        tags: [
          { name: 'foo', raw: -1 },
          { name: 'abc', raw: -1 },
        ],
      },
    }),
    userTags({
      userID: 'bill',
      documentID: 'MS-BAR',
      tags: {
        tags: [
          { name: 'foo', raw: -1 },
          { name: 'boz', raw: -1 },
          { name: 'def', raw: -1 },
        ],
      },
    }),
    userTags({
      userID: 'bill',
      documentID: 'MS-BAZ',
      tags: {
        tags: [{ name: 'def', raw: -1 }],
      },
    }),
  ],
  annotations: [
    userTags({
      userID: 'bob',
      documentID: 'MS-FOO',
      tags: {
        tags: [
          { name: 'a', raw: 1, type: 'date' },
          { name: 'b', raw: 1, type: 'person' },
        ],
      },
    }),
    userTags({
      userID: 'bob',
      documentID: 'MS-BAZ',
      tags: {
        tags: [
          { name: 'abc', raw: 1, type: 'person' },
          { name: 'def', raw: 1, type: 'about' },
        ],
      },
    }),
    userTags({
      userID: 'bill',
      documentID: 'MS-BAZ',
      tags: {
        tags: [
          { name: 'abc', raw: 1, type: 'person' },
          { name: 'foo', raw: 1, type: 'about' },
        ],
      },
    }),
    userTags({
      userID: 'jill',
      documentID: 'MS-BAZ',
      tags: {
        tags: [
          { name: 'abc', raw: 1, type: 'about' },
          { name: 'def', raw: 1, type: 'about' },
        ],
      },
    }),
  ],
};

describe('PostgresTagsDAO', () => {
  let dbPool: PostgresDatabasePool;
  let db: PostgresTagsDAO;

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
    db = await dbPool.getClient(factory(PostgresTagsDAO));
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

  test('empty database returns no 3rd party tags', async () => {
    expect(Array.from(await db.thirdPartyTags('MS-FOO'))).toEqual([]);
    expect(Array.from(await db.thirdPartyTags('MS-BAR'))).toEqual([]);
  });

  test('empty database returns no annotation tags', async () => {
    expect(Array.from(await db.annotationTags('MS-FOO'))).toEqual([]);
    expect(Array.from(await db.annotationTags('MS-BAR'))).toEqual([]);
  });

  test('empty database returns no removed tags', async () => {
    expect(Array.from(await db.removedTags('MS-FOO'))).toEqual([]);
    expect(Array.from(await db.removedTags('MS-BAR'))).toEqual([]);
  });

  test.each<[string, Record<string, number>]>([
    [
      'MS-FOO',
      {
        foo: 22,
        bar: 11,
        baz: 12,
      },
    ],
    [
      'MS-BAR',
      {
        foo: 5,
        bar: 6,
        baz: 7,
        boz: 7,
      },
    ],
    ['MS-BAZ', {}],
    ['MS-XXX', {}],
  ])('thirdPartyTags %s', async (documentID, expectedTags) => {
    await insertTestData(db.getClient(), testData);

    expect((await db.thirdPartyTags(documentID)).asObject()).toEqual(
      expectedTags
    );
  });

  test.each<[string, Record<string, number>]>([
    [
      'MS-FOO',
      {
        b: 1,
      },
    ],
    ['MS-BAR', {}],
    [
      'MS-BAZ',
      {
        abc: 3,
        def: 2,
        foo: 1,
      },
    ],
    ['MS-XXX', {}],
  ])('annotationTags %s', async (documentID, expectedTags) => {
    await insertTestData(db.getClient(), testData);

    expect((await db.annotationTags(documentID)).asObject()).toEqual(
      expectedTags
    );
  });

  test.each<[string, Record<string, number>]>([
    [
      'MS-FOO',
      {
        foo: -2,
        bar: -1,
        abc: -2,
      },
    ],
    [
      'MS-BAR',
      {
        foo: -1,
        boz: -1,
        def: -1,
      },
    ],
    [
      'MS-BAZ',
      {
        def: -1,
      },
    ],
    ['MS-XXX', {}],
  ])('removedTags %s', async (documentID, expectedTags) => {
    await insertTestData(db.getClient(), testData);

    expect((await db.removedTags(documentID)).asObject()).toEqual(expectedTags);
  });
});
