import { AssertionError } from 'assert';
import escapeStringRegexp from 'escape-string-regexp';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { MetadataRepository } from '../src/metadata';
import { TEST_DATA_PATH } from './constants';

function getRepo() {
  return new MetadataRepository(path.resolve(TEST_DATA_PATH, 'metadata'));
}

const ITEM_JSON_PATH = path.resolve(
  TEST_DATA_PATH,
  'metadata/json/MS-ADD-03959.json'
);
const ITEM_TEI_PATH = path.resolve(
  TEST_DATA_PATH,
  'metadata/data/tei/MS-ADD-03959/MS-ADD-03959.xml'
);

describe('MetadataRepository', () => {
  test('getPath() returns JSON metadata path', () => {
    expect(getRepo().getPath('json', 'MS-ADD-03959')).toBe(ITEM_JSON_PATH);
  });

  test('getPath() returns non-JSON metadata path', () => {
    expect(getRepo().getPath('tei', 'MS-ADD-03959')).toBe(ITEM_TEI_PATH);
  });

  test('getJSON() returns parsed JSON metadata', async () => {
    expect(await getRepo().getJSON('MS-ADD-03959')).toEqual(
      JSON.parse(await promisify(fs.readFile)(ITEM_JSON_PATH, 'utf-8'))
    );
  });

  test('getJSON() reports missing file', async () => {
    expect.assertions(2);

    const repo = getRepo();
    try {
      await repo.getJSON('MISSING');
    } catch (e) {
      expect(`${e}`).toMatch(
        `MetadataError: Failed to load metadata from ${repo.getPath(
          'json',
          'MISSING'
        )}: ENOENT: no such file or directory`
      );
      expect(e.nested.code).toBe('ENOENT');
    }
  });

  test('getJSON() reports broken JSON', async () => {
    expect.assertions(2);

    const repo = getRepo();
    try {
      await repo.getJSON('INVALID');
    } catch (e) {
      expect(`${e}`).toMatch(
        `MetadataError: Failed to load metadata from ${repo.getPath(
          'json',
          'INVALID'
        )}: Unexpected end of JSON input`
      );
      expect(e.nested).toBeInstanceOf(SyntaxError);
    }
  });

  test('getJSON() reports JSON without required attributes', async () => {
    expect.assertions(1);

    const repo = getRepo();
    try {
      await repo.getJSON('EMPTY');
    } catch (e) {
      expect(`${e}`).toMatch(
        `MetadataError: Failed to load metadata from ${repo.getPath(
          'json',
          'EMPTY'
        )}: unexpected JSON structure`
      );
    }
  });
});
