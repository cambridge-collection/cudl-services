import express from 'express';
import * as fs from 'fs';
import {JSDOM} from 'jsdom';
import path from 'path';
import {get} from 'superagent';
import request from 'supertest';
import {mocked} from 'ts-jest/utils';
import {promisify} from 'util';
import {HTMLType, parseHTML} from '../../src/html';
import {
  getRoutes,
  rewriteHtmlResourceUrls,
} from '../../src/routes/transcription';
import {
  EXAMPLE_TEI_URL,
  EXAMPLE_ZACYNTHIUS_URL,
  TEST_DATA_PATH,
} from '../constants';
import {mockGetResponder} from '../mocking/superagent-mocking';
import {getTestDataMetadataRepository, normaliseSpace} from '../utils';
import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import assert from 'assert';
import mime from 'mime';
import {StatusCodes} from 'http-status-codes';

jest.unmock('@lib.cam/xslt-nailgun');

function getTestApp(options: Parameters<typeof getRoutes>[0]) {
  const app = express();
  app.use('/', getRoutes(options));
  return app;
}

describe('transcription routes', () => {
  let app: express.Application | undefined;
  let executor: XSLTExecutor | undefined;

  beforeAll(() => {
    executor = XSLTExecutor.getInstance();
  });

  afterAll(async () => {
    if (executor) {
      await executor.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assert(executor);
    app = getTestApp({
      metadataRepository: getTestDataMetadataRepository(),
      teiServiceURL: EXAMPLE_TEI_URL,
      xsltExecutor: executor,
      zacynthiusServiceURL: EXAMPLE_ZACYNTHIUS_URL,
    });
  });

  describe('external transcription services', () => {
    afterEach(() => {
      app = undefined;
    });

    test.each([
      [
        '/newton/normalized/external/foo/bar/baz',
        'http://www.newtonproject.ox.ac.uk/view/texts/normalized/foo?skin=minimal&show_header=no&start=bar&end=baz',
      ],
      [
        '/newton/diplomatic/external/foo/bar/baz',
        'http://www.newtonproject.ox.ac.uk/view/texts/diplomatic/foo?skin=minimal&show_header=no&start=bar&end=baz',
      ],
      [
        '/dmp/diplomatic/external/foo',
        'http://darwin.amnh.org/transcription-viewer.php?eid=foo',
      ],
      [
        '/palimpsest/normalised/external/foo/bar/bar',
        'http://cal-itsee.bham.ac.uk/itseeweb/fedeli/foo/bar_foo.html',
      ],
    ])(
      'external transcription %s requests %s',
      async (apiPath, externalURL) => {
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

        const response = await request(app).get(apiPath);
        expect(response.ok).toBeTruthy();
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenLastCalledWith(externalURL);
        expect(response.text).toBe(html);
      }
    );

    describe('zacynthius', () => {
      test.each([
        [
          '/zacynthius/overtext/o1r',
          `${EXAMPLE_ZACYNTHIUS_URL}overtext/o1r.html`,
          'overtext',
        ],
        [
          '/zacynthius/undertext/u1r',
          `${EXAMPLE_ZACYNTHIUS_URL}undertext/u1r.html`,
          'undertext',
        ],
      ])(
        'transcription HTML %s',
        async (_path, upstreamURL, resourcePrefix) => {
          mockGetResponder.mockResolvedValueOnce({
            status: 200,
            type: 'text/html',
            body: await promisify(fs.readFile)(
              path.resolve(TEST_DATA_PATH, 'transcriptions/zacynthius-o1r.html')
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
            url: 'http://example.com/api/zacynthius/overtext/o1r',
          }).window.document;
          const linkEl = doc.querySelector<HTMLLinkElement>(
            'head link[rel=stylesheet]'
          );
          expect(linkEl!.getAttribute('href')).toBe(
            `../resources/${resourcePrefix}/tooltipster/dist/css/tooltipster.bundle.min.css`
          );
          expect(linkEl!.href).toBe(
            `http://example.com/api/zacynthius/resources/${resourcePrefix}/tooltipster/dist/css/tooltipster.bundle.min.css`
          );
          const scriptEl = doc.querySelector<HTMLScriptElement>('head script');
          expect(scriptEl!.getAttribute('src')).toBe(
            `../resources/${resourcePrefix}/jquery-3.3.1.min.js`
          );
          expect(scriptEl!.src).toBe(
            `http://example.com/api/zacynthius/resources/${resourcePrefix}/jquery-3.3.1.min.js`
          );
        }
      );
    });

    describe('tei', () => {
      test('requests with the same start and end page are normalised by redirecting to the URL without end', async () => {
        const response = await request(app).get(
          '/tei/diplomatic/internal/MS-FOO-01234-00001/i1/i1'
        );
        expect(response.status).toEqual(StatusCodes.MOVED_PERMANENTLY);
        expect(response.headers.location).toEqual(
          '/tei/diplomatic/internal/MS-FOO-01234-00001/i1'
        );
      });

      test.each(['css', 'eot', 'otf', 'woff', 'woff2', 'js', 'png', 'jpg'])(
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
          '/tei/diplomatic/internal/MS-FOO-01234-00001/i1',
          `${EXAMPLE_TEI_URL}html/data/tei/MS-FOO-01234-00001/MS-FOO-01234-00001-i1.html`,
          '../../../resources',
        ],
        [
          '/tei/diplomatic/internal/MS-FOO-01234-00001/i1/i2',
          `${EXAMPLE_TEI_URL}html/data/tei/MS-FOO-01234-00001/MS-FOO-01234-00001-i1-i2.html`,
          '../../../../resources',
        ],
      ])(
        'transcription HTML %s',
        async (_path, upstreamURL, baseResourceURL) => {
          mockGetResponder.mockResolvedValueOnce({
            status: 200,
            type: 'text/html',
            body: await promisify(fs.readFile)(
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
            url: `http://example.com/v1/transcription${_path}`,
          }).window.document;
          const linkEl = doc.querySelector<HTMLLinkElement>(
            'head link[rel=stylesheet]'
          );
          expect(linkEl!.getAttribute('href')).toBe(
            `${baseResourceURL}/cudl-resources/stylesheets/texts.css`
          );
          expect(linkEl!.href).toBe(
            'http://example.com/v1/transcription/tei/resources/cudl-resources/stylesheets/texts.css'
          );
        }
      );
    });

    test.each([
      ['overtext/tooltipster/dist/css/tooltipster.bundle.min.css', 'text/css'],
      ['jquery-3.3.1.min.js', 'application/javascript'],
    ])('transcription resource %s', async (_path, type) => {
      mockGetResponder.mockResolvedValueOnce({
        status: 200,
        type,
        body: 'blah',
        ok: true,
        serverError: false,
      });

      const response = await request(app).get(`/zacynthius/resources/${_path}`);
      expect(response.ok).toBeTruthy();
      expect(mocked(get)).toHaveBeenCalledTimes(1);
      expect(mocked(get)).toHaveBeenLastCalledWith(
        `${EXAMPLE_ZACYNTHIUS_URL}${_path}`
      );
    });
  });

  describe('XSLT transcriptions', () => {
    test.each<[string, Array<{node: string; content: string}>]>([
      [
        '/bezae/diplomatic/Bezae-Greek.xml/MS-NN-00002-00041/3v/3v',
        [
          {node: 'title', content: 'Codex Bezae Transcription'},
          {
            node: 'body .transcription-credit',
            content: 'Transcription by IGNTP',
          },
          {node: '#Matthew', content: 'παραλαβειν μαριαμ την γυναικα σου'},
        ],
      ],
    ])('endpoint %s responds with expected HTML', async (url, expectations) => {
      const response = await request(app).get(url);
      expect(response.ok).toBeTruthy();
      expect(response.type).toBe('text/html');

      const dom = new JSDOM(response.text);
      const doc = dom.window.document;

      for (const expectation of expectations) {
        expect(normaliseSpace(doc.querySelector(expectation.node))).toContain(
          expectation.content
        );
      }
    });

    test.each([
      [HTMLType.HTML, `${HTMLType.HTML},HTMLType.XHTML`],
      [HTMLType.XHTML, `${HTMLType.XHTML},HTMLType.HTML`],
    ])(
      'responds with %s from HTML endpoint when client accepts %j',
      async (expectedType, acceptedTypes) => {
        const response = await request(app)
          .get('/bezae/diplomatic/Bezae-Greek.xml/MS-NN-00002-00041/3v/3v')
          .accept(acceptedTypes);

        expect(response.ok).toBeTruthy();
        expect(response.type).toBe(expectedType);
      }
    );
  });

  describe('utilities', () => {
    test('rewriteHtmlResourceUrls()', () => {
      const html = `\
<!DOCTYPE html><html lang="en">
    <head>
        <title>Example</title>
        <link href="bar/thing1.css" rel="stylesheet">
        <link href="baz/thing2.css" rel="stylesheet">
        <link href="http://cdn.example.com/thing3.css" rel="stylesheet">
        <script src="bar/thing1.js"></script>
        <script src="baz/thing2.js"></script>
        <script src="http://cdn.example.com/thing3.js"></script>
    </head>
<body></body></html>`;
      const rewrite = jest.fn(options => {
        const prefix = 'http://example.com/foo/bar/';
        return options.url.startsWith(prefix)
          ? `http://other.example.com/${options.url.substr(prefix.length)}`
          : undefined;
      });
      const result = rewriteHtmlResourceUrls({
        html,
        baseUrl: 'http://example.com/foo/',
        rewrite,
      });

      expect(rewrite.mock.calls.map(call => call[0].url)).toEqual([
        'http://example.com/foo/bar/thing1.css',
        'http://example.com/foo/baz/thing2.css',
        'http://cdn.example.com/thing3.css',
        'http://example.com/foo/bar/thing1.js',
        'http://example.com/foo/baz/thing2.js',
        'http://cdn.example.com/thing3.js',
      ]);
      expect(result).toBe(`\
<!DOCTYPE html><html lang="en"><head>
        <title>Example</title>
        <link href="http://other.example.com/thing1.css" rel="stylesheet">
        <link href="baz/thing2.css" rel="stylesheet">
        <link href="http://cdn.example.com/thing3.css" rel="stylesheet">
        <script src="http://other.example.com/thing1.js"></script>
        <script src="baz/thing2.js"></script>
        <script src="http://cdn.example.com/thing3.js"></script>
    </head>
<body></body></html>`);
    });
  });
});
