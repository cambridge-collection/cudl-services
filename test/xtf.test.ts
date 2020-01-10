jest.mock('superagent');

import superagent, { Response, SuperAgentRequest } from 'superagent';
import { XTFConfig } from '../src/config';
import { getSimilarItems, getUrl, search } from '../src/xtf';

const exampleConfig: XTFConfig = {
  xtfBase: 'http://xtf.example.com/foo/',
  xtfIndexPath: '/opt/xtf/index',
};

function mocked<T extends (...args: unknown[]) => unknown>(
  func: T
): jest.MockedFunction<T> {
  if (typeof ((func as unknown) as { mock: unknown })['mock'] !== 'object') {
    throw new Error(`func is not a mock: ${func}`);
  }
  return func as jest.MockedFunction<T>;
}

test('getUrl', () => {
  expect(getUrl(exampleConfig, 'search?smode=123&abc=foo')).toEqual(
    `http://xtf.example.com/foo/search?smode=123&abc=foo&indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}`
  );
});

test('search() makes HTTP request to XTF', async () => {
  const response: Partial<Response> = {
    ok: true,
    type: 'text/xml',
  };
  mocked(superagent.get).mockResolvedValueOnce(
    (response as unknown) as SuperAgentRequest
  );

  const result = await search(exampleConfig, { identifier: 'foo' });

  expect(superagent.get).toHaveBeenCalledTimes(1);
  expect(superagent.get).toHaveBeenCalledWith(
    `http://xtf.example.com/foo/search?normalizeScores=true&identifier=foo&raw=true&indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}`
  );
  expect(result).toBe(result);
});

test.each<[string, Partial<Response>, string]>([
  [
    'non-200',
    { ok: false, status: 404 },
    'Non-200 status code received from XTF: 404',
  ],
  [
    'non-XML',
    { ok: true, type: 'text/plain' },
    'Unexpected content type received from XTF: text/plain',
  ],
])('search() rejects on %s responses', async (_, response, msg) => {
  mocked(superagent.get).mockResolvedValueOnce(
    (response as unknown) as SuperAgentRequest
  );

  await expect(search(exampleConfig, {})).rejects.toThrow(msg);
});

test('getSimilarItems()', async () => {
  const response: Partial<Response> = {
    ok: true,
    type: 'text/xml',
  };
  mocked(superagent.get).mockResolvedValueOnce(
    (response as unknown) as SuperAgentRequest
  );

  const result = await getSimilarItems(exampleConfig, 'MS-FOO', 'abcd', 10);
  expect(superagent.get).toHaveBeenCalledTimes(1);
  expect(superagent.get).toHaveBeenCalledWith(
    `http://xtf.example.com/foo/search?normalizeScores=true&smode=moreLike&identifier=MS-FOO%2Fabcd&docsPerPage=10&raw=true&indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}`
  );
  expect(result).toBe(response);
});

test('getSimilarItems() count must be positive', async () => {
  await expect(getSimilarItems(exampleConfig, 'A', 'B', -1)).rejects.toThrow(
    'Count was negative: -1'
  );
});
