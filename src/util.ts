import { AssertionError } from 'assert';
import escapeStringRegexp from 'escape-string-regexp';
import { Request } from 'express';
import url from 'url';
import * as util from 'util';
import { ValueError } from './errors';

import { ParsedQs } from 'qs';

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

export function validateEnumMember<E extends string>(
  _enum: { [k in string]: E },
  value: string
): E {
  if (isEnumMember(_enum, value)) {
    return value;
  }
  throw new ValueError(
    `$Expected a member of ${util.inspect(_enum)} but got: ${util.inspect(
      value
    )}`
  );
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

/** Keys of T to which U could be assigned. */
export type KeysAccepting<T, U> = {
  [K in keyof T]: U extends T[K] ? K : never;
}[keyof T];
/** Keys of T to which null can be assigned. */
export type NullableKeys<T> = KeysAccepting<T, null>;
/** Keys of T to which undefined can be assigned. */
export type UndefinableKeys<T> = KeysAccepting<T, undefined>;
/** Keys of T to which undefined or null can be assigned. */
export type OptionalKeys<T> = NullableKeys<T> | UndefinableKeys<T>;

/**
 * From T, pick a set of properties which cannot be assigned null or undefined.
 */
export type PickRequired<T> = {
  [K in Exclude<keyof T, OptionalKeys<T>>]: T[K];
};
/**
 * From T, pick a set of properties which can be assigned null or undefined.
 */
export type PickOptional<T> = {
  [K in OptionalKeys<T>]: T[K];
};
/**
 * T where properties which can be assigned null or undefined are made omittable.
 */
export type OmittableOptional<T> = {
  [K in keyof PickOptional<T>]?: Exclude<T[K], null>;
} &
  PickRequired<T>;

export type NonOptional<T> = {
  [K in keyof T]-?: Exclude<T[K], null | undefined>;
};

/**
 * Select from obj values which are not null or undefined.
 *
 * The returned object has no key/value present for null/undefined values in the
 * input obj.
 */
export function pickDefined<T extends {}>(obj: T): OmittableOptional<T> {
  const result = {} as T;
  for (const key in obj) {
    if (
      obj.hasOwnProperty(key) &&
      !(obj[key] === null || obj[key] === undefined)
    ) {
      result[key] = obj[key];
    }
  }
  return (result as unknown) as OmittableOptional<T>;
}

export function applyDefaults<T extends {}>(
  obj: T,
  defaults: NonOptional<PickOptional<T>>
): NonOptional<T> {
  return { ...defaults, ...pickDefined(obj) } as NonOptional<T>;
}

export type Lazy<T> = { [key in keyof T]: () => T[key] };

export function applyLazyDefaults<T extends {}>(
  obj: T,
  defaults: Lazy<NonOptional<PickOptional<T>>>
): NonOptional<T> {
  const values = pickDefined(obj) as T;
  for (const key of Object.keys(defaults)) {
    if (!(key in values)) {
      values[key as keyof T] = defaults[key as keyof typeof defaults]();
    }
  }
  return values as NonOptional<T>;
}

/**
 * Like require('validate').validate() except won't be optimised away, so can use
 * typescript "asserts <condition>" functionality.
 */
export function validate(
  condition: boolean,
  message?: string
): asserts condition {
  if (!condition) {
    throw new AssertionError({ message });
  }
}

export function requireNotUndefined<T>(value: T | undefined): T {
  if(value === undefined) {
    throw new AssertionError({message: 'value is undefined'});
  }
  return value;
}

export function firstQueryValue(
  queryValue: undefined | string | string[] | ParsedQs | ParsedQs[]
): string | undefined {
  if(typeof queryValue === 'string' || queryValue === undefined) {
    return queryValue;
  }
  if(Array.isArray(queryValue) && queryValue.length > 0 &&
    typeof queryValue[0] === 'string') {
    return queryValue[0];
  }
  throw new ValueError(
    `Unexpected request query value: ${util.inspect(queryValue)}`);
}
