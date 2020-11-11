import {AssertionError} from 'assert';
import {PoolClient, QueryConfig, QueryResult, QueryResultRow} from 'pg';
import {mocked} from 'ts-jest/utils';
import {NotFoundError} from '../../src/errors';
import {
  AbstractTagSet,
  DefaultTagSet,
  FilterTagSet,
  isTagResultRow,
  isTagResultRowArray,
  loadTags,
  MergedTagSet,
  mergeTagSets,
  NamedTagSources,
  PostgresTagsDAO,
  selectTagSources,
  TagLoadFunction,
  TagMerger,
  TagPredicate,
  TagResultRow,
  TagsDAO,
  TagSet,
  TagSource,
  ViewTagSet,
  WeightedTagSet,
} from '../../src/routes/tags-impl';
import {product} from '../utils';

const tags: Array<[string, number]> = [
  ['foo', 42],
  ['bar', 24],
];

const tagsObj = Object.freeze(Object.fromEntries(tags));

describe('AbstractTagSet', () => {
  class ConcreteTagSet extends AbstractTagSet {
    contains(tagName: string): boolean {
      return tagName === 'foo' || tagName === 'bar';
    }

    getTags(): Iterable<string> {
      return ['foo', 'bar'];
    }

    getValue(tagName: string): number {
      if (!this.contains(tagName)) {
        this.tagNotFound(tagName);
      }
      return tagName === 'foo' ? 42 : 24;
    }
  }

  test('is iterable', () => {
    const entries = [];
    for (const entry of new ConcreteTagSet()) {
      entries.push(entry);
    }

    expect(entries).toEqual(tags);
    expect(Array.from(entries)).toEqual(tags);
  });

  test('asObject()', () => {
    expect(new ConcreteTagSet().asObject()).toEqual(tagsObj);
  });
});

describe('DefaultTagSet', () => {
  test('can be constructed with no tags', () => {
    expect(Array.from(new DefaultTagSet())).toEqual([]);
  });

  test('can be constructed with tags', () => {
    expect(Array.from(new DefaultTagSet(tags))).toEqual(tags);
  });

  describe('methods', () => {
    let tagSet: DefaultTagSet;
    beforeEach(() => {
      tagSet = new DefaultTagSet(tags);
    });

    test('asObject()', () => {
      expect(tagSet.asObject()).toEqual(tagsObj);
    });

    test('contains()', () => {
      expect(tagSet.contains('foo')).toBeTruthy();
      expect(tagSet.contains('bar')).toBeTruthy();
      expect(tagSet.contains('baz')).toBeFalsy();
    });

    test('getTags()', () => {
      const tagNames = tagSet.getTags();
      expect(Array.isArray(tagNames)).toBeFalsy();
      expect(Array.from(tagNames)).toEqual(['foo', 'bar']);
    });

    test('getValue()', () => {
      expect(tagSet.getValue('foo')).toBe(42);
      expect(tagSet.getValue('bar')).toBe(24);
      expect(() => tagSet.getValue('baz')).toThrow(
        new NotFoundError('No such tag name: baz')
      );
    });
  });
});

describe('ViewTagSet', () => {
  test('wraps another TagSet', () => {
    const tagSet = new DefaultTagSet(tags);
    const view = new ViewTagSet(tagSet);

    expect(Array.from(view.getTags())).toEqual(Array.from(tagSet.getTags()));
    expect(view.contains('foo')).toBeTruthy();
    expect(view.contains('bar')).toBeTruthy();
    expect(view.contains('baz')).toBeFalsy();
    expect(view.getValue('foo')).toBe(42);
    expect(view.getValue('bar')).toBe(24);
    expect(() => view.getValue('baz')).toThrow(
      new NotFoundError('No such tag name: baz')
    );
  });
});

describe('WeightedTagSet', () => {
  test('wraps another TagSet', () => {
    const tagSet = new DefaultTagSet(tags);
    const weighted = new WeightedTagSet(tagSet, 2);

    expect(Array.from(weighted.getTags())).toEqual(
      Array.from(tagSet.getTags())
    );

    // Values adjusted by weight of 2
    expect(weighted.getValue('foo')).toBe(84);
    expect(weighted.getValue('bar')).toBe(48);
    expect(() => weighted.getValue('baz')).toThrow(
      new NotFoundError('No such tag name: baz')
    );

    expect(weighted.contains('foo')).toBeTruthy();
    expect(weighted.contains('bar')).toBeTruthy();
    expect(weighted.contains('baz')).toBeFalsy();
  });
});

