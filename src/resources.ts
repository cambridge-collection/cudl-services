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

export async function closingOnError<A extends Resource, B>(
  resource: PromiseLike<A> | A,
  user: ResourceUser<A, B>
): Promise<B> {
  // if the resource promise fails we can't close it
  const resolvedResource = await resource;
  try {
    return await user(resolvedResource);
  } catch (e) {
    await resolvedResource.close();
    throw e;
  }
}

/**
 * An aggregate Resource which closes the resources it holds when closed.
 */
export class Resources extends BaseResource {
  private readonly resources: Resource[];

  constructor(resources: Iterable<Resource>) {
    super();
    this.resources = Array.from(resources);
  }

  async close(): Promise<void> {
    await Promise.all([super.close(), ...this.resources.map(r => r.close())]);
  }
}

/**
 * Create a Resource which closes all of the specified Resources when closed.
 */
export function aggregate(...resources: Resource[]): Resources {
  return new Resources(resources);
}

export class ExternalResources<T> extends Resources {
  readonly value: T;

  constructor(value: T, resources: Resource[]) {
    super(resources);
    this.value = value;
  }
}
