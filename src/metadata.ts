import * as assert from 'assert';
import {AssertionError} from 'assert';
import fs from 'fs';
import path from 'path';
import * as util from 'util';
import {promisify} from 'util';
import {BaseError, NotFoundError} from './errors';
import {asUnknownObject, isSimplePathSegment} from './util';
import {Memoize} from 'typescript-memoize';

export interface MetadataResponse {
  getId(): string;
  getBytes(): Promise<Buffer>;
}

export interface MetadataProvider<
  ResponseType extends MetadataResponse = MetadataResponse
> {
  query(id: string): Promise<ResponseType>;
}

export interface MetadataPredicate<
  MetadataResponseType extends MetadataResponse = MetadataResponse
> {
  (metadataResponse: MetadataResponseType): Promise<boolean | undefined>;
}

export const isExternalEmbedPermitted = Symbol('isExternalEmbedPermitted');
export interface ExternalEmbedAware {
  [isExternalEmbedPermitted](): Promise<boolean>;
}
export function isExternalEmbedAware(obj: object): obj is ExternalEmbedAware {
  return (
    typeof (obj as Partial<ExternalEmbedAware>)[isExternalEmbedPermitted] ===
    'function'
  );
}

export interface ExternalEmbedPermissionArbiter {
  isEmbeddable(metadataResponse: MetadataResponse): boolean | undefined;
}

export const isExternalAccessPermitted = Symbol('isExternallyAccessible');
export interface ExternalAccessAware {
  [isExternalAccessPermitted](): Promise<boolean>;
}
export function isExternalAccessAware(obj: object): obj is ExternalAccessAware {
  return (
    typeof (obj as Partial<ExternalAccessAware>)[isExternalAccessPermitted] ===
    'function'
  );
}
export interface ExternalAccessPermissionArbiter {
  isExternalAccessPermitted(
    metadataResponse: MetadataResponse
  ): boolean | undefined;
}

export class MetadataError extends BaseError {}

export interface MetadataRepository<F extends string = string> {
  getPath(format: F, id: string): Promise<string>;
  getBytes(format: F, id: string): Promise<Buffer>;
}

export enum CUDLFormat {
  DCP = 'dcp',
  EAD = 'ead',
  ESSAY = 'essay',
  MODS = 'mods',
  TEI = 'tei',
  TRANSCRIPTION = 'transcription',
  JSON = 'json',
}

abstract class BaseMetadataRepository<T extends string>
  implements MetadataRepository<T> {
  abstract getPath(format: T, id: string): Promise<string>;

  async getBytes(format: T, id: string): Promise<Buffer> {
    const path = await this.getPath(format, id);
    try {
      return await promisify(fs.readFile)(path);
    } catch (e) {
      throw new MetadataError(
        `Failed to load metadata from ${path}: ${e.message}`,
        e
      );
    }
  }
}

export interface CUDLMetadataRepository extends MetadataRepository<CUDLFormat> {
  getJSON(id: string): Promise<ItemJSON>;
}

export class DefaultCUDLMetadataRepository
  extends BaseMetadataRepository<CUDLFormat>
  implements CUDLMetadataRepository {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    super();
    this.dataDir = dataDir;
  }

  async getPath(format: CUDLFormat, id: string) {
    assert.ok(isSimplePathSegment(format));

    if (format === CUDLFormat.TRANSCRIPTION) {
      const idParts = /^([\w-]+)\/([\w-]+)(?:\.xml)?$/.exec(id);
      if (!idParts) {
        throw new Error(`Invalid ${CUDLFormat.TRANSCRIPTION} id: ${id}`);
      }
      return path.join(
        this.dataDir,
        'data',
        format,
        idParts[1],
        `${idParts[2]}.xml`
      );
    }

    if (!isSimplePathSegment(id)) {
      throw new Error(
        `${name} is not a valid path segment: ${util.inspect(id)}`
      );
    }

    if (format === CUDLFormat.JSON) {
      return path.join(this.dataDir, 'json', `${id}.json`);
    }
    return path.join(this.dataDir, 'data', format, id, `${id}.xml`);
  }

  async getJSON(id: string): Promise<ItemJSON> {
    const jsonPath = await this.getPath(CUDLFormat.JSON, id);
    try {
      const content = await promisify(fs.readFile)(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      if (!isItemJSON(data)) {
        throw new MetadataError('unexpected JSON structure');
      }
      return data;
    } catch (e) {
      throw new MetadataError(
        `Failed to load metadata from ${jsonPath}: ${e.message}`,
        e
      );
    }
  }
}

