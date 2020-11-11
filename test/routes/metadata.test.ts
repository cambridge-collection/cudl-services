import express from 'express';
import fs from 'fs';
import {StatusCodes} from 'http-status-codes';
import path from 'path';
import request from 'supertest';
import {promisify} from 'util';
import {CUDLMetadataRepository} from '../../src/metadata';

import {getRoutes} from '../../src/routes/metadata';
import {TEST_DATA_PATH} from '../constants';

import {getTestDataMetadataRepository} from '../utils';

function getTestApp(metadataRepository: CUDLMetadataRepository) {
  const app = express();
  app.use('/', getRoutes({metadataRepository}));
  return app;
}

describe('metadata routes /:format/:id', () => {
  let repo: CUDLMetadataRepository, app: express.Application;

  beforeEach(() => {
    repo = getTestDataMetadataRepository();
    app = getTestApp(repo);
  });

  test.each([
    ['MS-ADD-03959'],
    ['non-embeddable-item'],
    ['item-without-rights-statement'],
  ])('/json/%s reponds with JSON metadata', async id => {
    const response = await request(app).get(`/json/${id}`);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(response.body).toEqual(
      JSON.parse(
        await promisify(fs.readFile)(
          path.resolve(TEST_DATA_PATH, `metadata/json/${id}.json`),
          'utf-8'
        )
      )
    );
  });

  test('/json/:id forbids cross-origin requests for non-embeddable items', async () => {
    const response = await request(app)
      .get('/json/non-embeddable-item')
      .set('Origin', 'https://example.com');
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(response.body.error).toMatch(
      'This item is only available from cudl.lib.cam.ac.uk'
    );
  });

  test('/json/:id responds with 404 for missing ID', async () => {
    const response = await request(app).get('/json/MS-MISSING');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('/json/:id responds with 500 for invalid metadata', async () => {
    const response = await request(app).get('/json/INVALID');
    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  test.each([
    ['format', `/${encodeURIComponent('abc/def')}/foo`],
    ['id', `/foo/${encodeURIComponent('abc/def')}`],
  ])('%s param cannot contain slashes', async (param, url) => {
    const response = await request(app).get(url);
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('/:format/:id responds with 500 for invalid metadata when requesting non-json metadata', async () => {
    const response = await request(app).get('/tei/INVALID');
    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  test('/:format/:id responds with non-JSON metadata', async () => {
    const response = await request(app).get('/tei/MS-ADD-03959');
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.text).toEqual(
      await promisify(fs.readFile)(
        path.resolve(
          TEST_DATA_PATH,
          'metadata/data/tei/MS-ADD-03959/MS-ADD-03959.xml'
        ),
        'utf-8'
      )
    );
  });

  test('/:format/:id responds with 403 for non-json metadata without a rights statement', async () => {
    const response = await request(app).get(
      '/tei/item-without-rights-statement'
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(response.body.error).toBe(
      'Access not allowed to requested metadata'
    );
  });
});
