import {PoolClient, QueryConfig, QueryResult, QueryResultRow} from 'pg';
import {mocked} from 'ts-jest/utils';
import {PostgresCollectionDAO} from '../src/collections';

interface MockPgClient {
  // The actual query() signature has several overloads which prevents the
  // .mockResolvedValueOnce() method typings from working.
  query<
    R extends QueryResultRow = QueryResultRow,
    I extends unknown[] = unknown[]
  >(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>;
}

describe('PostgresCollectionDAO', () => {
  let mockClient: MockPgClient;
  let dao: PostgresCollectionDAO;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };

    dao = new PostgresCollectionDAO(mockClient as PoolClient);
  });

  test('getClient()', () => {
    expect(dao.getClient()).toBe(mockClient);
  });

  test('getItemCollections()', async () => {
    mocked(mockClient).query.mockResolvedValueOnce(
      dummyQueryResult([
        {title: 'foo', collectionid: 'bar', collectionorder: '42'},
      ])
    );

    await expect(dao.getItemCollections('MS-FOO')).resolves.toEqual([
      {title: 'foo', collectionID: 'bar', collectionOrder: 42},
    ]);
    expect(mockClient.query).toBeCalledTimes(1);
    expect(mocked(mockClient).query.mock.calls[0][1]).toEqual(['MS-FOO']);
  });
});

function dummyQueryResult(rows: QueryResultRow[]): QueryResult {
  return {
    rows,
    command: '',
    fields: [],
    oid: 0,
    rowCount: rows.length,
  };
}
