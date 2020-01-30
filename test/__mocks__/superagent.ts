import { get } from '../mocking/superagent-mocking';

export = {
  ...jest.requireActual('superagent'),
  get,
};
