import {mockGetResponder} from './mocking/superagent-mocking';

import superagent, {Response} from 'superagent';
import {XTFConfig} from '../src/config';
import {expectElementWithTag, expectNodeWithType, NodeType} from '../src/dom';
import {DefaultXTF, XTF} from '../src/xtf';

const exampleConfig: XTFConfig = {
  xtfBase: 'http://xtf.example.com/foo/',
  xtfIndexPath: '/opt/xtf/index',
};

let xtf: XTF & DefaultXTF;

beforeEach(() => {
  jest.clearAllMocks();
  xtf = new DefaultXTF(exampleConfig);
});

test('getUrl', () => {
  expect(xtf['getUrl']('search?smode=123&abc=foo').toString()).toEqual(
    `http://xtf.example.com/foo/search?smode=123&abc=foo&indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}`
  );
});

test('search() makes HTTP request to XTF', async () => {
  mockGetResponder.mockResolvedValueOnce({
    ok: true,
    type: 'text/xml',
    text: '<example/>',
  });

  const result = await xtf.search({identifier: 'foo'});

  expect(superagent.get).toHaveBeenCalledTimes(1);
  expect(superagent.get).toHaveBeenCalledWith(
    `http://xtf.example.com/foo/search?indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}&normalizeScores=true&identifier=foo&raw=true`
  );
  expectNodeWithType(result.firstChild, NodeType.ELEMENT_NODE);
  expectElementWithTag(result.firstChild, null, 'example');
});

test.each<[string, Partial<Response>, string]>([
  [
    'non-200',
    {ok: false, status: 404},
    'Non-200 status code received from XTF: 404',
  ],
  [
    'non-XML',
    {ok: true, type: 'text/plain'},
    'Unexpected content type received from XTF: text/plain',
  ],
])('search() rejects on %s responses', async (_, response, msg) => {
  mockGetResponder.mockResolvedValueOnce(response);

  await expect(xtf.search({})).rejects.toThrow(msg);
});

test('getSimilarItems()', async () => {
  mockGetResponder.mockResolvedValueOnce({
    ok: true,
    type: 'text/xml',
    text: '<example/>',
  });

  const result = await xtf.getSimilarItems('MS-FOO', 'abcd', 10);
  expect(superagent.get).toHaveBeenCalledTimes(1);
  expect(superagent.get).toHaveBeenCalledWith(
    `http://xtf.example.com/foo/search?indexPath=${encodeURIComponent(
      exampleConfig.xtfIndexPath
    )}&normalizeScores=true&smode=moreLike&identifier=MS-FOO%2Fabcd&docsPerPage=10&raw=true`
  );
  expectNodeWithType(result.firstChild, NodeType.ELEMENT_NODE);
  expectElementWithTag(result.firstChild, null, 'example');
});

test('getSimilarItems() count must be positive', async () => {
  await expect(xtf.getSimilarItems('A', 'B', -1)).rejects.toThrow(
    'Count was negative: -1'
  );
});
