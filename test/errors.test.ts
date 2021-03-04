import {
  BaseError,
  ErrorCategories,
  ErrorTag,
  isTagged,
  NotFoundError,
} from '../src/errors';

describe('isTagged', () => {
  test.each([[], new Set(), ['a'], new Set(['a'])])(
    'accepts objects tagged with %j',
    tags => {
      expect(isTagged({tags})).toBeTruthy();
    }
  );

  test.each<[unknown, string]>([
    [undefined, 'is not an object'],
    [{}, 'has no tags property'],
    [{tags: undefined}, "has a tag property which isn't Iterable"],
    [{tags: [{}]}, 'has a tag property which contains a non-tag element'],
  ])('rejects %j because it %s', obj => {
    expect(isTagged(obj)).not.toBeTruthy();
  });
});

describe('BaseError', () => {
  class TestError extends BaseError {
    get defaultTags(): Iterable<ErrorTag> {
      return ['foo', 'bar'];
    }
  }

  test('constructor overloads', async () => {
    const message = 'hi';
    const nested = new Error('nested error message');
    const tags = ['a', 'b'];

    expect(new BaseError(message).message).toEqual(message);
    expect(new BaseError({message: message}).message).toEqual(message);

    expect(new BaseError({tags}).instanceTags).toEqual(new Set(tags));
    expect(new BaseError({tags}).nestedTags).toEqual(new Set());

    expect(new BaseError(undefined, nested).nested).toBe(nested);
    expect(new BaseError({nested}).nested).toBe(nested);
  });

  test('stack contains nested error', () => {
    expect(
      new BaseError({nested: new Error('nested error message')}).stack
    ).toMatch(/Caused By: Error: nested error message/);
  });

  test('tags from defaultTags() are included in tags', () => {
    expect(new TestError({tags: ['baz']}).tags).toEqual(
      new Set(['foo', 'bar', 'baz'])
    );
  });

  test('tags contains instance tags, nestedTags and defaultTags', () => {
    const nested = new BaseError({
      message: 'nested error message',
      tags: ['c'],
      nested: new TestError(),
    });

    expect(new BaseError({tags: ['a', 'b'], nested}).tags).toEqual(
      new Set(['a', 'b', 'c', 'foo', 'bar'])
    );
  });
});

describe('NotFoundError', () => {
  test('has NotFound in defaultTags', () => {
    expect(new NotFoundError().defaultTags).toContain(ErrorCategories.NotFound);
  });
});
