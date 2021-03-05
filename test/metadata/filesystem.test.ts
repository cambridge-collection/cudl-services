import {mocked} from 'ts-jest/utils';

import fs from 'fs/promises';

import {FilesystemDataStore} from '../../src/metadata/filesystem';
import {ErrorCategories, ValueError} from '../../src/errors';

jest.mock('fs/promises', (): typeof fs => {
  const _fs = jest.createMockFromModule('fs/promises') as typeof fs;
  mocked(_fs.readFile).mockImplementation(async path => {
    if (path === '/example/my/file') {
      return Buffer.from('data');
    }
    throw Object.assign(
      new Error(
        "ENOENT: no such file or directory, open '/example/missing/file'"
      ),
      {
        errno: -2,
        code: 'ENOENT',
        syscall: 'open',
        path: path,
      }
    );
  });
  return _fs;
});

describe('FilesystemDataStore', () => {
  test('rootPath must be absolute', () => {
    expect(() => new FilesystemDataStore('foo')).toThrow(
      new ValueError('rootPath is not absolute: foo')
    );
  });

  test('read() reads from fs', async () => {
    const buffer = await new FilesystemDataStore('/example').read('my/file');
    expect(mocked(fs.readFile).mock.calls[0][0]).toEqual('/example/my/file');
    expect(buffer.toString()).toEqual('data');
  });

  test('read() rejects absolute locations', async () => {
    await expect(
      new FilesystemDataStore('/example').read('/abs/path')
    ).rejects.toThrow(new ValueError('location is not under the root'));
  });

  test('read() rejects locations outside the root', async () => {
    await expect(
      new FilesystemDataStore('/example').read('../sibling/path')
    ).rejects.toThrow(new ValueError('location is not under the root'));
  });

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
