import { XSLTExecutor } from '@lib.cam/xslt-nailgun';
import express from 'express';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import path from 'path';
import { get, Response } from 'superagent';
import request from 'supertest';
import { promisify } from 'util';
import {
  LegacyDarwinMetadataRepository,
  CUDLMetadataRepository,
} from '../../src/metadata';
import {
  getRoutes,
  NewtonProjectTranscriptionService,
  rewriteHtmlResourceUrls,
} from '../../src/routes/transcription';
import { TEST_DATA_PATH } from '../constants';
import {
  getTestDataMetadataRepository,
  getTestDataLegacyDarwinMetadataRepository,
  normaliseSpace,
  getTestXSLTExecutor,
} from '../utils';

type PartialResponse = Pick<Response, 'status' | 'text' | 'ok' | 'serverError'>;
let getMockGetResponse: ((url: string) => Promise<PartialResponse>) | undefined;

jest.mock('superagent', () => ({
  get: jest.fn(
    async (url: string): Promise<PartialResponse> => {
      if (getMockGetResponse === undefined) {
        throw new Error('mockGetResponse is undefined');
      }
      return getMockGetResponse(url);
    }
  ),
}));
const mockGet = get as jest.MockedFunction<typeof get>;

function getTestApp(
  metadataRepository: CUDLMetadataRepository,
  legacyDarwinMetadataRepository: LegacyDarwinMetadataRepository,
  xsltExecutor: XSLTExecutor
) {
  const app = express();
  app.use(
    '/',
    getRoutes({
      metadataRepository,
      legacyDarwinMetadataRepository,
      xsltExecutor,
    })
  );
  return app;
}

describe('transcription routes', () => {
  let app: express.Application | undefined;

  beforeEach(() => {
    app = getTestApp(
      getTestDataMetadataRepository(),
      getTestDataLegacyDarwinMetadataRepository(),
      getTestXSLTExecutor()
    );
  });

  afterEach(() => {
    getMockGetResponse = undefined;
  });

  describe('NewtonProjectTranscriptionService', () => {
    beforeEach(() => {
      mockGet.mockClear();
      getMockGetResponse = async (url: string) => {
        const type = /\/normalized\//.test(url) ? 'normalized' : 'diplomatic';
        return {
          status: 200,
          ok: true,
          serverError: false,
          text: await promisify(fs.readFile)(
            path.resolve(
              TEST_DATA_PATH,
              `transcriptions/newton_${type}_NATP00093.html`
            ),
            'utf-8'
          ),
        };
      };
    });

    test.each([
      ['diplomatic'],
      ['normalized'], // note: American spelling
    ])('gets %s transcription', async type => {
      const service = new NewtonProjectTranscriptionService({
        baseUrl: 'http://newton.example.com',
        baseResourceUrl: '/v1/resources/newton/',
        httpGet: mockGet,
      });

      const html = await service.getTranscription({
        type,
        id: 'foo',
        start: 'bar',
        end: 'baz',
      });
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      expect(mockGet.mock.calls).toEqual([
        [
          `http://newton.example.com/view/texts/${type}/foo?skin=minimal&show_header=no&start=bar&end=baz`,
        ],
      ]);
      expect(
        (doc.querySelector(
          'head link:nth-of-type(2)'
        ) as HTMLLinkElement | null)?.href
      ).toBe('/v1/resources/newton/css/texts-full.css');
    });
  });

  describe('external transcription services', () => {
    beforeEach(() => {
      mockGet.mockClear();
    });

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
        getMockGetResponse = async () => ({
          status: 200,
          text: html,
          ok: true,
          serverError: false,
        });

        const response = await request(app).get(apiPath);
        expect(response.ok).toBeTruthy();
        expect(mockGet.mock.calls).toEqual([[externalURL]]);
        expect(response.text).toBe(html);
      }
    );
  });

  describe('XSLT transcriptions', () => {
    test.each<[string, Array<{ node: string; content: string }>]>([
      [
        '/tei/diplomatic/internal/PR-08743-B-00013-00042/2/2',
        [
          { node: 'title', content: 'Folio 2' },
          {
            node: '.body p',
            content: 'Se alza Madrid potente con la brava Artilleria',
          },
        ],
      ],
      [
        '/bezae/diplomatic/Bezae-Greek.xml/MS-NN-00002-00041/3v/3v',
        [
          { node: 'title', content: 'Codex Bezae Transcription' },
          {
            node: 'body .transcription-credit',
            content: 'Transcription by IGNTP',
          },
          { node: '#Matthew', content: `παραλαβειν μαριαμ την γυναικα σου` },
        ],
      ],
      // requests often contain a trailing slash
      [
        '/dcp/diplomatic/internal/MS-DAR-00104-00247/',
        [
          { node: 'title', content: '818' },
          {
            node: '.transcription-credit',
            content: 'View letter on Darwin Correspondence Project site',
          },
          { node: 'body p', content: 'From J. D. Hooker' },
          { node: 'body p', content: '[22–30 January 1845]' },
        ],
      ],
      [
        '/dcp/diplomatic/internal/MS-DAR-00104-00247',
        [
          { node: 'title', content: '818' },
          {
            node: '.transcription-credit',
            content: 'View letter on Darwin Correspondence Project site',
          },
          { node: 'body p', content: 'From J. D. Hooker' },
          { node: 'body p', content: '[22–30 January 1845]' },
        ],
      ],
      [
        '/dcpfull/diplomatic/internal/1',
        [
          { node: 'title', content: '1' },
          {
            node: '.transcription-credit',
            content: 'View letter on Darwin Correspondence Project site',
          },
          {
            node: 'body',
            content:
              'I think you will not be able with all your Greek knowledge to read this precious Scrawl',
          },
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
