import {mocked} from 'ts-jest/utils';
import * as tags from '../../src/routes/tags';
import * as transcription from '../../src/routes/transcription';
import * as translation from '../../src/routes/translation';
import * as membership from '../../src/routes/membership';
import * as metadata from '../../src/routes/metadata';
import * as similarity from '../../src/routes/similarity';
import express from 'express';
import {registerComponents} from '../../src/app';
import {
  collectionMembershipComponents,
  CollectionMembershipOptions,
  metadataComponents,
  MetadataOptions,
  similarityComponents,
  SimilarityOptions,
  tagsComponents,
  TagsOptions,
  transcriptionComponents,
  TranscriptionOptions,
  translationComponents,
  TranslationOptions,
} from '../../src/components/cudl';
import request from 'supertest';
import {Collection} from '../../src/collections';
import {MemoryCollectionsDAO, MemoryDatabasePool} from '../utils';
import {URL} from 'url';
import {CUDLFormat} from '../../src/metadata/cudl';

import {ItemJsonMetadataResponseEmitter} from '../../src/metadata';
import {
  MockCUDLMetadataRepository,
  MockDAOPool,
  MockDataStore,
  MockXSLTExecutor,
  MockXTF,
} from '../mocking/local';

jest.mock('../../src/routes/tags');
jest.mock('../../src/routes/transcription');
jest.mock('../../src/routes/translation');
jest.mock('../../src/routes/metadata');
jest.mock('../../src/routes/membership');
jest.mock('../../src/routes/similarity');

