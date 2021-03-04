import {BaseError} from '../src/errors';

describe('toThrowErrorTaggedWith', () => {
  function throwWithTags(...tags: string[]): never {
    throw new BaseError({tags});
  }

  async function promiseRejectedWithErrorTaggedWith(
    ...tags: string[]
  ): Promise<void> {
    throwWithTags(...tags);
  }

  test('passes when matching a single tag', () => {
    expect(() => throwWithTags('a')).toThrowErrorTaggedWith('a');
  });

  test('passes when matching a multiple tags', () => {
    expect(() => throwWithTags('a', 'b', 'c')).toThrowErrorTaggedWith([
      'a',
      'b',
      'c',
    ]);
  });

  test('passes when matching a subset of tags', () => {
    expect(() => throwWithTags('a', 'b', 'c', 'd')).toThrowErrorTaggedWith([
      'a',
      'b',
      'c',
    ]);
  });

  test('fails when callback is not a function', () => {
    expect(() =>
      expect(undefined).toThrowErrorTaggedWith('a')
    ).toThrowErrorMatchingSnapshot();
  });

  test('fails when callback does not throw', () => {
    expect(() =>
      expect(() => undefined).toThrowErrorTaggedWith('a')
    ).toThrowErrorMatchingSnapshot();
  });

  test('fails when thrown error is not tagged', () => {
    expect(() =>
      expect(() => {
        throw new Error();
      }).toThrowErrorTaggedWith('a')
    ).toThrowErrorMatchingSnapshot();
  });

  test('fails when thrown error does not have a single required tag', () => {
    expect(() =>
      expect(() => throwWithTags('b')).toThrowErrorTaggedWith('a')
    ).toThrowErrorMatchingSnapshot();
  });

  test('fails when thrown error is tagged with a subset of required tags', () => {
    expect(() =>
      expect(() => throwWithTags('a', 'b', 'c')).toThrowErrorTaggedWith([
        'a',
        'd',
      ])
    ).toThrowErrorMatchingSnapshot();
  });

  test('passes in .rejects mode when a promise rejects with a correctly-tagged error', async () => {
    await expect(
      promiseRejectedWithErrorTaggedWith('a')
    ).rejects.toThrowErrorTaggedWith('a');
  });

  test('fails in .rejects mode when a promise rejects with an incorrectly-tagged error', async () => {
    await expect(
      expect(
        promiseRejectedWithErrorTaggedWith('a')
      ).rejects.toThrowErrorTaggedWith('b')
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  test('fails in .rejects mode when a promise resolves', async () => {
    await expect(
      expect(Promise.resolve()).rejects.toThrowErrorTaggedWith('a')
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  test('fails in .resolves mode when a promise resolves', async () => {
    await expect(
      expect(Promise.resolve()).resolves.toThrowErrorTaggedWith('a')
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  test('fails in .resolves mode when a promise rejects', async () => {
    await expect(
      expect(Promise.resolve()).resolves.toThrowErrorTaggedWith('a')
    ).rejects.toThrowErrorMatchingSnapshot();
  });
});
