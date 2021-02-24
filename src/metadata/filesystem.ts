import {DataStore, MetadataError} from '../metadata';
import {ValueError} from '../errors';
import path from 'path';
import fs from 'fs/promises';

export class FilesystemDataStore implements DataStore {
  public readonly rootPath: string;

  constructor(rootPath: string) {
    if (!path.isAbsolute(rootPath)) {
      throw new ValueError(`rootPath is not absolute: ${rootPath}`);
    }
    this.rootPath = rootPath;
  }

  async read(location: string): Promise<Buffer> {
    const target = path.resolve(this.rootPath, location);
    if (!target.startsWith(`${this.rootPath}${path.sep}`)) {
      throw new ValueError('location is not under the root');
    }
    try {
      return await fs.readFile(target);
    } catch (e) {
      throw new MetadataError(
        `Failed to load metadata from filesystem path ${target}: ${e.message}`,
        e
      );
    }
  }
}
