import {DAOPool} from '../db';
import {TagsDAO} from '../routes/tags-impl';
import {Components, MiddlewareComponent, Users} from '../app';
import * as tags from '../routes/tags';
import * as translation from '../routes/translation';
import * as similarity from '../routes/similarity';
import {CollectionDAO} from '../collections';
import {
  CUDLMetadataRepository,
  CUDLProviders,
  cudlProvidersForDataStore,
} from '../metadata/cudl';
import {XTF} from '../xtf';
import {URL} from 'url';
import * as transcription from '../routes/transcription';
import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import {GetRoutesV2Options} from '../routes/metadata';
import * as metadata from '../routes/metadata';
import {DomainNameMatcher, ExternalCorsRequestMatcher} from '../util';
import internal from 'stream';
import {DataStore, ItemJsonMetadataResponseEmitter} from '../metadata';
import * as membership from '../routes/membership';
import {using} from '../resources';

export type TagsOptions = Omit<tags.GetRoutesOptions, 'router'>;
export function tagsComponents(options: TagsOptions): Components {
  return new MiddlewareComponent({
    path: '/v1/tags',
    handler: tags.getRoutes({daoPool: options.daoPool}),
  });
}

export interface TranscriptionOptions {
  metadataRepository: CUDLMetadataRepository;
  zacynthiusServiceURL: URL;
  xsltExecutor: XSLTExecutor;
}
export function transcriptionComponents(
  options: TranscriptionOptions
): Components {
  return new MiddlewareComponent({
    path: '/v1/transcription',
    handler: transcription.getRoutes({
      metadataRepository: options.metadataRepository,
      xsltExecutor: options.xsltExecutor,
      zacynthiusServiceURL: options.zacynthiusServiceURL,
    }),
  });
}

export type TranslationOptions = Omit<translation.GetRoutesOptions, 'router'>;
export function translationComponents(options: TranslationOptions): Components {
  return new MiddlewareComponent({
    path: '/v1/translation',
    handler: translation.getRoutes(options),
  });
}

export interface MetadataOptions {
  cudlDataDataStore: DataStore;
  internalDomainName: string;
}
export function metadataComponents(options: MetadataOptions): Components {
  return new MiddlewareComponent({
    path: '/v1/metadata',
    handler: metadata.getRoutesV2({
      metadataProviders: new Map(
        Object.entries(cudlProvidersForDataStore(options.cudlDataDataStore))
      ),
      isExternalCorsRequest: ExternalCorsRequestMatcher({
        internalDomains: DomainNameMatcher(options.internalDomainName),
      }),
      metadataEmitters: [ItemJsonMetadataResponseEmitter.instance],
    }),
  });
}

export interface CollectionMembershipOptions {
  collectionsDAOPool: DAOPool<CollectionDAO>;
}
export function collectionMembershipComponents(
  options: CollectionMembershipOptions
): Components {
  return new MiddlewareComponent({
    path: '/v1/rdb/membership',
    handler: membership.getRoutes({
      getItemCollections: async (itemID: string) =>
        using(options.collectionsDAOPool.getInstance(), dao =>
          dao.getItemCollections(itemID)
        ),
    }),
  });
}

export type SimilarityOptions = Omit<similarity.GetRouteOptions, 'router'>;
export function similarityComponents(options: SimilarityOptions): Components {
  return new MiddlewareComponent({
    path: '/v1/xtf/similarity',
    handler: similarity.getRoutes(options),
  });
}