import {
  applyDefaults,
  applyLazyDefaults,
  compare,
  CompareValue,
  firstQueryValue,
  isEnumMember,
  Lazy,
  NonOptional,
  OmittableOptional,
  pickDefined,
  PickOptional,
  requireNotUndefined,
  sorted,
} from '../src/util';
import {ParsedQs} from 'qs';
import {AssertionError} from 'assert';

test('isEnumMember', () => {
  expect.assertions(1);

  enum Foo {
    A = 'a',
    B = 'b',
  }

  function blah(f: Foo) {
    expect([Foo.A, Foo.B].includes(f)).toBeTruthy();
  }

  const val = 'b';

  if (isEnumMember(Foo, val)) {
    blah(val);
  }
});

describe('sorting', () => {
  describe('compare()', () => {
    test('string', () => {
      expect(compare('a', 'a')).toBe(0);
      expect(compare('a', 'b')).toBe(-1);
      expect(compare('b', 'a')).toBe(1);
    });

    test('number', () => {
      expect(compare(1, 1)).toBe(0);
      expect(compare(1, 2)).toBe(-1);
      expect(compare(2, 1)).toBe(1);
    });

    test('boolean', () => {
      expect(compare(true, true)).toBe(0);
      expect(compare(false, false)).toBe(0);
      expect(compare(true, false)).toBe(1);
      expect(compare(false, true)).toBe(-1);
    });

    test('array', () => {
      expect(compare([], [])).toBe(0);
      expect(compare([1], [1])).toBe(0);
      expect(compare(['a'], ['a'])).toBe(0);
      expect(compare(['a'], ['b'])).toBe(-1);
      expect(compare(['b'], ['a'])).toBe(1);
      expect(compare([1], [1])).toBe(0);
      expect(compare([0], [1])).toBe(-1);
      expect(compare([1], [0])).toBe(1);

      expect(compare(['a', 'b'], ['a', 'c'])).toBe(-1);
      expect(compare(['a', 'c'], ['a', 'b'])).toBe(1);
      expect(compare(['a', 'c'], ['a', 'c'])).toBe(0);

      expect(compare(['a', ['b']], ['a', ['c']])).toBe(-1);
      expect(compare(['a', ['c']], ['a', ['b']])).toBe(1);
      expect(compare(['a', ['c']], ['a', ['c']])).toBe(0);
      expect(compare(['a', ['c', 'b']], ['a', ['c', 'd']])).toBe(-1);
      expect(compare(['a', ['c', 'd']], ['a', ['c', 'b']])).toBe(1);
      expect(compare(['a', ['c', 'b']], ['a', ['c', 'b']])).toBe(0);

      // When arrays of differing lengths are compared, the shorter array is less
      // to break ties
      expect(compare([1, 2], [1, 2, 3])).toBe(-1);
      expect(compare([1, 2, 3], [1, 2])).toBe(1);
    });

    test.each<[CompareValue, CompareValue, number]>([
      [[compare.desc, 1], [compare.desc, 1], 0],
      [[compare.desc, 0], [compare.desc, 1], 1],
      [[compare.desc, 1], [compare.desc, 0], -1],

      [
        [compare.desc, [0, [compare.desc, 'b']]],
        [compare.desc, [0, [compare.desc, 'a']]],
        1,
      ],
      [
        [compare.desc, [0, [compare.desc, 'a']]],
        [compare.desc, [0, [compare.desc, 'b']]],
        -1,
      ],
    ])('directional - compare(%s, %s) === %d', (a, b, expected) => {
      expect(normaliseNegativeZero(compare(a, b))).toBe(expected);
    });
  });

  function normaliseNegativeZero(n: number) {
    return Object.is(-0, n) ? 0 : n;
  }

  describe('sorted()', () => {
    test('new array is returned', () => {
      const input = [3, 1, 2];
      const result = sorted(input);
      expect(result).not.toBe(input);
      expect(result).toEqual([1, 2, 3]);
    });

    test('key function is invoked once per element', () => {
      const key = jest.fn(x => x);
      const input = [3, 1, 2];
      expect(sorted(Array.from(input), key)).toEqual([1, 2, 3]);
      expect(key.mock.calls.map(call => call[0])).toEqual(input);
    });

    test.each([
      [[], []],
      [[0], [0]],
      [
        [0, 1],
        [0, 1],
      ],
      [
        [1, 0],
        [0, 1],
      ],
    ])('sorted(%j) returns %j', (unsorted, expected) => {
      expect(sorted(unsorted)).toEqual(expected);
    });

    test.each([
      [[], []],
      [[0], [0]],
      [
        [0, 1],
        [1, 0],
      ],
      [
        [1, 0],
        [1, 0],
      ],
    ])("sorted(%j, 'desc') returns %j", (unsorted, expected) => {
      expect(sorted(unsorted, x => [compare.desc, x])).toEqual(expected);
    });

    test.each<[Array<{thing: number}>, Array<{thing: number}>]>([
      [[], []],
      [[{thing: 0}], [{thing: 0}]],
      [
        [{thing: 0}, {thing: 1}],
        [{thing: 0}, {thing: 1}],
      ],
      [
        [{thing: 1}, {thing: 0}],
        [{thing: 0}, {thing: 1}],
      ],
    ])("sorted(%j, *key*, 'desc') returns %j", (unsorted, expected) => {
      expect(sorted(unsorted, t => t.thing)).toEqual(expected);
    });

    test.each<[Array<{thing: number}>, Array<{thing: number}>]>([
      [[], []],
      [[{thing: 0}], [{thing: 0}]],
      [
        [{thing: 0}, {thing: 1}],
        [{thing: 1}, {thing: 0}],
      ],
      [
        [{thing: 1}, {thing: 0}],
        [{thing: 1}, {thing: 0}],
      ],
    ])("sorted(%j, *key*,s 'desc') returns %j", (unsorted, expected) => {
      expect(sorted(unsorted, t => [compare.desc, t.thing])).toEqual(expected);
    });
  });
});