export interface ItemJSON {
  embeddable?: boolean;
  descriptiveMetadata?: Array<{
    metadataRights?: string;
  }>;
}

export function isItemJSON(data: unknown): data is ItemJSON {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const _data = asUnknownObject(data);

  const descMetaIsPresentAsArray =
    Array.isArray(_data.descriptiveMetadata) &&
    (_data.descriptiveMetadata || []).every((dmd: unknown) => {
      return (
        typeof dmd === 'object' &&
        dmd !== null &&
        !Array.isArray(dmd) &&
        (asUnknownObject(dmd).metadataRights === undefined ||
          typeof asUnknownObject(dmd).metadataRights === 'string')
      );
    });

  return (
    (_data.embeddable === undefined || typeof _data.embeddable === 'boolean') &&
    (_data.descriptiveMetadata === undefined || descMetaIsPresentAsArray)
  );
}

export enum LegacyDarwinFormat {
  DEFAULT = 'dcpfull',
}

export class LegacyDarwinMetadataRepository extends BaseMetadataRepository<LegacyDarwinFormat.DEFAULT> {
  private readonly pathResolver: LocationResolver;

  constructor(dataDir: string) {
    super();
    this.pathResolver = createLegacyDarwinPathResolver(dataDir);
  }

  async getPath(id: string): Promise<string>;
  async getPath(
    format: LegacyDarwinFormat.DEFAULT,
    id: string
  ): Promise<string>;
  async getPath(format: string, id?: string) {
    if (id === undefined) {
      id = format;
      format = LegacyDarwinFormat.DEFAULT;
    }
    assert.ok(format === LegacyDarwinFormat.DEFAULT);
    return this.pathResolver(id);
  }
}

export type LocationResolver = (id: string) => Promise<string>;

interface CachedIDMap {
  seq: number;
  paths: Map<string, string>;
  dirModifiedTime: number;
  expirationTime: number;
}

export function createLegacyDarwinPathResolver(
  dataDir: string
): LocationResolver {
  const cacheTTL = 60 * 1000;
  let seq = 0;
  let cachedIDMap: CachedIDMap | undefined;
  let nextCachedIDMap: Promise<CachedIDMap> | undefined;

  const getCachedIDMap = async (now: number) => {
    const dirModifiedTime = (await promisify(fs.stat)(dataDir)).mtimeMs;
    return {
      seq: seq++,
      dirModifiedTime,
      expirationTime: now + cacheTTL,
      paths: await getLegacyDarwinMetadataPaths(dataDir),
    };
  };

  return async (id): Promise<string> => {
    const now = Date.now();

    if (cachedIDMap === undefined && nextCachedIDMap === undefined) {
      nextCachedIDMap = getCachedIDMap(now);
    }

    const _cachedIDMap = await Promise.race(
      [nextCachedIDMap, cachedIDMap].filter(x => x !== undefined)
    );
    if (_cachedIDMap === undefined) {
      throw new AssertionError();
    }
    if (cachedIDMap === undefined || cachedIDMap.seq !== _cachedIDMap.seq) {
      cachedIDMap = _cachedIDMap;
      nextCachedIDMap = undefined;
    }

    if (now > _cachedIDMap.expirationTime && nextCachedIDMap === undefined) {
      nextCachedIDMap = getCachedIDMap(now);
    }

    const relPath = _cachedIDMap.paths.get(id);
    if (relPath === undefined) {
      throw new NotFoundError(`no metadata found for id: ${id}`);
    }
    return path.resolve(dataDir, relPath);
  };
}

