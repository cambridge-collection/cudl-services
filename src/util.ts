import escapeStringRegexp from 'escape-string-regexp';
import { Request } from 'express';
import url from 'url';
import * as util from 'util';
import { ValueError } from './errors';

const CUDL_HOST = 'cudl.lib.cam.ac.uk';
const CUDL_HOST_REGEX = new RegExp(
  '(?:^|\\.)' + escapeStringRegexp(CUDL_HOST) + '$'
);

export const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
});

export function isExternalCorsRequest(req: Request) {
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

export function factory<A, B>(
  constructor: new (...args: A[]) => B
): (...args: A[]) => B {
  return (...args: A[]) => new constructor(...args);
}

/** The type of the only argument of a 1-ary constructor. */
export type UnaryConstructorArg<
  T extends new (arg: unknown) => unknown
> = ConstructorParameters<T>[0];

export type ComparePrimitive = string | number | boolean | ComparePrimitive[];
export type CompareModifier = [Direction, CompareValue];
export type CompareValue = ComparePrimitive | CompareModifier | CompareValue[];

export function compare(a: CompareValue, b: CompareValue): number {
  if (typeof a !== typeof b) {
    throw new Error(
      `compare() not supported between ${typeof a} and ${typeof b}`
    );
  }

  if (!Array.isArray(a)) {
    return a === b ? 0 : a < b ? -1 : 1;
  }

  // Directional compare modifier
  if ((a.length > 0 && a[0] === asc) || a[0] === desc) {
    b = b as CompareModifier | CompareValue[];
    if (a.length !== 2) {
      throw new Error(`Invalid compare direction modifier: modifiers must be a pair of [direction, value], \
got: ${util.inspect(a)}`);
    }
    if (b.length !== 2 || b[0] !== a[0]) {
      throw new Error(
        `Invalid compare direction modifier: modifiers on both comparison values must use the same direction`
      );
    }

    return compare(a[1], b[1]) * (a[0] === desc ? -1 : 1);
  }

  a = a as CompareValue[];
  b = b as CompareValue[];

  for (let i = 0; i < Math.min(a.length, b.length); ++i) {
    const order = compare(a[i], b[i]);
    if (order !== 0) {
      return order;
    }
  }
  // shorter array is less
  return a.length - b.length;
}

const asc: unique symbol = Symbol('compare.asc');
const desc: unique symbol = Symbol('compare.desc');
compare.asc = asc;
compare.desc = desc;
type Direction = typeof asc | typeof desc;

export function sorted<T extends ComparePrimitive>(items: Iterable<T>): T[];
export function sorted<T>(
  items: Iterable<T>,
  key: (value: T) => CompareValue
): T[];
export function sorted<T>(
  items: Iterable<T>,
  key?: (value: T) => CompareValue
): T[] {
  if (key === undefined) {
    const sorted = Array.from(
      (items as Iterable<unknown>) as Iterable<ComparePrimitive>
    );
    sorted.sort((a, b) => compare(a, b));
    return (sorted as unknown[]) as T[];
  }

  const indexedItems = index(items);
  const keys = indexedItems.map(([_, value]) => key(value));
  indexedItems.sort(([ia], [ib]) => compare(keys[ia], keys[ib]));

  // Remove indexes in place
  const sorted = (indexedItems as unknown) as T[];
  for (let i = 0; i < indexedItems.length; ++i) {
    sorted[i] = indexedItems[i][1];
  }

  return sorted;
}

function index<T>(items: Iterable<T>): Array<[number, T]> {
  const index: Array<[number, T]> = [];
  let i = 0;
  for (const item of items) {
    index[i] = [i, item];
    i++;
  }
  return index;
}
