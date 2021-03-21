import express, {Application} from 'express';
import {get} from 'superagent';
import request from 'supertest';
import {getRoutes} from '../../src/routes/translation';

import {
  EXAMPLE_TEI_URL,
  EXAMPLE_ZACYNTHIUS_URL,
  TEST_DATA_PATH,
} from '../constants';
import {mockGetResponder} from '../mocking/superagent-mocking';
import {promisify} from 'util';
import fs from 'fs';
import path from 'path';
import {mocked} from 'ts-jest/utils';
import {parseHTML} from '../../src/html';
import {StatusCodes} from 'http-status-codes';
import {DEFAULT_RESOURCE_EXTENSIONS} from '../../src/routes/transcription-impl';
import mime from 'mime';
import assert from 'assert';

function getTestApp() {
  const app = express();
  app.use(
    '/',
    getRoutes({
      teiServiceURL: EXAMPLE_TEI_URL,
      zacynthiusServiceURL: EXAMPLE_ZACYNTHIUS_URL,
    })
  );
  return app;
}

let app: Application;

beforeEach(() => {
  jest.clearAllMocks();
  app = getTestApp();
});

describe('translation routes /tei/EN/:id/:from/:to', () => {
  describe('tei', () => {
    test('requests with the same start and end page are normalised by redirecting to the URL without end', async () => {
      const response = await request(app).get(
        '/tei/EN/MS-FOO-01234-00001/i1/i1'
      );
      expect(response.status).toEqual(StatusCodes.MOVED_PERMANENTLY);
      expect(response.headers.location).toEqual(
        '/tei/EN/MS-FOO-01234-00001/i1'
      );
    });

    test.each([...DEFAULT_RESOURCE_EXTENSIONS])(
      'requests for .%s resources are proxied',
      async ext => {
        const type = mime.getType(ext);
        assert(typeof type === 'string');
        mockGetResponder.mockResolvedValueOnce({
          status: 200,
          type,
          body: Buffer.from(''),
          ok: true,
          serverError: false,
        });

        const response = await request(app).get(
          `/tei/resources/foo/bar/baz.${ext}`
        );
        expect(response.ok).toBeTruthy();
        expect(mocked(get)).toHaveBeenCalledTimes(1);
        expect(mocked(get)).toHaveBeenLastCalledWith(
          `${EXAMPLE_TEI_URL}foo/bar/baz.${ext}`
        );
      }
    );

    test.each([
      [
        '/tei/EN/MS-FOO-01234-00001/i1',
        `${EXAMPLE_TEI_URL}html/data/tei/MS-FOO-01234-00001/MS-FOO-01234-00001-i1-translation.html`,
        '../../resources',
      ],
      [
        '/tei/EN/MS-FOO-01234-00001/i1/i2',
        `${EXAMPLE_TEI_URL}html/data/tei/MS-FOO-01234-00001/MS-FOO-01234-00001-i1-i2-translation.html`,
        '../../../resources',
      ],
    ])('translation HTML %s', async (_path, upstreamURL, baseResourceURL) => {
      mockGetResponder.mockResolvedValueOnce({
        status: 200,
        type: 'text/html',
        body: await promisify(fs.readFile)(
          // translation HTML is similar enough to transcription HTML to not matter
          path.resolve(TEST_DATA_PATH, 'transcriptions/tei.html')
        ),
        ok: true,
        serverError: false,
      });

      const response = await request(app).get(_path);
      expect(response.ok).toBeTruthy();

      expect(mocked(get)).toHaveBeenCalledTimes(1);
      expect(mocked(get)).toHaveBeenLastCalledWith(upstreamURL);

      const doc = parseHTML({
        html: response.text,
        contentType: response.type,
        url: `http://example.com/v1/translation${_path}`,
      }).window.document;
      const linkEl = doc.querySelector<HTMLLinkElement>(
        'head link[rel=stylesheet]'
      );
      expect(linkEl!.getAttribute('href')).toBe(
        `${baseResourceURL}/cudl-resources/stylesheets/texts.css`
      );
      expect(linkEl!.href).toBe(
        'http://example.com/v1/translation/tei/resources/cudl-resources/stylesheets/texts.css'
      );
    });
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
