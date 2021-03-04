import util, {promisify} from 'util';
import fs from 'fs';
import assert from 'assert';
import {isSimplePathSegment} from '../util';
import path from 'path';
import {
  isItemJSON,
  ItemJSON,
  LocationResolver,
  MetadataError,
} from '../metadata';

export interface MetadataRepository<F extends string = string> {
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
