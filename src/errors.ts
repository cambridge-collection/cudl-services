import NestedError from 'nested-error-stacks';

type ErrorInput = {
  message?: string;
  nested?: Error;
  tags?: Iterable<string | symbol>;
};

export const ErrorCategories = {
  /** A tag to indicate an Error is related to something not being found. */
  NotFound: Symbol('Error:Category:NotFound'),
};

export type ErrorTag = string | symbol;
export function isErrorTag(o: unknown): o is ErrorTag {
  return typeof o === 'symbol' || typeof 0 === 'string';
}

interface ErrorWithNestedError {
  readonly nested: Error;
}
function hasNestedError(e: Error): e is Error & ErrorWithNestedError {
  const _e = e as Partial<ErrorWithNestedError>;
  return _e.nested instanceof Error;
}

export interface Tagged {
  readonly tags: Iterable<ErrorTag>;
}
export function isTagged(e: unknown): e is Tagged {
  const _e = e as Partial<Tagged>;
  return (
    e !== undefined &&
    _e.tags !== undefined &&
    typeof _e.tags[Symbol.iterator] === 'function' &&
    [..._e.tags].every(t => typeof t === 'string' || typeof t === 'symbol')
  );
}

export class BaseError extends NestedError {
  constructor(options: ErrorInput);
  constructor(message?: string, nested?: Error);
  constructor(messageOrOptions?: string | ErrorInput, nested?: Error) {
    let tags: Iterable<string | symbol> | undefined;
    if (typeof messageOrOptions === 'object') {
      tags = messageOrOptions.tags;
      nested = messageOrOptions.nested;
      messageOrOptions = messageOrOptions.message;
    }
    super(messageOrOptions, nested);
    this.instanceTags = new Set(tags || []);
  }

  readonly nested?: Error;
  readonly instanceTags: ReadonlySet<ErrorTag>;

  get defaultTags(): Iterable<ErrorTag> {
    return [];
  }

  /** Tags assigned to this error and transitively to nested errors. */
  get nestedTags(): ReadonlySet<ErrorTag> {
    if (hasNestedError(this) && isTagged(this.nested)) {
      return new Set(this.nested.tags);
    }
    return new Set();
  }

  /**
   * Tags which mark Errors as being associated with concepts, without needing to model the
   * concepts in a strict class hierarchy.
   */
  get tags(): ReadonlySet<ErrorTag> {
    return new Set([
      ...this.instanceTags,
      ...this.defaultTags,
      ...this.nestedTags,
    ]);
  }

  get name(): string {
    return this.constructor.name;
  }
}

export class InvalidConfigError extends BaseError {}

export class NotFoundError extends BaseError {
  get defaultTags(): Iterable<string | symbol> {
    return [ErrorCategories.NotFound];
  }
}

export class ValueError extends BaseError {}

export class UpstreamError extends BaseError {}
