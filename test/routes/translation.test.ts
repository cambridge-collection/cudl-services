import { XSLTExecutor } from '@lib.cam/xslt-nailgun';
import express, { Application } from 'express';
import { BAD_REQUEST, NOT_FOUND, OK } from 'http-status-codes';
import { JSDOM } from 'jsdom';
import request from 'supertest';
import { MetadataRepository } from '../../src/metadata';
import { getRoutes } from '../../src/routes/translation';

import { getTestDataMetadataRepository } from '../utils';

import { EXAMPLE_STATIC_FILES } from '../constants';

// Example translation requests:
// /v1/translation/tei/EN/MS-LC-II-00077/15r/15r
// /v1/translation/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto

function getTestApp(
  metadataRepository: MetadataRepository,
  xsltExecutor: XSLTExecutor
) {
  const app = express();
  app.use('/', getRoutes({ metadataRepository, xsltExecutor }));
  return app;
}

describe(`translation routes /tei/EN/:id/:from/:to`, () => {
  let metadataRepository: MetadataRepository;
  let xsltExecutor: XSLTExecutor;
  let app: Application;

  beforeAll(() => {
    xsltExecutor = XSLTExecutor.getInstance();
    metadataRepository = getTestDataMetadataRepository();
    app = getTestApp(metadataRepository, xsltExecutor);
  });

  afterAll(async () => {
    await xsltExecutor.close();
  });

  test('responds with 404 for missing ID', async () => {
    const response = await request(app).get('/tei/EN/missing/1/2');
    expect(response.status).toBe(NOT_FOUND);
    expect(response.body.error).toMatch('ID does not exist: missing');
  });

  test.each([
    ['id', 'foo../blah', 'bar', 'baz'],
    ['from', 'foo', 'bar../blah', 'baz'],
    ['to', 'foo', 'bar', 'baz../blah'],
  ])(
    'responds with 500 for invalid %s parameter',
    async (param: 'id' | 'from' | 'to', id, from, to) => {
      const response = await request(app).get(
        `/tei/EN/${encodeURIComponent(id)}/${encodeURIComponent(
          from
        )}/${encodeURIComponent(to)}`
      );
      expect(response.status).toBe(BAD_REQUEST);
      expect(response.body.error).toMatch(
        `Bad ${param}: ${{ id, from, to }[param]}`
      );
    }
  );

  type HTMLLinkElement = Element & { href?: string };

  test('responds with HTML content for valid request', async () => {
    const urlBase = 'https://example.com';
    const urlPath = '/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto';
    const response = await request(app).get(
      '/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto'
    );
    expect(response.status).toBe(OK);
    expect(response.type).toBe('text/html');
    const dom = new JSDOM(response.text, { url: `${urlBase}${urlPath}` });
    const doc = dom.window.document;

    expect(doc.querySelector('html > head > title')?.textContent).toBe(
      'Folio viii recto'
    );
    expect(
      (doc.querySelector('head link[rel=stylesheet]') as HTMLLinkElement | null)
        ?.href
    ).toBe(`${urlBase}/${EXAMPLE_STATIC_FILES.TEXTS_STYLESHEET.path}`);
    expect(doc.querySelector('body .header')?.textContent).toBe('<viii recto>');
    expect(
      doc.querySelector('body .body p:nth-of-type(1)')?.textContent
    ).toMatch(
      /^There is probably no portion of the history of our earlier colleges/
    );
    expect(
      doc.querySelector('body .body p:nth-of-type(2)')?.textContent
    ).toMatch(/^The volume in question is a bulky folio bound in dark green/);
    expect(
      doc.querySelector('body .body p:nth-of-type(3)')?.textContent
    ).toMatch(/^\[difficult hand; transcription still in progress\]/);
  });
});
