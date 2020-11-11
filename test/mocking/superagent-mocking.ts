import {Response} from 'superagent';

export type PartialResponse = Partial<Response>;
export type MockResponder = (url: string) => Promise<PartialResponse>;
const defaultResponder: MockResponder = () => {
  throw new Error(
    'No mock response is set. The mockGetResponder jest mock function must be configured to provide a response (e.g. mockGetResponder.mockImplementation(...))'
  );
};
export const mockGetResponder = jest.fn(defaultResponder);

export class MockRequest implements PromiseLike<PartialResponse> {
  private static readonly MOCKED_METHODS = 'parse buffer'.split(' ');

  private readonly response: Promise<PartialResponse>;
  readonly then: PromiseLike<PartialResponse>['then'];

  constructor(response: Promise<PartialResponse>) {
    this.response = response;
    this.then = this.response.then.bind(this.response);

    for (const methodName of MockRequest.MOCKED_METHODS) {
      (this as {[key in string]: unknown})[methodName] = jest.fn(() => this);
    }
  }
}

export const get = jest.fn(
  (url: string): MockRequest => {
    return new MockRequest(mockGetResponder(url));
  }
);
