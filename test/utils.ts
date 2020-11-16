import {
  Closable,
  CreateOptions,
  execute,
  ExecuteOptions,
  XSLTExecutor,
} from '@lib.cam/xslt-nailgun';
import {AssertionError} from 'assert';
import collapseWhitespace from 'collapse-whitespace';
import http from 'http';
import {StatusCodes} from 'http-status-codes';
import * as path from 'path';
import * as util from 'util';
import {promisify} from 'util';
import {Collection, CollectionDAO} from '../src/collections';

import {BaseDAO, DAOPool, DatabasePool, DefaultDAOPool} from '../src/db';
import {
  CUDLMetadataRepository,
  DefaultCUDLMetadataRepository,
  LegacyDarwinMetadataRepository,
} from '../src/metadata';
import {TagSourceName} from '../src/routes/tags';
import {DefaultTagSet, Tag, TagsDAO, TagSet} from '../src/routes/tags-impl';
import {asUnknownObject, factory} from '../src/util';
import {XTF} from '../src/xtf';
import {TEST_DATA_PATH} from './constants';
import {Resource} from '../src/resources';

/**
 * An HTTP server listening on a random port on the loopback interface which
 * responds to each request with HTTP 418. The requestHandler attribute is a
 * jest mock function which records the received HTTP requests.
 */
export class DummyHttpServer {
  readonly server: http.Server;
  readonly requestHandler: jest.Mock<
    void,
    [http.IncomingMessage, http.ServerResponse]
  >;
  private started?: Promise<void>;

  constructor() {
    this.requestHandler = jest.fn(this.handleRequest.bind(this));
    this.server = http.createServer(this.requestHandler);
  }

  start(): Promise<void> {
    if (this.started === undefined) {
      this.started = new Promise(resolve =>
        this.server.listen(0, 'localhost', resolve)
      );
    }
    return this.started;
  }

  stop(): Promise<void> {
    return promisify(this.server.close.bind(this.server))();
  }

  getPort(): number {
    const address = this.server.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    throw new AssertionError();
  }

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(StatusCodes.IM_A_TEAPOT);
    res.end('foobar');
  }
}

interface ItemCollections {
  [itemID: string]: Collection[];
}

export class SingletonDAOPool<DAO extends Resource> implements DAOPool<DAO> {
  private readonly dao: DAO;

  constructor(dao: DAO) {
    this.dao = dao;
  }

  static containing<DAO extends Resource>(dao: DAO): SingletonDAOPool<DAO> {
    return new SingletonDAOPool(dao);
  }

  async getInstance(): Promise<DAO> {
    return this.dao;
  }
}

export class MemoryDatabasePool<Data> implements DatabasePool<Data> {
  readonly data: Data;

  constructor(data: Data) {
    this.data = data;
  }

  static createPooledDAO<Data, DAO extends Resource>(
    dao: new (db: Data) => DAO,
    data: Data
  ): DAOPool<DAO> {
    return new DefaultDAOPool(new MemoryDatabasePool(data), factory(dao));
  }

  async getClient<T>(
    clientFactory: (client: Data) => Promise<T> | T
  ): Promise<T> {
    return clientFactory(this.data);
  }

  async close(): Promise<void> {}
}

export class MemoryCollectionsDAO
  extends BaseDAO<ItemCollections>
  implements CollectionDAO {
  async getItemCollections(itemID: string): Promise<Collection[]> {
    return this.db[itemID] || [];
  }

  async close() {}
}

export class MemoryTagsDAO
  extends BaseDAO<Record<string, Record<TagSourceName, Tag[]>>>
  implements TagsDAO {
  private getTags(type: TagSourceName, docID: string) {
    return new DefaultTagSet(this.db![docID][type] || []);
  }

  async annotationTags(docId: string): Promise<TagSet> {
    return this.getTags(TagSourceName.ANNOTATIONS, docId);
  }

  async removedTags(docId: string): Promise<TagSet> {
    return this.getTags(TagSourceName.USER_REMOVES, docId);
  }

  async thirdPartyTags(docId: string): Promise<TagSet> {
    return this.getTags(TagSourceName.THIRD_PARTY, docId);
  }
}

export function getTestDataMetadataRepository(): CUDLMetadataRepository {
  return new DefaultCUDLMetadataRepository(
    path.resolve(TEST_DATA_PATH, 'metadata')
  );
}

export function getTestDataLegacyDarwinMetadataRepository(): LegacyDarwinMetadataRepository {
  return new LegacyDarwinMetadataRepository(
    path.resolve(TEST_DATA_PATH, 'legacy-darwin')
  );
}

export function getMockXTF(): XTF {
  return {
    getSimilarItems: jest.fn(),
    search: jest.fn(),
  };
}

export function normaliseSpace(value?: Node | null): string {
  if (!value) {
    return '';
  }
  value = value.cloneNode(true);
  collapseWhitespace(value);
  return value.textContent || '';
}

/**
 * An XSLTExecutor implementation that doesn't need to be closed() after use.
 * It doesn't actually hold open a JVM process.
 */
class TestXSLTExecutor implements Closable {
  private readonly options: CreateOptions;

  constructor(options?: CreateOptions) {
    this.options = options || {};
  }

  async execute(options: ExecuteOptions): Promise<Buffer> {
    return execute({...options, ...this.options});
  }

  close() {}
}

/**
 * Get an XSLTExecutor that doesn't need to be close()d to avoid leaking.
 */
export function getTestXSLTExecutor(options?: CreateOptions): XSLTExecutor {
  return (new TestXSLTExecutor(options) as unknown) as XSLTExecutor;
}

export function product(): Iterable<[]>;
export function product<A>(a: A[]): Iterable<[A]>;
export function product<A, B>(a: A[], b: B[]): Iterable<[A, B]>;
export function product<A, B, C>(a: A[], b: B[], c: C[]): Iterable<[A, B, C]>;
export function product<A, B, C, D>(
  a: A[],
  b: B[],
  c: C[],
  d: D[]
): Iterable<[A, B, C, D]>;
export function product<T>(...lists: T[][]): Iterable<T[]> {
  return _product(...lists);
}
function* _product<T>(...lists: T[][]): Iterable<T[]> {
  if (lists.length === 0) {
    yield [];
    return;
  }

  const head = Array.from(lists);
  const tail = head.pop();
  if (tail === undefined) {
    throw new AssertionError({
      message: 'pop() on non-empty array returned undefined',
    });
  }

  for (const headProduct of _product(...head)) {
    for (const t of tail) {
      yield headProduct.concat([t]);
    }
  }
}

export function getAttribute(
  obj: unknown,
  ...attrPath: Array<string | number>
): unknown {
  if (attrPath.length === 0) {
    return obj;
  }

  const tail = Array.from(attrPath);
  const head = tail.shift();

  if (typeof head === 'number') {
    if (!Array.isArray(obj)) {
      throw new Error(`Cannot index ${util.inspect(obj)} with number: ${head}`);
    }
    return getAttribute(obj[head], ...tail);
  } else if (typeof head === 'string') {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error(`Cannot index ${util.inspect(obj)} with string: ${head}`);
    }
    return getAttribute(asUnknownObject(obj)[head], ...tail);
  }
  throw new AssertionError();
}
