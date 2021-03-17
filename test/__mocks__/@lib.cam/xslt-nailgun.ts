import {
  execute as _execute,
  XSLTExecutor as _XSLTExecutor,
} from '@lib.cam/xslt-nailgun';

export const XSLTExecutor = jest.fn<_XSLTExecutor, []>(
  () =>
    (({
      execute: jest.fn(),
      close: jest.fn(),
    } as Partial<_XSLTExecutor>) as _XSLTExecutor)
);

((XSLTExecutor as unknown) as typeof _XSLTExecutor).getInstance = jest.fn(
  () => {
    return new XSLTExecutor();
  }
);

export const execute: typeof _execute = jest.fn();
