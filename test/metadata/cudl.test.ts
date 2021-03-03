import * as fs from 'fs';
import * as path from 'path';
import {withDir} from 'tmp-promise';
import {promisify} from 'util';
import {NotFoundError} from '../../src/errors';
import {TEST_DATA_PATH} from '../constants';
import {
  createLegacyDarwinPathResolver,
  CUDLFormat,
  DefaultCUDLMetadataRepository,
} from '../../src/metadata/cudl';

function getRepo() {
  return new DefaultCUDLMetadataRepository(
    path.resolve(TEST_DATA_PATH, 'metadata')
  );
}

const ITEM_JSON_PATH = path.resolve(
  TEST_DATA_PATH,
  'metadata/json/MS-ADD-03959.json'
);
const ITEM_TEI_PATH = path.resolve(
  TEST_DATA_PATH,
  'metadata/data/tei/MS-ADD-03959/MS-ADD-03959.xml'
);
const TRANSCRIPTION_PATH = path.resolve(
  TEST_DATA_PATH,
  'metadata/data/transcription/MS-FOO/foo.xml'
);

describe('CUDLMetadataRepository', () => {
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
        `MetadataError: Failed to load metadata from ${await repo.getPath(
          CUDLFormat.JSON,
          'MISSING'
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
        `MetadataError: Failed to load metadata from ${await repo.getPath(
          CUDLFormat.JSON,
          'INVALID'
        )}: Unexpected end of JSON input`
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
      expect(`${e}`).toMatch(
        `MetadataError: Failed to load metadata from ${await repo.getPath(
          CUDLFormat.JSON,
          'INVALID_PROPERTIES'
        )}: unexpected JSON structure`
      );
    }
  });
});

describe('LegacyDarwinPathResolver', () => {
  const dateNow = Date.now;
  let now = 0;
  beforeEach(() => {
    global.Date.now = jest.fn(() => now);
  });
  afterEach(() => {
    global.Date.now = dateNow;
  });

  test('LegacyDarwinPathResolver uses cached path mapping', async () => {
    const pathResolver = createLegacyDarwinPathResolver(
      path.resolve(TEST_DATA_PATH, 'legacy-darwin')
    );

    await expect(pathResolver('1a')).resolves.toBe(
      path.resolve(TEST_DATA_PATH, 'legacy-darwin', '1a_2a.xml')
    );
    await expect(pathResolver('3a')).resolves.toBe(
      path.resolve(TEST_DATA_PATH, 'legacy-darwin', '3a_4a.xml')
    );
    await expect(pathResolver('foo')).rejects.toThrow(
      new NotFoundError('no metadata found for id: foo')
    );
  });

  test('LegacyDarwinPathResolver refreshes entries after TTL expires', async () => {
    await withDir(
      async dir => {
        expect(Date.now()).toBe(0);
        const pathResolver = createLegacyDarwinPathResolver(dir.path);
        await promisify(fs.writeFile)(path.resolve(dir.path, '1a_2b.xml'), '');

        await expect(pathResolver('1a')).resolves.toEqual(
          path.resolve(dir.path, '1a_2b.xml')
        );

        // 1a still resolves to the (cached) original, as the TTL has not expired
        await promisify(fs.writeFile)(path.resolve(dir.path, '1a_2a.xml'), '');
        await expect(pathResolver('1a')).resolves.toEqual(
          path.resolve(dir.path, '1a_2b.xml')
        );

        now = 61 * 1000;
        expect(Date.now()).toBe(61 * 1000);
        // The old cache is used until the replacement is ready
        await expect(pathResolver('1a')).resolves.toEqual(
          path.resolve(dir.path, '1a_2b.xml')
        );

        await sleep(500);
        await expect(pathResolver('1a')).resolves.toEqual(
          path.resolve(dir.path, '1a_2a.xml')
        );
      },
      {unsafeCleanup: true}
    );
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
