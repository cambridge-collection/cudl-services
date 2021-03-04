import {ErrorTag, isErrorTag, isTagged} from '../src/errors';
import Constructable = jest.Constructable;
import CustomMatcherResult = jest.CustomMatcherResult;
import MatcherContext = jest.MatcherContext;

export type TagErrorPattern = {
  tag?: ErrorTag | Iterable<ErrorTag>;
  message?: string | RegExp;
  type?: Constructable;
};

export function toBeTaggedWith(
  this: MatcherContext,
  obj: unknown,
  expected: ErrorTag | Iterable<ErrorTag>
): CustomMatcherResult {
  let pass = false;
  let receivedTags: Set<ErrorTag> | undefined = undefined;
  const expectedTags = [
    ...new Set([...(isErrorTag(expected) ? [expected] : expected)]),
  ];

  if (isTagged(obj)) {
    const _receivedTags = new Set(obj.tags);
    receivedTags = _receivedTags;
    pass = expectedTags.every(t => _receivedTags.has(t));
  }

  const message = () =>
    `Expected: ${this.utils.printExpected(expectedTags)}${
      pass ? ' not' : ''
    } to be in the error's tag set\n` +
    `Received: ${
      receivedTags
        ? this.utils.printReceived([...receivedTags])
        : '*error is not tagged*'
    }`;

  return {pass, message};
}

expect.extend({
  toThrowErrorTaggedWith(
    callback: unknown,
    expected: ErrorTag | Iterable<ErrorTag>
  ) {
    const hintOptions = {
      isNot: this.isNot,
      promise: this.promise,
    };
    const hint =
      this.utils.matcherHint(
        'toThrowErrorTaggedWith',
        undefined,
        undefined,
        hintOptions
      ) + '\n\n';

    let error: unknown;

    if (callback instanceof Error) {
      error = callback;
    } else {
      if (typeof callback !== 'function') {
        return {
          pass: false,
          message: () =>
            `${hint}Received value must be a function or Error but instead "${this.utils.printReceived(
              callback
            )}" was found`,
        };
      }

      try {
        callback();
      } catch (e) {
        error = e;
      }
    }

    if (error === undefined) {
      return {
        pass: false,
        message: () => `${hint}expected an Error to be thrown but none was`,
      };
    }

    const result = toBeTaggedWith.call(this, error, expected);

    const message = () => hint + result.message();

    return {pass: result.pass, message};
  },
});
