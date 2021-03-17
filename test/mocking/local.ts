import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import {Resource} from '../../src/resources';
import {DAOPool, PostgresDatabasePool} from '../../src/db';
import {XTF} from '../../src/xtf';
import {DataStore, MetadataProvider} from '../../src/metadata';
import {CUDLMetadataRepository} from '../../src/metadata/cudl';

export const MockCUDLMetadataRepository = jest
  .fn<CUDLMetadataRepository, []>()
  .mockImplementation(() => {
    return {getJSON: jest.fn(), getBytes: jest.fn()};
  });

export const MockXSLTExecutor = jest.fn<XSLTExecutor, []>().mockImplementation(
  () =>
    (({
      close: jest.fn(),
      execute: jest.fn(),
    } as Partial<XSLTExecutor>) as XSLTExecutor)
);

export function MockDAOPool<T extends Resource>(): DAOPool<T> {
  return jest.fn<DAOPool<T>, []>(
    (): DAOPool<T> => {
      return {getInstance: jest.fn()} as DAOPool<T>;
    }
  )();
}

export const MockDataStore = jest.fn<DataStore, []>(() => ({
  read: jest.fn(),
}));

export const MockMetadataProvider = jest.fn<MetadataProvider, []>(() => ({
  query: jest.fn(),
}));

export const MockXTF = jest.fn<XTF, []>(() => ({
  getSimilarItems: jest.fn(),
  search: jest.fn(),
}));

export const MockPostgresDatabasePool = jest.fn<PostgresDatabasePool, []>(
  () =>
    (({
      getClient: jest.fn(),
      close: jest.fn(),
    } as Partial<PostgresDatabasePool>) as PostgresDatabasePool)
);
