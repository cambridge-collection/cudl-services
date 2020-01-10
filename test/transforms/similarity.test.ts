import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import xmldom from 'xmldom';
import { transform } from '../../src/transforms/similarity';
import { TEST_DATA_PATH } from '../constants';

async function getSimilarityResponse() {
  const xml = await promisify(fs.readFile)(
    path.resolve(TEST_DATA_PATH, 'similarity-response.xml'),
    'utf-8'
  );
  return new xmldom.DOMParser().parseFromString(xml);
}

test('transform()', async () => {
  const xml = await getSimilarityResponse();

  const result = transform(xml);
  expect(result.queryTime).toBe(0.033);
  expect(result.totalDocs).toBe(29428);
  expect(result.startDoc).toBe(1);
  expect(result.endDoc).toBe(10);
  expect(result.hits.length).toBe(10);
  expect(result.hits[0]).toEqual({
    score: 100,
    ID: 'MS-ADD-03965',
    structureNodeId: '31',
  });
});
