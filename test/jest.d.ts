import {ErrorTag} from '../src/errors';

declare global {
  declare namespace jest {
    interface Matchers {
      toThrowErrorTaggedWith(
        expected: ErrorTag | Iterable<ErrorTag>
      ): CustomMatcherResult;
    }
  }
}