describe('MergedTagSet', () => {
  const tagsA = new DefaultTagSet(tags);
  const tagsB = new DefaultTagSet(tags);
  const tagsC = new DefaultTagSet([['hi', 100]]);

  test('merges multiple tag sets', () => {
    const merged = new MergedTagSet([tagsA, tagsB, tagsC]);

    expect(merged.contains('foo')).toBeTruthy();
    expect(merged.contains('bar')).toBeTruthy();
    expect(merged.contains('hi')).toBeTruthy();
    expect(merged.contains('baz')).toBeFalsy();
  });

  test.each<[TagMerger | undefined, Record<string, number>]>([
    // Default is to sum tags
    [undefined, {foo: 84, bar: 48, hi: 100}],
    [(a, b) => a + b + 1, {foo: 85, bar: 49, hi: 100}],
  ])('merges values according to merge function', (mergeFn, expected) => {
    expect(new MergedTagSet([tagsA, tagsB, tagsC], mergeFn).asObject()).toEqual(
      expected
    );
  });
});

describe('FilterTagSet', () => {
  test('tagPredicate is called to filter tags', () => {
    const predicate = jest.fn(() => {
      return true;
    });

    const unfilteredTagSet = new DefaultTagSet(tags);
    const filterTagSet = new FilterTagSet(unfilteredTagSet, predicate);

    expect(filterTagSet.contains('foo')).toBeTruthy();
    expect(filterTagSet.contains('bar')).toBeTruthy();
    expect(filterTagSet.contains('baz')).toBeFalsy();

    // predicate is not called for 'baz' because it doesn't exist in unfiltered
    expect(predicate).toBeCalledTimes(2);
    expect(predicate).toHaveBeenNthCalledWith(1, 'foo', 42, unfilteredTagSet);
    expect(predicate).toHaveBeenNthCalledWith(2, 'bar', 24, unfilteredTagSet);
  });

  test.each<[TagPredicate | undefined, Record<string, number>]>([
    // Default includes all tags
    [undefined, {foo: 42, bar: 24}],
    [tag => tag === 'foo', {foo: 42}],
    [(tag, value) => value > 40, {foo: 42}],
  ])(
    'filters tags according to predicate function',
    (predicateFn, expected) => {
      expect(
        new FilterTagSet(new DefaultTagSet(tags), predicateFn).asObject()
      ).toEqual(expected);
    }
  );
});

test('isTagResultRow()', () => {
  const obj = {tagname: 'foo', frequency: 42};
  if (isTagResultRow(obj)) {
    const trr: TagResultRow = obj;
    expect(trr).toBeTruthy();
  } else {
    expect(false).toBeTruthy();
  }
});

test('isTagResultRowArray()', () => {
  const obj = [
    {tagname: 'foo', frequency: 42},
    {tagname: 'bar', frequency: 24},
  ];
  if (isTagResultRowArray(obj)) {
    const trra: TagResultRow[] = obj;
    expect(trra).toBeTruthy();
  } else {
    expect(false).toBeTruthy();
  }
});

describe('PostgresTagsDAO', () => {
  interface MockPgClient {
    // The actual query() signature has several overloads which prevents the
    // .mockResolvedValueOnce() method typings from working.
    query<
      R extends QueryResultRow = QueryResultRow,
      I extends unknown[] = unknown[]
    >(
      queryTextOrConfig: string | QueryConfig<I>,
      values?: I
    ): Promise<QueryResult<R>>;
  }

  const pgClient: MockPgClient = {
    query: jest.fn(),
  };
  const dao = new PostgresTagsDAO(pgClient as PoolClient);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test.each<[keyof PostgresTagsDAO, TagResultRow[]]>(
    Array.from(
      product(
        ['annotationTags', 'removedTags', 'thirdPartyTags'],
        [
          [],
          [
            {tagname: 'foo', frequency: 42},
            {tagname: 'bar', frequency: 24},
          ],
        ]
      )
    )
  )('tag method %s returns tags from query', async (tagMethod, resultRows) => {
    const queryResult: Partial<QueryResult<TagResultRow>> = {
      rows: resultRows,
    };
    mocked(pgClient.query).mockResolvedValueOnce(
      queryResult as QueryResult<QueryResultRow>
    );

    const result = await dao[tagMethod]('MS-FOO');
    if (!(result instanceof AbstractTagSet)) {
      throw new AssertionError({});
    }
    expect(Array.from(result)).toEqual(
      resultRows.map(({tagname, frequency}) => [tagname, frequency])
    );
  });
});

