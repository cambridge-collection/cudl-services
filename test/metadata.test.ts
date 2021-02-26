import * as fs from 'fs';
import * as path from 'path';
import {withDir} from 'tmp-promise';
import {promisify} from 'util';
import {NotFoundError} from '../src/errors';
import {
  createLegacyDarwinPathResolver,
  CUDLFormat,
  DataStore,
  DefaultCUDLMetadataRepository,
  DefaultMetadataProvider,
  DefaultMetadataResponse,
  isExternalAccessAware,
  isExternalAccessPermitted,
  isExternalEmbedAware,
  isExternalEmbedPermitted,
  isItemJSON,
  ItemJSON,
  ItemJsonMetadataResponse,
  LocationResolver,
  MetadataResponse,
  MetadataResponseGenerator,
} from '../src/metadata';
import {TEST_DATA_PATH} from './constants';
import {mocked} from 'ts-jest/utils';

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

test.each([
  [true, {}],
  [true, {embeddable: true}],
  [true, {descriptiveMetadata: []}],
  [true, {descriptiveMetadata: [{}]}],
  [true, {descriptiveMetadata: [{metadataRights: ''}]}],
  [false, {embeddable: 123}],
  [false, {descriptiveMetadata: {}}],
  [false, {descriptiveMetadata: [[]]}],
  [false, {descriptiveMetadata: [{metadataRights: 123}]}],
])('isItemJSON returns %p for example %#', (expected, value) => {
  expect(isItemJSON(value)).toBe(expected);
});

describe('DefaultMetadataProvider', () => {
  const data = Buffer.from('data');
  let dataStore: DataStore;
  let locationResolver: LocationResolver;
  let responseGenerator: MetadataResponseGenerator<MetadataResponse>;
  let provider: DefaultMetadataProvider<MetadataResponse>;

  beforeEach(() => {
    dataStore = {read: jest.fn().mockReturnValue(Promise.resolve(data))};
    locationResolver = jest.fn().mockReturnValue(Promise.resolve('/path'));
    const generateResponse: MetadataResponseGenerator<MetadataResponse>['generateResponse'] = async (
      id,
      dataProvider
    ) => {
      return {
        getBytes: () => dataProvider(),
        getId() {
          return id;
        },
      };
    };
    responseGenerator = {
      generateResponse: jest.fn().mockImplementation(generateResponse),
    };
    provider = new DefaultMetadataProvider(
      dataStore,
      locationResolver,
      responseGenerator
    );
  });

  test('query() returns MetadataResponse from the ResponseGenerator', async () => {
    await provider.query('foo');
    expect(mocked(responseGenerator.generateResponse).mock.calls).toHaveLength(
      1
    );
    expect(mocked(responseGenerator.generateResponse).mock.calls[0][0]).toBe(
      'foo'
    );
  });

  test('MetadataResponse returned from query() can load Buffers', async () => {
    const response = await provider.query('foo');
    await expect(response.getBytes()).resolves.toBe(data);
  });

  test('LocationResolver is used to create paths', async () => {
    await (await provider.query('foo')).getBytes();
    await expect(mocked(locationResolver).mock.calls).toEqual([['foo']]);
    await expect(mocked(dataStore.read).mock.calls).toEqual([['/path']]);
  });
});

describe('DefaultMetadataResponse', () => {
  test('getBytes returns buffer from DataProvider', async () => {
    const response = new DefaultMetadataResponse('example', async () =>
      Buffer.from('data\n')
    );

    await expect(response.getBytes()).resolves.toEqual(Buffer.from('data\n'));
  });

  test('getBytes throws MetadataError on DataProvider error', async () => {
    const response = new DefaultMetadataResponse('example', async () => {
      throw new Error('DataProvider failed');
    });

    await expect(
      response.getBytes()
    ).rejects.toThrowErrorMatchingInlineSnapshot('"DataProvider failed"');
  });

  test('getId', async () => {
    const response = new DefaultMetadataResponse('example', async () =>
      Buffer.from('')
    );
    expect(response.getId()).toBe('example');
  });
});

describe('ItemJsonMetadataResponse', () => {
  test.each([
    [true, true],
    [false, false],
    [undefined, true],
  ])(
    'isExternalEmbedPermitted() where embeddable is %s returns %s',
    async (itemEmbeddableValue, result) => {
      const item: ItemJSON = {
        embeddable: itemEmbeddableValue,
      };
      const response = new ItemJsonMetadataResponse('test', async () =>
        Buffer.from(JSON.stringify(item))
      );

      await expect(response[isExternalEmbedPermitted]()).resolves.toBe(result);
    }
  );

  test.each([
    ['something', true],
    ['', false],
    [undefined, false],
  ])(
    'isExternalAccessPermitted() where metadataRights is %s returns %s',
    async (metadataRights, result) => {
      const item: ItemJSON = {
        descriptiveMetadata: [{metadataRights}],
      };
      const response = new ItemJsonMetadataResponse('test', async () =>
        Buffer.from(JSON.stringify(item))
      );

      await expect(response[isExternalAccessPermitted]()).resolves.toBe(result);
    }
  );

  test('isExternalEmbedAware', async () => {
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from('{}')
    );

    expect(isExternalEmbedAware(response)).toBeTruthy();
  });

  test('isExternalAccessAware', async () => {
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from('{}')
    );

    expect(isExternalAccessAware(response)).toBeTruthy();
  });

  test('asJson returns valid item JSON data', async () => {
    const item: ItemJSON = {
      embeddable: true,
      descriptiveMetadata: [{metadataRights: 'foo'}],
    };
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from(JSON.stringify(item))
    );

    await expect(response.asJson()).resolves.toEqual(item);
  });

  test('asJson throws MetadataError on syntactically invalid JSON data', async () => {
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from('invalid')
    );

    await expect(response.asJson()).rejects.toThrowErrorMatchingInlineSnapshot(
      '"data is not valid JSON: SyntaxError: Unexpected token i in JSON at position 0"'
    );
  });

  test('asJson throws MetadataError on malformed item JSON data', async () => {
    const badItem = {descriptiveMetadata: 123};
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from(JSON.stringify(badItem))
    );

    await expect(response.asJson()).rejects.toThrowErrorMatchingInlineSnapshot(
      '"unexpected JSON structure"'
    );
  });

  test('getBytes returns buffer from DataProvider', async () => {
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from('data\n')
    );

    await expect(response.getBytes()).resolves.toEqual(Buffer.from('data\n'));
  });

  test('getBytes throws MetadataError on DataProvider error', async () => {
    const response = new ItemJsonMetadataResponse('example', async () => {
      throw new Error('DataProvider failed');
    });

    await expect(
      response.getBytes()
    ).rejects.toThrowErrorMatchingInlineSnapshot('"DataProvider failed"');
  });

  test('getId', async () => {
    const response = new ItemJsonMetadataResponse('example', async () =>
      Buffer.from('')
    );
    expect(response.getId()).toBe('example');
  });
});