interface Options {
  a: string;
  b?: string;
  c: number | null;
}

test.each<[Options, OmittableOptional<Options>]>([
  [{a: 'abc', b: undefined, c: null}, {a: 'abc'}],
  [
    {a: 'abc', c: 42},
    {a: 'abc', c: 42},
  ],
  [
    {a: 'abc', b: 'x', c: null},
    {a: 'abc', b: 'x'},
  ],
  [
    {a: 'abc', b: 'def', c: 42},
    {a: 'abc', b: 'def', c: 42},
  ],
])('pickDefined()', (options, expectedDefinedOptions) => {
  const definedOptions = pickDefined(options);
  expect(definedOptions).toEqual(expectedDefinedOptions);
});

interface Options {
  a: string;
  b?: string;
  c: number | null;
}

test.each<[Options, Required<Options>]>([
  [
    {a: 'abc', c: null},
    {a: 'abc', b: 'def', c: 42},
  ],
  [
    {a: 'abc', c: 54},
    {a: 'abc', b: 'def', c: 54},
  ],
  [
    {a: 'abc', b: 'foo', c: 54},
    {a: 'abc', b: 'foo', c: 54},
  ],
])('applyDefaults()', (options, expected) => {
  const defaults: NonOptional<PickOptional<Options>> = {b: 'def', c: 42};
  const actual = applyDefaults(options, defaults);
  expect(actual).toEqual(expected);
});

test.each<[Options, Required<Options>, {b: boolean; c: boolean}]>([
  [
    {a: 'abc', c: null},
    {a: 'abc', b: 'def', c: 42},
    {b: true, c: true},
  ],
  [
    {a: 'abc', c: 54},
    {a: 'abc', b: 'def', c: 54},
    {b: true, c: false},
  ],
  [
    {a: 'abc', b: 'foo', c: 54},
    {a: 'abc', b: 'foo', c: 54},
    {b: false, c: false},
  ],
])('applyLazyDefaults()', (options, expected, defaultCalls) => {
  const defaults: Lazy<NonOptional<PickOptional<Options>>> = {
    b: jest.fn(() => 'def'),
    c: jest.fn(() => 42),
  };
  const actual = applyLazyDefaults(options, defaults);
  expect(actual).toEqual(expected);
  expect(defaults.b).toHaveBeenCalledTimes(Number(defaultCalls.b));
  expect(defaults.c).toHaveBeenCalledTimes(Number(defaultCalls.c));
});

test('requireNotUndefined()', () => {
  expect(requireNotUndefined('abc')).toBe('abc');
  expect(() => requireNotUndefined(undefined)).toThrow(
    new AssertionError({message: 'value is undefined'})
  );
});

describe('firstQueryValue()', () => {
  test.each<
    [undefined | string | string[] | ParsedQs | ParsedQs[], string | undefined]
  >([
    [undefined, undefined],
    ['a', 'a'],
    [['a', 'b'], 'a'],
  ])('firstQueryValue(%j) returns %j', (queryValue, expected) => {
    expect(firstQueryValue(queryValue)).toEqual(expected);
  });

  test('throws on non-simple query values', () => {
    expect(() => firstQueryValue({})).toThrow(
      'Unexpected request query value: {}'
    );
  });
});
