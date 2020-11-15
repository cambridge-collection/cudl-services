export interface Resource {
  close(): Promise<void>;
}

export abstract class BaseResource implements Resource {
  private _isClosed = false;

  async close(): Promise<void> {
    this._isClosed = true;
  }

  isClosed(): boolean {
    return this._isClosed;
  }

  protected ensureNotClosed() {
    if (this.isClosed()) {
      throw new Error('operation on closed resource');
    }
  }
}

export type ResourceUser<A, B> = (resource: A) => Promise<B> | B;

export async function using<A extends Resource, B>(
  resource: PromiseLike<A> | A,
  user: ResourceUser<A, B>
): Promise<B> {
  let resolvedResource: A | undefined = undefined;
  let closeCalled = false;
  try {
    resolvedResource = await resource;
    const result = await user(resolvedResource);
    closeCalled = true;
    await resolvedResource.close();
    return result;
  } catch (e) {
    if (resolvedResource !== undefined && !closeCalled) {
      await resolvedResource.close();
    }
    throw e;
  }
}

export class ExternalResources<T> extends BaseResource {
  private readonly resources: Resource[];
  readonly value: T;

  constructor(value: T, resources: Resource[]) {
    super();
    this.value = value;
    this.resources = Array.from(resources);
  }

  async close(): Promise<void> {
    await super.close();
    await Promise.all(this.resources.map(r => r.close()));
  }
}
