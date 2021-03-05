import {FilesystemDataStore} from '../src/metadata/filesystem';
import {ErrorCategories} from '../src/errors';

describe('FilesystemDataStore', () => {
  test('read() rejects on fs read errors', async () => {
    const result = new FilesystemDataStore('/example').read('missing/file');
    await expect(result).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to load metadata from filesystem path /example/missing/file: ENOENT: no such file or directory, open \'/example/missing/file\'"'
    );
    await expect(result).rejects.toThrowErrorTaggedWith(
      ErrorCategories.NotFound
    );
  });
});
