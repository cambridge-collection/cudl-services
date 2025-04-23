import {Components, ResourceCleanupComponent} from '../../app';
import {
  cudlProvidersForDataStore,
  MetadataProviderCUDLMetadataRepository,
} from '../../metadata/cudl';
import {PostgresCollectionDAO} from '../../collections';
import {PostgresTagsDAO} from '../../routes/tags-impl';
import {closingOnError} from '../../resources';
import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import {
  DarwinProxyComponentOptions,
  darwinProxyComponents,
} from '../darwin-correspondence-project';
import {PostgresDatabasePool} from '../../db';
import {DataStore} from '../../metadata';
import {XTF} from '../../xtf';
import {URL} from 'url';
import {
  collectionMembershipComponents,
  metadataComponents,
  similarityComponents,
  tagsComponents,
  transcriptionComponents,
  translationComponents,
} from '../cudl';

const CUDL_HOST = 'cudl.lib.cam.ac.uk';

export interface CudlOptions {
  dbPool: PostgresDatabasePool;
  cudlDataDataStore: DataStore;
  darwin: DarwinProxyComponentOptions;
  internalDomainName?: string;
  teiServiceURL: URL;
  xtf: XTF;
  zacynthiusServiceURL: URL;
  iiifBaseURL?: string;
}

export async function cudlComponents(
  options: CudlOptions
): Promise<Components> {
  const {
    cudlDataDataStore,
    dbPool,
    teiServiceURL,
    xtf,
    zacynthiusServiceURL,
  } = options;
  const internalDomainName = options.internalDomainName || CUDL_HOST;
  const metadataProviders = cudlProvidersForDataStore(
    options.cudlDataDataStore
  );
  const metadataRepository = new MetadataProviderCUDLMetadataRepository(
    metadataProviders
  );
  const collectionsDAOPool = PostgresCollectionDAO.createPool(dbPool);
  const tagsDAOPool = PostgresTagsDAO.createPool(dbPool);

  return await closingOnError(XSLTExecutor.getInstance(), xsltExecutor => [
    tagsComponents({daoPool: tagsDAOPool}),
    transcriptionComponents({
      metadataRepository,
      teiServiceURL,
      xsltExecutor,
      zacynthiusServiceURL,
    }),
    translationComponents({
      teiServiceURL,
      zacynthiusServiceURL: options.zacynthiusServiceURL,
    }),
    metadataComponents({cudlDataDataStore, internalDomainName}),
    collectionMembershipComponents({
      collectionsDAOPool,
    }),
    similarityComponents({xtf, metadataRepository}),
    darwinProxyComponents(options.darwin),
    ResourceCleanupComponent.closing(xsltExecutor),
  ]);
}
