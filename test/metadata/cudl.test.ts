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
import {
  DataStore,
  MetadataError,
  UnreleasedFallbackDataStore,
} from '../../src/metadata';

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
        'items/data/example/MS-FOO-BAR/MS-FOO-BAR.xml'
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

describe('UnreleasedFallbackDataStore', () => {
  function notFound(location: string) {
    return new MetadataError({
      message: `missing ${location}`,
      tags: [ErrorCategories.NotFound],
    });
  }

  test('reads the released location when present', async () => {
    const read = jest.fn().mockResolvedValue(Buffer.from('released'));
    const store = new UnreleasedFallbackDataStore({read});
    await expect(store.read('items/data/tei/X/X.xml')).resolves.toEqual(
      Buffer.from('released')
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('falls back to unreleased/ when the location is not found', async () => {
    const read = jest
      .fn()
      .mockImplementationOnce(async (loc: string) => {
        throw notFound(loc);
      })
      .mockResolvedValueOnce(Buffer.from('draft'));
    const store = new UnreleasedFallbackDataStore({read});
    await expect(store.read('items/data/tei/X/X.xml')).resolves.toEqual(
      Buffer.from('draft')
    );
    expect(read).toHaveBeenLastCalledWith('unreleased/items/data/tei/X/X.xml');
  });

  test('throws the original error when neither location exists', async () => {
    const read = jest.fn(async (loc: string) => {
      throw notFound(loc);
    });
    const store = new UnreleasedFallbackDataStore({read});
    const result = store.read('items/data/tei/X/X.xml');
    await expect(result).rejects.toThrow('missing items/data/tei/X/X.xml');
    await expect(result).rejects.toThrowErrorTaggedWith(
      ErrorCategories.NotFound
    );
  });

  test('does not fall back for errors other than NotFound', async () => {
    const read = jest.fn().mockRejectedValue(new Error('boom'));
    const store = new UnreleasedFallbackDataStore({read});
    await expect(store.read('items/data/tei/X/X.xml')).rejects.toThrow('boom');
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('cudlProvidersForDataStore unreleased fallback', () => {
  const providers = () =>
    cudlProvidersForDataStore(new FilesystemDataStore(CUDL_METADATA_PATH));

  test('serves draft TEI from unreleased/', async () => {
    await expect(
      (await providers()[CUDLFormat.TEI].query('MS-DRAFT')).getBytes()
    ).resolves.toEqual(
      Buffer.from('<TEI xmlns="http://www.tei-c.org/ns/1.0"/>\n')
    );
  });

  test('reports NotFound for TEI missing from both locations', async () => {
    await expect(
      (await providers()[CUDLFormat.TEI].query('MS-MISSING')).getBytes()
    ).rejects.toThrowErrorTaggedWith(ErrorCategories.NotFound);
  });
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

  // test('getJSON() reports missing file', async () => {
  //   expect.assertions(2);
  //
  //   const repo = getRepo();
  //   try {
  //     await repo.getJSON('MISSING');
  //   } catch (e) {
  //     expect(`${e}`).toMatch(
  //       `MetadataError: Failed to load metadata from filesystem path ${path.join(
  //         CUDL_METADATA_PATH,
  //         'json',
  //         'MISSING.json'
  //       )}: ENOENT: no such file or directory`
  //     );
  //     expect(e.nested.code).toBe('ENOENT');
  //   }
  // });

  // test('getJSON() reports broken JSON', async () => {
  //   expect.assertions(2);
  //
  //   const repo = getRepo();
  //   try {
  //     await repo.getJSON('INVALID');
  //   } catch (e) {
  //     expect(`${e}`).toMatch(/^MetadataError: .*Unexpected end of JSON input$/);
  //     expect(e.nested).toBeInstanceOf(SyntaxError);
  //   }
  // });

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
