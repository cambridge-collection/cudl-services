import { Request } from 'express';
import escapeStringRegexp from 'escape-string-regexp';
import express from 'express';
import NestedError from 'nested-error-stacks';
import url from 'url';
import * as util from 'util';

const CUDL_HOST = 'cudl.lib.cam.ac.uk';
const CUDL_HOST_REGEX = new RegExp(
  '(?:^|\\.)' + escapeStringRegexp(CUDL_HOST) + '$'
);

export const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
});

export function isExternalCorsRequest(req: express.Request) {
  const origin = req.header('origin');
  if (!origin) {
    return false;
  }

  const host = url.parse(origin).hostname;

  // If we have an origin header and it's not cudl, then it's an external cors
  // request.
  return typeof host === 'string' && !CUDL_HOST_REGEX.test(host);
}

export function isSimplePathSegment(value: string): boolean {
  return /^[\w -]+$/.test(value);
}

export class BaseError extends NestedError {
  constructor(message: string, nested?: Error) {
    super(message, nested);
  }

  get name(): string {
    return this.constructor.name;
  }
}

export class NotFoundError extends BaseError {}

export class UpstreamError extends BaseError {}

/**
 * A type guard which narrows strings to members of string-valued enums.
 *
 * @param _enum The enum type
 * @param val The value to narrow
 */
export function isEnumMember<E extends string>(
  _enum: { [k in string]: E },
  val: string
): val is E {
  const members = Object.values(_enum) as unknown[];
  return members.includes(val);
}

export function requireRequestParam(req: Request, param: string): string {
  const value = req.params[param] as typeof req.params[string] | undefined;
  if (typeof value !== 'string') {
    throw new Error(`Request has no value for param ${util.inspect(param)}`);
  }
  return value;
}

export function requireRequestParams<T extends string>(
  req: Request,
  ...params: T[]
): { [key in T]: string } {
  const obj = {} as { [key in T]: string };
  for (const param of params) {
    obj[param] = requireRequestParam(req, param);
  }
  return obj;
}