async function getLegacyDarwinMetadataPaths(
  dataDir: string
): Promise<Map<string, string>> {
  const files = await promisify(fs.readdir)(dataDir);
  files.sort();

  const paths = new Map();
  for (const f of files) {
    const match = /^([a-zA-Z0-9]+)_.*\.xml$/.exec(f);

    if (match) {
      const id = match[1];
      if (!paths.has(id)) {
        paths.set(id, f);
      }
    }
  }

  return paths;
}

export interface DataStore {
  read(location: string): Promise<Buffer>;
}

type DataProvider = () => Promise<Buffer>;

export interface MetadataResponseGenerator<ResponseType> {
  generateResponse(
    id: string,
    dataProvider: DataProvider
  ): Promise<ResponseType>;
}

export class DefaultMetadataProvider<ResponseType extends MetadataResponse>
  implements MetadataProvider<ResponseType> {
  readonly metadataStore: DataStore;
  readonly locationResolver: LocationResolver;
  readonly responseGenerator: MetadataResponseGenerator<ResponseType>;

  constructor(
    metadataStore: DataStore,
    locationResolver: LocationResolver,
    responseGenerator: MetadataResponseGenerator<ResponseType>
  ) {
    this.metadataStore = metadataStore;
    this.locationResolver = locationResolver;
    this.responseGenerator = responseGenerator;
  }

  query(id: string): Promise<ResponseType> {
    return this.responseGenerator.generateResponse(id, async () =>
      this.metadataStore.read(await this.locationResolver(id))
    );
  }
}

export class DefaultMetadataResponse implements MetadataResponse {
  private readonly id: string;
  private readonly dataProvider: DataProvider;

  constructor(id: string, dataProvider: DataProvider) {
    this.id = id;
    this.dataProvider = dataProvider;
  }

  @Memoize()
  async getBytes(): Promise<Buffer> {
    return this.dataProvider();
  }

  getId(): string {
    return this.id;
  }
}

export class ItemJsonMetadataResponse
  extends DefaultMetadataResponse
  implements ExternalAccessAware, ExternalEmbedAware {
  async [isExternalAccessPermitted](): Promise<boolean> {
    // We only want to allow external access to the metadata if the metadataRights field is present
    // and non-empty.
    const item = await this.asJson();
    return !!item.descriptiveMetadata?.[0]?.metadataRights?.trim();
  }

  async [isExternalEmbedPermitted](): Promise<boolean> {
    const embeddable = (await this.asJson()).embeddable;
    return embeddable === undefined || embeddable;
  }

  async asJson(): Promise<ItemJSON> {
    const data = parseJsonMetadata((await this.getBytes()).toString());
    if (!isItemJSON(data)) {
      throw new MetadataError('unexpected JSON structure');
    }
    return data;
  }
}

function parseJsonMetadata(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new MetadataError(`data is not valid JSON: ${e}`);
  }
}

/**
 * Creates a MetadataResponse function that delegates its answer to the MetadataResponse provided
 * by a MetadataProvider if the actual input MetadataResponse has no result.
 *
 * @param metadataPredicate The function whose result will be returned
 * @param delegatedMetadataProvider The provider of the delegated response
 * @return A MetadataPredicate function
 */
export function DelegatingMetadataPredicate<
  MetadataResponseType extends MetadataResponse = MetadataResponse
>(
  metadataPredicate: MetadataPredicate<MetadataResponseType>,
  delegatedMetadataProvider: MetadataProvider<MetadataResponseType>
): MetadataPredicate<MetadataResponseType> {
  return async function DelegatingMetadataPredicate(
    metadataResponse: MetadataResponseType
  ) {
    const result = await metadataPredicate(metadataResponse);
    if (result !== undefined) {
      return result;
    }
    return await metadataPredicate(
      await delegatedMetadataProvider.query(metadataResponse.getId())
    );
  };
}

export async function IsExternalEmbedPermitted(
  metadataResponse: MetadataResponse
) {
  return isExternalEmbedAware(metadataResponse)
    ? await metadataResponse[isExternalEmbedPermitted]()
    : undefined;
}

export async function IsExternalAccessPermitted(
  metadataResponse: MetadataResponse
) {
  return isExternalAccessAware(metadataResponse)
    ? await metadataResponse[isExternalAccessPermitted]()
    : undefined;
}
