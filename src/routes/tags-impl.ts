import { AssertionError } from 'assert';
import fs from 'fs';
import { QueryResult } from 'pg';
import * as util from 'util';
import { BasePostgresDAO } from '../db';
import { NotFoundError, ValueError } from '../errors';
import { sorted } from '../util';

export type Tag = [string, number];

export interface TagSet extends Iterable<[string, number]> {
  getTags(): Iterable<string>;
  contains(tagName: string): boolean;
  getValue(tagName: string): number;
  asObject(): { [key: string]: number };
}

export abstract class AbstractTagSet implements TagSet {
  abstract contains(tagName: string): boolean;
  abstract getTags(): Iterable<string>;
  abstract getValue(tagName: string): number;

  *[Symbol.iterator](): Iterator<[string, number]> {
    for (const name of this.getTags()) {
      yield [name, this.getValue(name)];
    }
  }

  asObject(): { [p: string]: number } {
    return Object.fromEntries(this);
  }

  protected tagNotFound(tagName: string): never {
    throw new NotFoundError(`No such tag name: ${tagName}`);
  }
}

/**
 * A TagSet is an immutable set of unique tag names associated with numeric
 * values.
 *
 * This function constructs a TagSet from an array of tag data.
 *
 * @param [tags] An array of [tag, value] pairs, where tag is a string and value a number.
 */
export class DefaultTagSet extends AbstractTagSet {
  private readonly tags: Map<string, number>;

  constructor(tags?: Tag[]) {
    super();
    this.tags = new Map(tags);
  }

  getTags() {
    return this.tags.keys();
  }

  contains(tagName: string) {
    return this.tags.has(tagName);
  }

  getValue(tagName: string): number {
    const value = this.tags.get(tagName);
    if (value === undefined) {
      this.tagNotFound(tagName);
    }
    return value;
  }
}

// A TagSet which presents a view of another TagSet. This is intended to be
// used as a base class for views which modify the viewed TagSet in some way,
// as this view does nothing to modify the viewed TagSet.
export class ViewTagSet<T extends TagSet = TagSet> extends AbstractTagSet {
  protected readonly parentTagSet: T;

  constructor(parentTagSet: T) {
    super();
    this.parentTagSet = parentTagSet;
  }

  getTags() {
    return this.parentTagSet.getTags();
  }

  contains(tagName: string) {
    return this.parentTagSet.contains(tagName);
  }

  getValue(tagName: string) {
    return this.parentTagSet.getValue(tagName);
  }
}

/**
 * Presents a view of TagSet with values adjusted by a weighting factor.
 *
 * @param tagSet: The set of tags to be weighted.
 * @param weight: The weighting factor to be multiplied with the tag values from tagSet.
 */
export class WeightedTagSet extends ViewTagSet {
  private readonly weight: number;

  constructor(tagSet: TagSet, weight: number) {
    super(tagSet);
    this.weight = weight;
  }

  getValue(tagName: string) {
    return this.parentTagSet.getValue(tagName) * this.weight;
  }
}

export type TagMerger = (a: number, b: number) => number;

export class MergedTagSet extends AbstractTagSet {
  private readonly tagSources: TagSet[];
  private readonly mergeValues: TagMerger;

  constructor(tagSources: Iterable<TagSet>, mergeValues?: TagMerger) {
    super();
    this.tagSources = Array.from(tagSources);
    this.mergeValues = mergeValues || ((a, b) => a + b);
  }

  getTags() {
    const tags = new Set<string>();
    for (const tagSet of this.tagSources) {
      for (const tagName of tagSet.getTags()) {
        tags.add(tagName);
      }
    }
    return tags.keys();
  }

  contains(tagName: string) {
    for (const tagSet of this.tagSources) {
      if (tagSet.contains(tagName)) {
        return true;
      }
    }
    return false;
  }

  getValue(tagName: string) {
    const values = this.tagSources
      .map(ts => (ts.contains(tagName) ? ts.getValue(tagName) : undefined))
      .filter(val => val !== undefined);

    if (values.length === 0) {
      this.tagNotFound(tagName);
    }

    const value = values.reduce(this.mergeValues);
    if (value === undefined) {
      throw new AssertionError({ message: 'mergeValues returned undefined' });
    }
    return value;
  }
}

export type TagPredicate<T extends TagSet = TagSet> = (
  name: string,
  value: number,
  tagSet: T
) => boolean;

export class FilterTagSet<T extends TagSet = TagSet> extends ViewTagSet<T> {
  private readonly predicate: TagPredicate<T>;

  constructor(tagSource: T, predicate?: TagPredicate<T>) {
    super(tagSource);
    this.predicate = predicate || this.defaultPredicate;
  }

  defaultPredicate() {
    return true;
  }

  *getTags() {
    for (const name of super.getTags()) {
      if (this.contains(name)) {
        yield name;
      }
    }
  }

