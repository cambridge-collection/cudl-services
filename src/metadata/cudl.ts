import util, {promisify} from 'util';
import fs from 'fs';
import assert from 'assert';
import {isSimplePathSegment} from '../util';
import path from 'path';
import {
  DataStore,
  DefaultMetadataProvider,
  DefaultMetadataResponse,
  isItemJSON,
  ItemJSON,
  ItemJsonMetadataResponse,
  LocationResolver,
  MetadataError,
  MetadataProvider,
} from '../metadata';
import {ErrorCategories} from '../errors';

export interface MetadataRepository<F extends string = string> {
  /** @deprecated getPath should not be used — metadata may not be on the local filesystem */
  getPath(format: F, id: string): Promise<string>;

  getBytes(format: F, id: string): Promise<Buffer>;
}

export enum CUDLFormat {
  EAD = 'ead',
  ESSAY = 'essay',
  MODS = 'mods',
  TEI = 'tei',
  TRANSCRIPTION = 'transcription',
  JSON = 'json',
}
const XML_FORMATS = Object.values(CUDLFormat).filter(
  cf => cf !== CUDLFormat.TRANSCRIPTION && cf !== CUDLFormat.JSON
);

abstract class BaseMetadataRepository<T extends string>
  implements MetadataRepository<T> {
  abstract getPath(format: T, id: string): Promise<string>;

  async getBytes(format: T, id: string): Promise<Buffer> {
    const path = await this.getPath(format, id);
    try {
      return await promisify(fs.readFile)(path);
    } catch (e) {
      throw new MetadataError({
        message: `Failed to load metadata from ${path}: ${e.message}`,
        nested: e,
        tags: e?.code === 'ENOENT' ? [ErrorCategories.NotFound] : [],
      });
    }
  }
}

export const resolveTranscriptionLocation: LocationResolver = async function resolveTranscriptionLocation(
  id
) {
  const idParts = /^([\w-]+)\/([\w-]+)(?:\.xml)?$/.exec(id);
  if (!idParts) {
    throw new Error(`Invalid ${CUDLFormat.TRANSCRIPTION} id: ${id}`);
  }
  return path.join(
    'data',
    CUDLFormat.TRANSCRIPTION,
    idParts[1],
    `${idParts[2]}.xml`
  );
};

export const resolveItemJsonLocation: LocationResolver = async function resolveItemJsonLocation(
  id
) {
  if (!isSimplePathSegment(id)) {
    throw new Error(`invalid id: ${id}`);
  }
  return path.join('json', `${id}.json`);
};

export function DataLocationResolver(formatDir: string): LocationResolver {
  if (!isSimplePathSegment(formatDir)) {
    throw new Error(`invalid formatDir: ${formatDir}`);
  }
  return async function resolveDataDirLocation(id: string) {
    if (!isSimplePathSegment(id)) {
      throw new Error(`invalid id: ${id}`);
    }
    return path.join('data', formatDir, id, `${id}.xml`);
  };
}

export interface CUDLMetadataRepository extends MetadataRepository<CUDLFormat> {
  getJSON(id: string): Promise<ItemJSON>;
}

type CUDLProviders = {
  [key in CUDLFormat]: key extends CUDLFormat.JSON
    ? MetadataProvider<ItemJsonMetadataResponse>
    : MetadataProvider;
};

/**
 * A CUDLMetadataRepository backed by the MetadataProvider API. Data can be
 * obtained from location-independent DataStores.
 */
export class MetadataProviderCUDLMetadataRepository
  implements CUDLMetadataRepository {
  private readonly providers: CUDLProviders;

  constructor(providers: CUDLProviders) {
    this.providers = providers;
  }

  async getBytes(format: CUDLFormat, id: string): Promise<Buffer> {
    return (await this.providers[format].query(id)).getBytes();
  }

  async getJSON(id: string): Promise<ItemJSON> {
    return (await this.providers[CUDLFormat.JSON].query(id)).asJson();
  }

  async getPath(): Promise<string> {
    throw new Error('getPath() is not supported in this implementation');
  }

  static forDataStore(
    dataStore: DataStore
  ): MetadataProviderCUDLMetadataRepository {
    const xmlProviders = Object.fromEntries(
      XML_FORMATS.map(format => [
        format,
        new DefaultMetadataProvider(
          dataStore,
          DataLocationResolver(format),
          DefaultMetadataResponse
        ),
      ])
    ) as Partial<Record<CUDLFormat, MetadataProvider>>;

    const providers: Partial<CUDLProviders> = {
      ...xmlProviders,
      [CUDLFormat.TRANSCRIPTION]: new DefaultMetadataProvider(
        dataStore,
        resolveTranscriptionLocation,
        DefaultMetadataResponse
      ),
      [CUDLFormat.JSON]: new DefaultMetadataProvider(
        dataStore,
        resolveItemJsonLocation,
        ItemJsonMetadataResponse
      ),
    };

    assert.deepStrictEqual(
      Object.getOwnPropertyNames(providers),
      Object.values(CUDLFormat)
    );
    return new MetadataProviderCUDLMetadataRepository(
      providers as CUDLProviders
    );
  }
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
        `Failed to load metadata from filesystem path ${jsonPath}: ${e.message}`,
        e
      );
    }
  }
}
