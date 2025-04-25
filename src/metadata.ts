import {BaseError} from './errors';
import {asUnknownObject} from './util';
import {Memoize} from 'typescript-memoize';
import {MetadataResponseEmitter} from './routes/metadata';
import express from 'express';

export interface MetadataResponse {
  getId(): string;
  getBytes(): Promise<Buffer>;
}

export interface MetadataProvider<
  ResponseType extends MetadataResponse = MetadataResponse
> {
  query(id: string): Promise<ResponseType>;
}

export interface MetadataPredicate<
  MetadataResponseType extends MetadataResponse = MetadataResponse
> {
  (metadataResponse: MetadataResponseType): Promise<boolean | undefined>;
}

export const isExternalEmbedPermitted = Symbol('isExternalEmbedPermitted');
export interface ExternalEmbedAware {
  [isExternalEmbedPermitted](): Promise<boolean>;
}
export function isExternalEmbedAware(obj: object): obj is ExternalEmbedAware {
  return (
    typeof (obj as Partial<ExternalEmbedAware>)[isExternalEmbedPermitted] ===
    'function'
  );
}

export interface ExternalEmbedPermissionArbiter {
  isEmbeddable(metadataResponse: MetadataResponse): boolean | undefined;
}

export const isExternalAccessPermitted = Symbol('isExternallyAccessible');
export interface ExternalAccessAware {
  [isExternalAccessPermitted](): Promise<boolean>;
}
export function isExternalAccessAware(obj: object): obj is ExternalAccessAware {
  return (
    typeof (obj as Partial<ExternalAccessAware>)[isExternalAccessPermitted] ===
    'function'
  );
}
export interface ExternalAccessPermissionArbiter {
  isExternalAccessPermitted(
    metadataResponse: MetadataResponse
  ): boolean | undefined;
}

export class MetadataError extends BaseError {}

export interface ItemJSON {
  embeddable?: boolean;
  descriptiveMetadata?: Array<{
    metadataRights?: string;
  }>;
}

export function isItemJSON(data: unknown): data is ItemJSON {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const _data = asUnknownObject(data);

  const descMetaIsPresentAsArray =
    Array.isArray(_data.descriptiveMetadata) &&
    (_data.descriptiveMetadata || []).every((dmd: unknown) => {
      return (
        typeof dmd === 'object' &&
        dmd !== null &&
        !Array.isArray(dmd) &&
        (asUnknownObject(dmd).metadataRights === undefined ||
          typeof asUnknownObject(dmd).metadataRights === 'string')
      );
    });

  return (
    (_data.embeddable === undefined || typeof _data.embeddable === 'boolean') &&
    (_data.descriptiveMetadata === undefined || descMetaIsPresentAsArray)
  );
}

export type LocationResolver = (id: string) => Promise<string>;

export interface DataStore {
  read(location: string): Promise<Buffer>;
}

type DataProvider = () => Promise<Buffer>;

export interface MetadataResponseGenerator<ResponseType> {
  generateResponse(
    id: string,
    dataProvider: DataProvider
  ): Promise<ResponseType>;
}

export class DefaultMetadataProvider<ResponseType extends MetadataResponse>
  implements MetadataProvider<ResponseType>
{
  readonly metadataStore: DataStore;
  readonly locationResolver: LocationResolver;
  readonly responseGenerator: MetadataResponseGenerator<ResponseType>;

  constructor(
    metadataStore: DataStore,
    locationResolver: LocationResolver,
    responseGenerator: MetadataResponseGenerator<ResponseType>
  ) {
    this.metadataStore = metadataStore;
    this.locationResolver = locationResolver;
    this.responseGenerator = responseGenerator;
  }

  query(id: string): Promise<ResponseType> {
    return this.responseGenerator.generateResponse(id, async () =>
      this.metadataStore.read(await this.locationResolver(id))
    );
  }
}

export class DefaultMetadataResponse implements MetadataResponse {
  private readonly id: string;
  private readonly dataProvider: DataProvider;

  static async generateResponse(id: string, dataProvider: DataProvider) {
    return new DefaultMetadataResponse(id, dataProvider);
  }

  constructor(id: string, dataProvider: DataProvider) {
    this.id = id;
    this.dataProvider = dataProvider;
  }

  @Memoize()
  async getBytes(): Promise<Buffer> {
    return this.dataProvider();
  }

  getId(): string {
    return this.id;
  }
}

export class ItemJsonMetadataResponse
  extends DefaultMetadataResponse
  implements ExternalAccessAware, ExternalEmbedAware
{
  static async generateResponse(id: string, dataProvider: DataProvider) {
    return new ItemJsonMetadataResponse(id, dataProvider);
  }

  async [isExternalAccessPermitted](): Promise<boolean> {
    // We only want to allow external access to the metadata if the metadataRights field is present
    // and non-empty.
    const item = await this.asJson();
    return !!item.descriptiveMetadata?.[0]?.metadataRights?.trim();
  }

  async [isExternalEmbedPermitted](): Promise<boolean> {
    const embeddable = (await this.asJson()).embeddable;
    return embeddable === undefined || embeddable;
  }

  async asJson(): Promise<ItemJSON> {
    const data = parseJsonMetadata((await this.getBytes()).toString());
    if (!isItemJSON(data)) {
      throw new MetadataError('unexpected JSON structure');
    }
    return data;
  }
}

export class ItemJsonMetadataResponseEmitter
  implements MetadataResponseEmitter
{
  private constructor() {}

  @Memoize()
  static get instance(): ItemJsonMetadataResponseEmitter {
    return new ItemJsonMetadataResponseEmitter();
  }

  canEmit(
    metadataResponse: MetadataResponse
  ): metadataResponse is ItemJsonMetadataResponse {
    return metadataResponse instanceof ItemJsonMetadataResponse;
  }

  async emit(
    metadataResponse: MetadataResponse,
    res: express.Response
  ): Promise<void> {
    if (!this.canEmit(metadataResponse)) {
      throw new Error(
        `metadataResponse is not supported by this emitter: ${metadataResponse}`
      );
    }
    res.json(await metadataResponse.asJson());
    return;
  }
}

function parseJsonMetadata(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new MetadataError(`data is not valid JSON: ${e.message}`, e);
  }
}

/**
 * Creates a MetadataResponse function that delegates its answer to the MetadataResponse provided
 * by a MetadataProvider if the actual input MetadataResponse has no result.
 *
 * @param metadataPredicate The function whose result will be returned
 * @param delegatedMetadataProvider The provider of the delegated response
 * @return A MetadataPredicate function
 */
export function DelegatingMetadataPredicate<
  MetadataResponseType extends MetadataResponse = MetadataResponse
>(
  metadataPredicate: MetadataPredicate<MetadataResponseType>,
  delegatedMetadataProvider: MetadataProvider<MetadataResponseType>
): MetadataPredicate<MetadataResponseType> {
  return async function DelegatingMetadataPredicate(
    metadataResponse: MetadataResponseType
  ) {
    const result = await metadataPredicate(metadataResponse);
    if (result !== undefined) {
      return result;
    }
    return await metadataPredicate(
      await delegatedMetadataProvider.query(metadataResponse.getId())
    );
  };
}

export async function IsExternalEmbedPermitted(
  metadataResponse: MetadataResponse
) {
  return isExternalEmbedAware(metadataResponse)
    ? await metadataResponse[isExternalEmbedPermitted]()
    : undefined;
}

export async function IsExternalAccessPermitted(
  metadataResponse: MetadataResponse
) {
  return isExternalAccessAware(metadataResponse)
    ? await metadataResponse[isExternalAccessPermitted]()
    : undefined;
}