class TestTagsDAO implements TagsDAO {
  async annotationTags(): Promise<TagSet> {
    return new DefaultTagSet([
      ['foo', 5],
      ['bar', 20],
    ]);
  }

  async removedTags(): Promise<TagSet> {
    return new DefaultTagSet([
      ['foo', -10],
      ['bar', -2],
    ]);
  }

  async thirdPartyTags(): Promise<TagSet> {
    return new DefaultTagSet([
      ['foo', 10],
      ['bar', 4],
    ]);
  }
}

describe('TagSource', () => {
  test('weight', () => {
    expect(new TagSource(() => Promise.reject(undefined), 42).weight).toBe(42);
  });

  test('loadTags()', async () => {
    const factory: TagLoadFunction = jest.fn();
    mocked(factory).mockResolvedValue(new DefaultTagSet([['foo', 42]]));

    const tags = await new TagSource(factory, 0.5).loadTags('MS-FOO');
    expect(tags.asObject()).toEqual({foo: 21});
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenNthCalledWith(1, 'MS-FOO');
  });

  test('fromTagsDAO()', async () => {
    const tags = await TagSource.fromTagsDAO(
      new TestTagsDAO(),
      'annotationTags',
      2
    ).loadTags('MS-FOO');
    expect(tags.asObject()).toEqual({foo: 10, bar: 40});
  });
});

test.each<[string | Array<'foo' | 'bar' | 'baz'>]>([
  ['foo,bar'],
  [['foo', 'bar']],
])('selectTagSources()', names => {
  const sources: NamedTagSources<'foo' | 'bar' | 'baz'> = {
    foo: new TagSource(jest.fn(), 1),
    bar: new TagSource(jest.fn(), 2),
    baz: new TagSource(jest.fn(), 3),
  };
  const selected = selectTagSources(sources, names);
  expect(selected).toEqual([sources['foo'], sources['bar']]);
});

test('mergeTagSets()', () => {
  expect(mergeTagSets([]).asObject()).toEqual({});
  expect(
    mergeTagSets([
      new DefaultTagSet([
        ['foo', 10],
        ['bar', 5],
        ['baz', 1],
        ['boz', -10],
      ]),
      new DefaultTagSet([['baz', 1]]),
      new DefaultTagSet([['baz', -2]]),
      new DefaultTagSet([
        ['foo', -5],
        ['bar', 2],
      ]),
    ]).asObject()
  ).toEqual({
    foo: 5,
    bar: 7,
    // baz and boz excluded the have values <= 0
  });
});

test('loadTags()', async () => {
  const tlf1: TagLoadFunction = jest.fn().mockResolvedValueOnce(
    new DefaultTagSet([
      ['foo', 42],
      ['bar', 24],
      ['baz', 10],
    ])
  );
  const tlf2: TagLoadFunction = jest.fn().mockResolvedValueOnce(
    new DefaultTagSet([
      ['foo', 2],
      ['bar', -10],
      ['baz', -5],
    ])
  );
  const sources: TagSource[] = [new TagSource(tlf1, 1), new TagSource(tlf2, 2)];

  const loadedTags = await loadTags(sources, 'MS-FOO');
  expect(tlf1).toHaveBeenCalledTimes(1);
  expect(tlf2).toHaveBeenCalledTimes(1);
  expect(tlf1).toHaveBeenLastCalledWith('MS-FOO');
  expect(tlf2).toHaveBeenLastCalledWith('MS-FOO');

  expect(loadedTags.id).toBe('MS-FOO');
  expect(loadedTags.tags.asObject()).toEqual({
    foo: 46,
    bar: 4,
  });
});
