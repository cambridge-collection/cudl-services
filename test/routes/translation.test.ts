import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import express, {Application} from 'express';
import {StatusCodes} from 'http-status-codes';
import {JSDOM} from 'jsdom';
import {get} from 'superagent';
import request from 'supertest';
import {getRoutes} from '../../src/routes/translation';

import {EXAMPLE_STATIC_FILES, EXAMPLE_ZACYNTHIUS_URL} from '../constants';
import {mockGetResponder} from '../mocking/superagent-mocking';

import {getTestDataMetadataRepository} from '../utils';
import {CUDLMetadataRepository} from '../../src/metadata/cudl';

// Example translation requests:
// /v1/translation/tei/EN/MS-LC-II-00077/15r/15r
// /v1/translation/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto

function getTestApp(
  metadataRepository: CUDLMetadataRepository,
  xsltExecutor: XSLTExecutor
) {
  const app = express();
  app.use(
    '/',
    getRoutes({
      metadataRepository,
      xsltExecutor,
      zacynthiusServiceURL: EXAMPLE_ZACYNTHIUS_URL,
    })
  );
  return app;
}

let metadataRepository: CUDLMetadataRepository;
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

describe('translation routes /tei/EN/:id/:from/:to', () => {
  test('responds with 404 for missing ID', async () => {
    const response = await request(app).get('/tei/EN/missing/1/2');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(response.body.error).toMatch('ID does not exist: missing');
  });

  test.each<['id' | 'from' | 'to', string, string, string]>([
    ['id', 'foo../blah', 'bar', 'baz'],
    ['from', 'foo', 'bar../blah', 'baz'],
    ['to', 'foo', 'bar', 'baz../blah'],
  ])(
    'responds with 500 for invalid %s parameter',
    async (param, id, from, to) => {
      const response = await request(app).get(
        `/tei/EN/${encodeURIComponent(id)}/${encodeURIComponent(
          from
        )}/${encodeURIComponent(to)}`
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(response.body.error).toMatch(
        `Bad ${param}: ${{id, from, to}[param]}`
      );
    }
  );

  type HTMLLinkElement = Element & {href?: string};

  test('responds with HTML content for valid request', async () => {
    const urlBase = 'https://example.com';
    const urlPath = '/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto';
    const response = await request(app).get(
      '/tei/EN/MS-LC-II-00077/viii%20recto/viii%20recto'
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.type).toBe('text/html');
    const dom = new JSDOM(response.text, {url: `${urlBase}${urlPath}`});
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

describe('translation routes /zacynthius/:page', () => {
  test('zacynthius translation', async () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><title>foo</title></head><body></body></html>';
    mockGetResponder.mockResolvedValueOnce({
      status: 200,
      type: 'text/html',
      text: html,
      body: Buffer.from(html, 'utf8'),
      ok: true,
      serverError: false,
    });

    const response = await request(app).get('/zacynthius/t2v');
    expect(response.ok).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenLastCalledWith(
      `${EXAMPLE_ZACYNTHIUS_URL}translation/t2v.html`
    );
    expect(response.text).toBe(html);
  });
});
