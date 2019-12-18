import {
  execute,
  Closable,
  CreateOptions,
  ExecuteOptions,
  XSLTExecutor,
} from '@lib.cam/xslt-nailgun';
import collapseWhitespace from 'collapse-whitespace';
import { AssertionError } from 'assert';
import http from 'http';
import { IM_A_TEAPOT } from 'http-status-codes';
import * as path from 'path';
import { promisify } from 'util';

import { Database, Collection, DatabasePool } from '../src/db';
import {
  LegacyDarwinMetadataRepository,
  CUDLMetadataRepository,
} from '../src/metadata';
import { BaseResource } from '../src/resources';

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
  private started: Promise<void>;

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
    res.writeHead(IM_A_TEAPOT);
    res.end('foobar');
  }
}

interface ItemCollections {
  [itemID: string]: Collection[];
}

export class MemoryDatabasePool extends BaseResource
  implements DatabasePool<MemoryDatabase> {
  readonly itemCollections: ItemCollections;

  constructor(options: { itemCollections: ItemCollections }) {
    super();
    this.itemCollections = options.itemCollections;
  }

  async getDatabase(): Promise<MemoryDatabase> {
    this.ensureNotClosed();
    return new MemoryDatabase(this);
  }
}

export class MemoryDatabase extends BaseResource implements Database {
  private readonly pool: MemoryDatabasePool;

  constructor(pool: MemoryDatabasePool) {
    super();
    this.pool = pool;
  }

  async getItemCollections(itemID: string): Promise<Collection[]> {
    this.ensureNotClosed();
    return this.pool.itemCollections[itemID] || [];
  }
}

import { TEST_DATA_PATH } from './constants';

export function getTestDataMetadataRepository(): CUDLMetadataRepository {
  return new CUDLMetadataRepository(path.resolve(TEST_DATA_PATH, 'metadata'));
}

export function getTestDataLegacyDarwinMetadataRepository(): LegacyDarwinMetadataRepository {
  return new LegacyDarwinMetadataRepository(
    path.resolve(TEST_DATA_PATH, 'legacy-darwin')
  );
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
    return execute({ ...options, ...this.options });
  }

  close() {}
}

/**
 * Get an XSLTExecutor that doesn't need to be close()d to avoid leaking.
 */
export function getTestXSLTExecutor(options?: CreateOptions): XSLTExecutor {
  return (new TestXSLTExecutor(options) as unknown) as XSLTExecutor;
}
