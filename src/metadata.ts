import * as assert from 'assert';
import { AssertionError } from 'assert';
import fs from 'fs';
import path from 'path';
import * as util from 'util';
import { promisify } from 'util';
import {
  BaseError,
  isEnumMember,
  isSimplePathSegment,
  NotFoundError,
} from './util';

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
  descriptiveMetadata?: [
    {
      metadataRights?: string;
    }
  ];
}

export function isItemJSON(data: any): data is ItemJSON {
  if (typeof data !== 'object') {
    return false;
  }

  return (
    (data.embeddable === undefined || typeof data.embeddable === 'boolean') &&
    Array.isArray(data.descriptiveMetadata) &&
    (data.descriptiveMetadata || []).every(
      (dmd: any) =>
        (typeof dmd === 'object' && dmd.metadataRights === undefined) ||
        typeof dmd.metadataRights === 'string'
    )
  );
}

export enum LegacyDarwinFormat {
  DEFAULT = 'dcpfull',
}

export class LegacyDarwinMetadataRepository extends BaseMetadataRepository<
  LegacyDarwinFormat.DEFAULT
> {
  private readonly pathResolver: PathResolver;

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

type PathResolver = (id: string) => Promise<string>;

interface CachedIDMap {
  seq: number;
  paths: Map<string, string>;
  dirModifiedTime: number;
  expirationTime: number;
}

export function createLegacyDarwinPathResolver(dataDir: string): PathResolver {
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
