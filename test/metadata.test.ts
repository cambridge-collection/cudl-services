import {
  DataStore,
  DefaultMetadataProvider,
  DefaultMetadataResponse,
  DelegatingMetadataPredicate,
  ExternalAccessAware,
  ExternalEmbedAware,
  isExternalAccessAware,
  IsExternalAccessPermitted,
  isExternalAccessPermitted,
  isExternalEmbedAware,
  IsExternalEmbedPermitted,
  isExternalEmbedPermitted,
  isItemJSON,
  ItemJSON,
  ItemJsonMetadataResponse,
  ItemJsonMetadataResponseEmitter,
  LocationResolver,
  MetadataPredicate,
  MetadataProvider,
  MetadataResponse,
  MetadataResponseGenerator,
} from '../src/metadata';
import {mocked} from 'ts-jest/utils';
import {applyLazyDefaults} from '../src/util';
import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import request from 'supertest';

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
    const generateResponse: MetadataResponseGenerator<MetadataResponse>['generateResponse'] =
      async (id, dataProvider) => {
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

  describe('ItemJsonMetadataResponseEmitter', () => {
    const item: ItemJSON = {
      embeddable: true,
      descriptiveMetadata: [],
    };
    const itemResponse = new ItemJsonMetadataResponse('foo', async () =>
      Buffer.from(JSON.stringify(item))
    );
    test('has a static instance', () => {
      expect(ItemJsonMetadataResponseEmitter.instance).toBeInstanceOf(
        ItemJsonMetadataResponseEmitter
      );
    });

    test('canEmit() is true for ItemJsonMetadataResponse', () => {
      expect(ItemJsonMetadataResponseEmitter.instance.canEmit(itemResponse));
    });

    test('canEmit() is false for unsupported MetadataResponses', async () => {
      expect(
        ItemJsonMetadataResponseEmitter.instance.canEmit(
          new DefaultMetadataResponse('foo', async () => Buffer.from(''))
        )
      ).not.toBeTruthy();
    });

    test('emit() writes metadata to response', async () => {
      const app = express();
      app.use(
        '/',
        expressAsyncHandler(async (req, res) => {
          await ItemJsonMetadataResponseEmitter.instance.emit(
            itemResponse,
            res
          );
        })
      );

      const res = await request(app).get('/');
      expect(res.ok);
      expect(res.body).toEqual(item);
    });
  });

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
      '"data is not valid JSON: Unexpected token i in JSON at position 0"'
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

describe('MetadataPredicates', () => {
  describe('DelegatingMetadataPredicate', () => {
    let innerPredicate: MetadataPredicate;
    let delegatedProvider: MetadataProvider;
    let delegatingPredicate: MetadataPredicate;
    const responseA = new DefaultMetadataResponse('example', () => {
      throw new Error('not implemented');
    });
    const responseB = new DefaultMetadataResponse('example', () => {
      throw new Error('not implemented');
    });

    beforeEach(() => {
      innerPredicate = jest.fn();
      delegatedProvider = {query: jest.fn()};
      delegatingPredicate = DelegatingMetadataPredicate(
        innerPredicate,
        delegatedProvider
      );
    });

    test.each([true, false])(
      'a %s response from the predicate results in no delegation',
      async predicateResponse => {
        mocked(innerPredicate).mockReturnValue(
          Promise.resolve(predicateResponse)
        );

        await expect(delegatingPredicate(responseA)).resolves.toBe(
          predicateResponse
        );
      }
    );

    test('an undefined response from the predicate results in delegation', async () => {
      mocked(innerPredicate).mockImplementation(async response => {
        if (response === responseA) return undefined;
        if (response === responseB) return true;
        throw new Error();
      });
      mocked(delegatedProvider.query).mockImplementation(async id => {
        if (id === 'example') return responseB;
        throw new Error();
      });

      await expect(delegatingPredicate(responseA)).resolves.toBe(true);
    });
  });

  describe('IsXxxPermitted', () => {
    let decisionMethod: jest.Mock;
    let metadataResponse: MetadataResponse;

    beforeEach(() => {
      decisionMethod = jest.fn();
      metadataResponse = testMetadataResponse();
    });

    describe('IsExternalEmbedPermitted', () => {
      test('returns undefined if MetadataResponse is not ExternalEmbedAware', async () => {
        expect(isExternalEmbedAware(metadataResponse)).toBeFalsy();
        await expect(
          IsExternalEmbedPermitted(metadataResponse)
        ).resolves.toBeUndefined();
      });

      test('returns result of isExternalEmbedPermitted method if available', async () => {
        (metadataResponse as unknown as ExternalEmbedAware)[
          isExternalEmbedPermitted
        ] = decisionMethod;
        decisionMethod.mockReturnValue(true);

        expect(isExternalEmbedAware(metadataResponse)).toBeTruthy();
        await expect(
          IsExternalEmbedPermitted(metadataResponse)
        ).resolves.toBeTruthy();
        expect(decisionMethod.mock.calls).toHaveLength(1);
      });
    });

    describe('IsExternalAccessPermitted', () => {
      test('returns undefined if MetadataResponse is not ExternalAccessAware', async () => {
        expect(isExternalAccessAware(metadataResponse)).toBeFalsy();
        await expect(
          IsExternalAccessPermitted(metadataResponse)
        ).resolves.toBeUndefined();
      });

      test('returns result of isExternalAccessPermitted method if available', async () => {
        (metadataResponse as unknown as ExternalAccessAware)[
          isExternalAccessPermitted
        ] = decisionMethod;
        decisionMethod.mockReturnValue(true);

        expect(isExternalAccessAware(metadataResponse)).toBeTruthy();
        await expect(
          IsExternalAccessPermitted(metadataResponse)
        ).resolves.toBeTruthy();
        expect(decisionMethod.mock.calls).toHaveLength(1);
      });
    });
  });
});

function testMetadataResponse(options?: {
  id?: string;
  buffer?: Buffer;
}): MetadataResponse {
  const _options = applyLazyDefaults(options || {}, {
    id: () => 'example',
    buffer: () => Buffer.from('example\n'),
  });
  const resp: MetadataResponse = {
    getId: jest.fn(),
    getBytes: jest.fn(),
  };
  mocked(resp.getId).mockReturnValue(_options.id);
  mocked(resp.getBytes).mockReturnValue(Promise.resolve(_options.buffer));
  return resp;
}
