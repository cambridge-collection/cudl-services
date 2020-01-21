import NestedError from 'nested-error-stacks';

export class BaseError extends NestedError {
  constructor(message: string, nested?: Error) {
    super(message, nested);
  }

  get name(): string {
    return this.constructor.name;
  }
}

export class InvalidConfigError extends BaseError {}

export class NotFoundError extends BaseError {}

export class ValueError extends BaseError {}

export class UpstreamError extends BaseError {}