describe('tagsComponents', () => {
  const options: TagsOptions = {
    daoPool: MockDAOPool(),
  };

  test('registers routes/tags#getRoutes at /v1/tags', async () => {
    mocked(tags.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
    const {app} = await registerComponents(express(), tagsComponents(options));

    expect(mocked(tags.getRoutes).mock.calls[0][0]).toEqual(options);
    const resp = await request(app).get('/v1/tags');
    expect(resp.text).toEqual('mock');
  });
});

describe('transcriptionComponents', () => {
  const options: TranscriptionOptions = {
    metadataRepository: MockCUDLMetadataRepository(),
    teiServiceURL: new URL('http://mock'),
    xsltExecutor: MockXSLTExecutor(),
    zacynthiusServiceURL: new URL('http://mock'),
  };

  test('registers routes/transcription#getRoutes at /v1/transcription', async () => {
    mocked(transcription.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
    const {app} = await registerComponents(
      express(),
      transcriptionComponents(options)
    );

    expect(mocked(transcription.getRoutes).mock.calls[0][0]).toEqual(options);
    const resp = await request(app).get('/v1/transcription');
    expect(resp.text).toEqual('mock');
  });
});

describe('translationComponents', () => {
  const options: TranslationOptions = {
    teiServiceURL: new URL('http://mock'),
    zacynthiusServiceURL: new URL('http://mock'),
  };

  test('translationComponents() registers routes/translation#getRoutes at /v1/translation', async () => {
    mocked(translation.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
    const {app} = await registerComponents(
      express(),
      translationComponents(options)
    );

    expect(mocked(translation.getRoutes).mock.calls[0][0]).toEqual(options);
    const resp = await request(app).get('/v1/translation');
    expect(resp.text).toEqual('mock');
  });
});

describe('metadataComponents()', () => {
  const options: MetadataOptions = {
    internalDomainName: 'internal.example.com',
    cudlDataDataStore: MockDataStore(),
  };

  beforeEach(() => {
    mocked(metadata.getRoutes).mockClear();
    mocked(metadata.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
  });

  test('registers routes/metadata#getRoutes at /v1/metadata', async () => {
    const {app} = await registerComponents(
      express(),
      metadataComponents(options)
    );

    const resp = await request(app).get('/v1/metadata');
    expect(resp.text).toEqual('mock');
  });

  test('uses cudlDataDataStore to supply MetadataProviders', async () => {
    mocked(options.cudlDataDataStore.read).mockResolvedValueOnce(
      Buffer.from('mock data')
    );

    await registerComponents(express(), metadataComponents(options));

    const providers = mocked(metadata.getRoutes).mock.calls[0][0]
      .metadataProviders;

    await expect(
      (await providers.get(CUDLFormat.TEI)?.query('foo'))?.getBytes()
    ).resolves.toEqual(Buffer.from('mock data'));
  });

  test('creates ExternalCorsRequestMatcher for provided domain name', async () => {
    await registerComponents(express(), metadataComponents(options));
    expect(metadata.getRoutes).toHaveBeenCalled();
    const getRoutesOptions = mocked(metadata.getRoutes).mock.calls[0][0];

    const corsReqFromInternal = ({
      headers: {origin: 'http://internal.example.com'},
    } as Partial<express.Request>) as express.Request;
    const corsReqFromExternal = ({
      headers: {origin: 'http://external.example.com'},
    } as Partial<express.Request>) as express.Request;
    expect(
      getRoutesOptions.isExternalCorsRequest(corsReqFromInternal)
    ).not.toBeTruthy();
    expect(
      getRoutesOptions.isExternalCorsRequest(corsReqFromExternal)
    ).toBeTruthy();
  });

  test('provides an emitter for Item JSON', async () => {
    await registerComponents(express(), metadataComponents(options));
    const getRoutesOptions = mocked(metadata.getRoutes).mock.calls[0][0];

    expect(getRoutesOptions.metadataEmitters).toContain(
      ItemJsonMetadataResponseEmitter.instance
    );
  });

  // predicates are not required, as the metadata providers can specify this themselves
  test('does not specify external access or embed predicates', async () => {
    await registerComponents(express(), metadataComponents(options));
    const getRoutesOptions = mocked(metadata.getRoutes).mock.calls[0][0];

    expect(getRoutesOptions.isExternalAccessPermitted).toBeUndefined();
    expect(getRoutesOptions.isExternalEmbedPermitted).toBeUndefined();
  });
});

describe('collectionMembershipComponents()', () => {
  beforeEach(() => {
    mocked(membership.getRoutes).mockClear();
    mocked(membership.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
  });

  test('registers routes/membership#getRoutes at /v1/rdb/membership', async () => {
    const {app} = await registerComponents(
      express(),
      collectionMembershipComponents(
        ({} as Partial<CollectionMembershipOptions>) as CollectionMembershipOptions
      )
    );

    const resp = await request(app).get('/v1/rdb/membership');
    expect(resp.text).toEqual('mock');
  });

  test('uses provided DAOPool for membership.getRoutes({getItemCollections: xxx})', async () => {
    const itemCollections: {[itemID: string]: Collection[]} = {
      bar: [
        {
          title: 'Things A',
          collectionOrder: 42,
          collectionID: 'things-a',
        },
      ],
    };
    const collectionsDAOPool = MemoryDatabasePool.createPooledDAO(
      MemoryCollectionsDAO,
      itemCollections
    );

    await registerComponents(
      express(),
      collectionMembershipComponents(({
        collectionsDAOPool,
      } as Partial<CollectionMembershipOptions>) as CollectionMembershipOptions)
    );

    expect(membership.getRoutes).toHaveBeenCalled();
    const options = mocked(membership.getRoutes).mock.calls[0][0];

    await expect(options.getItemCollections('bar')).resolves.toEqual([
      {
        title: 'Things A',
        collectionOrder: 42,
        collectionID: 'things-a',
      },
    ]);
  });
});

describe('similarityComponents', () => {
  const options: SimilarityOptions = {
    metadataRepository: MockCUDLMetadataRepository(),
    xtf: MockXTF(),
  };

  test('registers routes/similarity#getRoutes at /v1/similarity', async () => {
    mocked(similarity.getRoutes).mockReturnValueOnce((req, res) => {
      res.end('mock');
    });
    const {app} = await registerComponents(
      express(),
      similarityComponents(options)
    );

    expect(mocked(similarity.getRoutes).mock.calls[0][0]).toEqual(options);
    const resp = await request(app).get('/v1/xtf/similarity');
    expect(resp.text).toEqual('mock');
  });
});
