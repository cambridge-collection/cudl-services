import assert from 'assert';
import {isSimplePathSegment} from '../util';
import path from 'path';
import {
  DataStore,
  DefaultMetadataProvider,
  DefaultMetadataResponse,
  ItemJSON,
  ItemJsonMetadataResponse,
  LocationResolver,
  MetadataProvider,
} from '../metadata';

export interface MetadataRepository<F extends string = string> {
  getBytes(format: F, id: string): Promise<Buffer>;
}

export enum CUDLFormat {
  EAD = 'ead',
  ESSAY = 'essay',
  MODS = 'mods',
  TEI = 'tei',
  TRANSCRIPTION = 'transcription',
  JSON = 'json',
}
const XML_FORMATS = Object.values(CUDLFormat).filter(
  cf => cf !== CUDLFormat.TRANSCRIPTION && cf !== CUDLFormat.JSON
);

export const resolveTranscriptionLocation: LocationResolver = async function resolveTranscriptionLocation(
  id
) {
  const idParts = /^([\w-]+)\/([\w-]+)(?:\.xml)?$/.exec(id);
  if (!idParts) {
    throw new Error(`Invalid ${CUDLFormat.TRANSCRIPTION} id: ${id}`);
  }
  return path.join(
    'data',
    CUDLFormat.TRANSCRIPTION,
    idParts[1],
    `${idParts[2]}.xml`
  );
};

export const resolveItemJsonLocation: LocationResolver = async function resolveItemJsonLocation(
  id
) {
  if (!isSimplePathSegment(id)) {
    throw new Error(`invalid id: ${id}`);
  }
  return path.join('json', `${id}.json`);
};

export function DataLocationResolver(formatDir: string): LocationResolver {
  if (!isSimplePathSegment(formatDir)) {
    throw new Error(`invalid formatDir: ${formatDir}`);
  }
  return async function resolveDataDirLocation(id: string) {
    if (!isSimplePathSegment(id)) {
      throw new Error(`invalid id: ${id}`);
    }
    return path.join('items/data', formatDir, id, `${id}.xml`);
  };
}

export interface CUDLMetadataRepository extends MetadataRepository<CUDLFormat> {
  getJSON(id: string): Promise<ItemJSON>;
}

export type CUDLProviders = {
  [key in CUDLFormat]: key extends CUDLFormat.JSON
    ? MetadataProvider<ItemJsonMetadataResponse>
    : MetadataProvider;
};

export function cudlProvidersForDataStore(dataStore: DataStore): CUDLProviders {
  const xmlProviders = Object.fromEntries(
    XML_FORMATS.map(format => [
      format,
      new DefaultMetadataProvider(
        dataStore,
        DataLocationResolver(format),
        DefaultMetadataResponse
      ),
    ])
  ) as Partial<Record<CUDLFormat, MetadataProvider>>;

  const providers: Partial<CUDLProviders> = {
    ...xmlProviders,
    [CUDLFormat.TRANSCRIPTION]: new DefaultMetadataProvider(
      dataStore,
      resolveTranscriptionLocation,
      DefaultMetadataResponse
    ),
    [CUDLFormat.JSON]: new DefaultMetadataProvider(
      dataStore,
      resolveItemJsonLocation,
      ItemJsonMetadataResponse
    ),
  };

  assert.deepStrictEqual(
    Object.getOwnPropertyNames(providers),
    Object.values(CUDLFormat)
  );
  return providers as CUDLProviders;
}

/**
 * A CUDLMetadataRepository backed by the MetadataProvider API. Data can be
 * obtained from location-independent DataStores.
 */
export class MetadataProviderCUDLMetadataRepository
  implements CUDLMetadataRepository {
  private readonly providers: CUDLProviders;

  constructor(providers: CUDLProviders) {
    this.providers = providers;
  }

  async getBytes(format: CUDLFormat, id: string): Promise<Buffer> {
    return (await this.providers[format].query(id)).getBytes();
  }

  async getJSON(id: string): Promise<ItemJSON> {
    return (await this.providers[CUDLFormat.JSON].query(id)).asJson();
  }

  static forDataStore(
    dataStore: DataStore
  ): MetadataProviderCUDLMetadataRepository {
    return new MetadataProviderCUDLMetadataRepository(
      cudlProvidersForDataStore(dataStore)
    );
  }
}
