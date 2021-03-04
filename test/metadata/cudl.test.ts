import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';
import {TEST_DATA_PATH} from '../constants';
import {
  CUDLFormat,
  CUDLMetadataRepository,
  DataLocationResolver,
  DefaultCUDLMetadataRepository,
  MetadataProviderCUDLMetadataRepository,
  resolveItemJsonLocation,
  resolveTranscriptionLocation,
} from '../../src/metadata/cudl';
import {FilesystemDataStore} from '../../src/metadata/filesystem';

const CUDL_METADATA_PATH = path.resolve(TEST_DATA_PATH, 'metadata');

function getDefaultCUDLMetadataRepository() {
  return new DefaultCUDLMetadataRepository(CUDL_METADATA_PATH);
}

function getMetadataProviderCUDLMetadataRepository() {
  return MetadataProviderCUDLMetadataRepository.forDataStore(
    new FilesystemDataStore(CUDL_METADATA_PATH)
  );
}

const ITEM_JSON_PATH = path.resolve(
  CUDL_METADATA_PATH,
  'json/MS-ADD-03959.json'
);
const ITEM_TEI_PATH = path.resolve(
  CUDL_METADATA_PATH,
  'data/tei/MS-ADD-03959/MS-ADD-03959.xml'
);
const TRANSCRIPTION_PATH = path.resolve(
  CUDL_METADATA_PATH,
  'data/transcription/MS-FOO/foo.xml'
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

describe('CUDLMetadataRepository', () => {
  function testCUDLMetadataRepository(options: {
    getRepo: () => CUDLMetadataRepository;
    testGetPath: boolean;
  }) {
    const {getRepo, testGetPath} = options;

    if (testGetPath) {
      test('getPath() returns JSON metadata path', async () => {
        expect(await getRepo().getPath(CUDLFormat.JSON, 'MS-ADD-03959')).toBe(
          ITEM_JSON_PATH
        );
      });

      test('getPath() returns non-JSON metadata path', async () => {
        expect(await getRepo().getPath(CUDLFormat.TEI, 'MS-ADD-03959')).toBe(
          ITEM_TEI_PATH
        );
      });

      test.each([['MS-FOO/foo'], ['MS-FOO/foo.xml']])(
        'getPath() returns transcription metadata path',
        async id => {
          expect(await getRepo().getPath(CUDLFormat.TRANSCRIPTION, id)).toBe(
            TRANSCRIPTION_PATH
          );
        }
      );
    }

    test('getBytes() returns file contents', async () => {
      expect(
        await getRepo().getBytes(CUDLFormat.TRANSCRIPTION, 'MS-FOO/foo')
      ).toEqual(Buffer.from('<foo/>\n'));
    });

    test('getBytes() throws MetadataError for missing data', async () => {
      await expect(
        getRepo().getBytes(CUDLFormat.TRANSCRIPTION, 'MS-FOO/bar')
      ).rejects.toThrow(
        /Failed to load metadata from .*\/data\/transcription\/MS-FOO\/bar\.xml: ENOENT: no such file or directory, open '.*\/data\/transcription\/MS-FOO\/bar.xml'/
      );
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
        expect(`${e}`).toMatch(
          /^MetadataError: .*Unexpected end of JSON input$/
        );
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
  }

  describe('DefaultCUDLMetadataRepository', () => {
    testCUDLMetadataRepository({
      getRepo: getDefaultCUDLMetadataRepository,
      testGetPath: true,
    });
  });

  describe('MetadataProviderCUDLMetadataRepository', () => {
    testCUDLMetadataRepository({
      getRepo: getMetadataProviderCUDLMetadataRepository,
      testGetPath: false,
    });
  });
});
