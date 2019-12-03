import fs from 'fs';
import path from 'path';
import * as util from 'util';
import { promisify } from 'util';
import { BaseError, isSimplePathSegment } from './util';

export class MetadataError extends BaseError {}

export class MetadataRepository {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  getPath(format: string, id: string) {
    for (const { name, value } of [
      { name: 'format', value: format },
      { name: 'id', value: id },
    ]) {
      if (!isSimplePathSegment(value)) {
        throw new Error(
          `${name} is not a valid path segment: ${util.inspect(value)}`
        );
      }
    }

    if (format === 'json') {
      return path.join(this.dataDir, 'json', `${id}.json`);
    }
    return path.join(this.dataDir, 'data', format, id, `${id}.xml`);
  }

  async getJSON(id: string): Promise<ItemJSON> {
    const jsonPath = this.getPath('json', id);
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
