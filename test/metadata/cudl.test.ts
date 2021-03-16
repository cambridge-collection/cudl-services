import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';
import {TEST_DATA_PATH} from '../constants';
import {
  CUDLFormat,
  cudlProvidersForDataStore,
  DataLocationResolver,
  MetadataProviderCUDLMetadataRepository,
  resolveItemJsonLocation,
  resolveTranscriptionLocation,
} from '../../src/metadata/cudl';
import {FilesystemDataStore} from '../../src/metadata/filesystem';
import {ErrorCategories} from '../../src/errors';
import {DataStore} from '../../src/metadata';

import 'jest-extended';

const CUDL_METADATA_PATH = path.resolve(TEST_DATA_PATH, 'metadata');
const ITEM_JSON_PATH = path.resolve(
  CUDL_METADATA_PATH,
  'json/MS-ADD-03959.json'
);

describe('LocationResolvers', () => {
  describe('CUDLFormat.TRANSCRIPTION LocationResolver', () => {
    test.each([
      [
        'MS-NN-00002-00041/Bezae-Latin.xml',
        'data/transcription/MS-NN-00002-00041/Bezae-Latin.xml',
      ],
      [
        'MS-NN-00002-00041/Bezae-Latin',
        'data/transcription/MS-NN-00002-00041/Bezae-Latin.xml',
      ],
    ])('resolves %j -> %j', async (id, expected) => {
      await expect(resolveTranscriptionLocation(id)).resolves.toBe(expected);
    });

    test.each(['foo', 'foo.xml', 'foo/bar/baz', '../foo.xml', '/foo'])(
      'rejects invalid ID %j',
      async invalidId => {
        await expect(resolveTranscriptionLocation(invalidId)).rejects.toThrow(
          `Invalid transcription id: ${invalidId}`
        );
      }
    );
  });

  const INVALID_IDS = ['', 'foo/bar', '../foo', 'foo.bar'];

  describe('CUDLFormat.JSON LocationResolver', () => {
    test('resolves id to JSON file location', async () => {
      await expect(resolveItemJsonLocation('MS-FOO-BAR')).resolves.toBe(
        'json/MS-FOO-BAR.json'
      );
    });

    test.each(INVALID_IDS)('rejects invalid ID %j', async invalidId => {
      await expect(resolveItemJsonLocation(invalidId)).rejects.toThrow(
        `invalid id: ${invalidId}`
      );
    });
  });

  describe('DataLocationResolver', () => {
    test('resolves id to data file location', async () => {
      await expect(DataLocationResolver('example')('MS-FOO-BAR')).resolves.toBe(
        'data/example/MS-FOO-BAR/MS-FOO-BAR.xml'
      );
    });

    test.each(INVALID_IDS)('rejects invalid ID %j', async invalidId => {
      await expect(DataLocationResolver('example')(invalidId)).rejects.toThrow(
        `invalid id: ${invalidId}`
      );
    });

    test.each(INVALID_IDS)(
      'rejects invalid formatDir %j',
      async invalidFormatDir => {
        expect(() => DataLocationResolver(invalidFormatDir)).toThrow(
          `invalid formatDir: ${invalidFormatDir}`
        );
      }
    );
  });
});

describe('cudlProvidersForDataStore', () => {
  const mockDataStore = jest.fn<DataStore, []>(() => ({
    read: jest.fn().mockResolvedValue(Buffer.from('data')),
  }))();

  const paths: Partial<Record<CUDLFormat, string>> = {
    [CUDLFormat.TRANSCRIPTION]: 'foo/bar',
  };

  test.each(Object.values(CUDLFormat))(
    'uses provided DataStore for provider of CUDLFormat %s',
    async type => {
      const providers = cudlProvidersForDataStore(mockDataStore);
      await expect(
        (await providers[type].query(paths[type] || 'mock')).getBytes()
      ).resolves.toEqual(Buffer.from('data'));
    }
  );
});

describe('MetadataProviderCUDLMetadataRepository', () => {
  function getRepo() {
    return MetadataProviderCUDLMetadataRepository.forDataStore(
      new FilesystemDataStore(CUDL_METADATA_PATH)
    );
  }

  test('getBytes() returns file contents', async () => {
    expect(
      await getRepo().getBytes(CUDLFormat.TRANSCRIPTION, 'MS-FOO/foo')
    ).toEqual(Buffer.from('<foo/>\n'));
  });

  test('getBytes() throws MetadataError for missing data', async () => {
    const resp = getRepo().getBytes(CUDLFormat.TRANSCRIPTION, 'MS-FOO/bar');
    await expect(resp).rejects.toThrow(
      /Failed to load metadata from .*\/data\/transcription\/MS-FOO\/bar\.xml: ENOENT: no such file or directory, open '.*\/data\/transcription\/MS-FOO\/bar.xml'/
    );

    await expect(resp).rejects.toThrowErrorTaggedWith(ErrorCategories.NotFound);
  });

  test('getJSON() returns parsed JSON metadata', async () => {
    expect(await getRepo().getJSON('MS-ADD-03959')).toEqual(
      JSON.parse(await promisify(fs.readFile)(ITEM_JSON_PATH, 'utf-8'))
    );
  });

  test('getJSON() reports missing file', async () => {
    expect.assertions(2);

    const repo = getRepo();
    try {
      await repo.getJSON('MISSING');
    } catch (e) {
      expect(`${e}`).toMatch(
        `MetadataError: Failed to load metadata from filesystem path ${path.join(
          CUDL_METADATA_PATH,
          'json',
          'MISSING.json'
        )}: ENOENT: no such file or directory`
      );
      expect(e.nested.code).toBe('ENOENT');
    }
  });

  test('getJSON() reports broken JSON', async () => {
    expect.assertions(2);

    const repo = getRepo();
    try {
      await repo.getJSON('INVALID');
    } catch (e) {
      expect(`${e}`).toMatch(/^MetadataError: .*Unexpected end of JSON input$/);
      expect(e.nested).toBeInstanceOf(SyntaxError);
    }
  });

  test('getJSON() reports JSON with invalid properties', async () => {
    expect.assertions(1);

    const repo = getRepo();
    try {
      await repo.getJSON('INVALID_PROPERTIES');
    } catch (e) {
      expect(`${e}`).toMatch(/^MetadataError: .*unexpected JSON structure$/);
    }
  });
});