  contains(tagName: string) {
    return (
      this.parentTagSet.contains(tagName) &&
      this.predicate(
        tagName,
        this.parentTagSet.getValue(tagName),
        this.parentTagSet
      )
    );
  }

  getValue(tagName: string) {
    if (!this.contains(tagName)) {
      this.tagNotFound(tagName);
    }

    return super.getValue(tagName);
  }
}

export interface TagResultRow {
  tagname: string;
  frequency: number;
}

export function isTagResultRow(obj: unknown): obj is TagResultRow {
  const _obj = obj as Partial<TagResultRow>;
  return (
    typeof _obj === 'object' &&
    typeof _obj.tagname === 'string' &&
    typeof _obj.frequency === 'number'
  );
}

export function isTagResultRowArray(obj: unknown[]): obj is TagResultRow[] {
  return obj.every(isTagResultRow);
}

function tagSetFromRows(queryResult: QueryResult<TagResultRow>) {
  const pairs: Tag[] = queryResult.rows.map(r => {
    return [r.tagname, r.frequency];
  });
  return new DefaultTagSet(pairs);
}

export interface TagsDAO {
  removedTags(docId: string): Promise<TagSet>;
  thirdPartyTags(docId: string): Promise<TagSet>;
  annotationTags(docId: string): Promise<TagSet>;
}

export class PostgresTagsDAO extends BasePostgresDAO implements TagsDAO {
  private async queryForTags(query: string, docId: string) {
    const result = await this.db.query(query, [docId]);
    if (!isTagResultRowArray(result.rows)) {
      throw new Error('SQL query result has unexpected structure');
    }
    return tagSetFromRows(result);
  }

  async annotationTags(docId: string): Promise<TagSet> {
    return this.queryForTags(ANNOTATION_FREQ_SQL, docId);
  }

  async removedTags(docId: string): Promise<TagSet> {
    return this.queryForTags(REMOVED_TAG_FREQ_SQL, docId);
  }

  async thirdPartyTags(docId: string): Promise<TagSet> {
    return this.queryForTags(TAG_FREQ_SQL, docId);
  }
}

const REMOVED_TAG_FREQ_SQL = fs.readFileSync(
  require.resolve('../../sql/removed-tag-frequency-by-item.sql'),
  'utf-8'
);

const TAG_FREQ_SQL = fs.readFileSync(
  require.resolve('../../sql/tag-frequency-by-item.sql'),
  'utf-8'
);

const ANNOTATION_FREQ_SQL = fs.readFileSync(
  require.resolve('../../sql/annotation-frequency-by-item.sql'),
  'utf-8'
);

export type TagLoadFunction = (docId: string) => Promise<TagSet>;

export class TagSource {
  private readonly factory: TagLoadFunction;
  readonly weight: number;

  constructor(factory: (docId: string) => Promise<TagSet>, weight: number) {
    this.factory = factory;
    this.weight = weight;
  }

  static fromTagsDAO(
    dao: TagsDAO,
    method: keyof TagsDAO,
    weight: number
  ): TagSource {
    return new TagSource(dao[method].bind(dao), weight);
  }

  async loadTags(docId: string): Promise<TagSet> {
    const rawTags = await this.factory(docId);
    return new WeightedTagSet(rawTags, this.weight);
  }
}

export type NamedTagSources<T extends string> = { [key in T]: TagSource };

export function selectTagSources<T extends { [key: string]: TagSource }>(
  sources: T,
  srcList: Array<keyof T> | string
): TagSource[] {
  if (typeof srcList === 'string') {
    return selectTagSources(sources, srcList.split(','));
  }

  if (new Set(srcList).size !== srcList.length) {
    throw new ValueError('source list contained a duplicate name');
  }

  return srcList.map(name => {
    if (!sources.hasOwnProperty(name)) {
      throw new ValueError(`no tag source exists with name: ${util.inspect(
        name
      )}, available sources: \
${sorted(Object.getOwnPropertyNames(sources)).join(', ')}`);
    }
    return sources[name];
  });
}

/**
 * Merge one or more TagSets by summing values of tags occurring in more than
 * one set. Tags without positive values are excluded.
 */
export function mergeTagSets(tagSets: TagSet[]) {
  return new FilterTagSet(new MergedTagSet(tagSets), (_, value) => value > 0);
}

export interface ItemTags {
  id: string;
  tags: TagSet;
}

/**
 * Load the provided array of tag sources, weighting them accordingly,
 * merging the results together and excluding tags without positive values.
 */
export async function loadTags(
  sources: TagSource[],
  docId: string
): Promise<ItemTags> {
  const tagSets = await Promise.all(
    sources.map(async tagSource => tagSource.loadTags(docId))
  );

  return {
    id: docId,
    tags: mergeTagSets(tagSets),
  };
}
