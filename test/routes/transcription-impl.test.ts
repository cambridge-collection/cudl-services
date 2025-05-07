import {StatusCodes} from 'http-status-codes';
import superagent, {Response} from 'superagent';
import * as util from 'util';
import {ValueError} from '../../src/errors';
import {HTMLType, URLRewriter} from '../../src/html';
import {
  contentTypes,
  createDefaultResourceURLRewriter,
  createRestrictedTypeResponseHandler,
  createRewriteHTMLResourceURLsResponseHandler,
  defaultBaseResourceURL,
  delegateToExternalHTML,
  overrideAcceptHeaderFromQueryParameterMiddleware,
  ResponseData,
  TransformedResponse,
} from '../../src/routes/transcription-impl';
import {URL} from 'url';
import {validate} from '../../src/util';
import express from 'express';
import request from 'supertest';
import {mockGetResponder} from '../mocking/superagent-mocking';

describe('response handlers', () => {
  describe('HTML resource URL rewriting', () => {
    test.each<[Parameters<typeof createDefaultResourceURLRewriter>[0], string]>(
      [
        [undefined, 'resources/things/css/foo.css'],
        [
          {baseResourceURL: '/a/b/resources/'},
          '/a/b/resources/things/css/foo.css',
        ],
        [
          {
            baseResourceURL: '/a/b/resources/',
            upstreamRootURL: new URL('http://example.com/'),
          },
          '/a/b/resources/things/css/foo.css',
        ],
        [
          {
            baseResourceURL: '/a/b/resources/',
            upstreamRootURL: new URL('http://example.com/things/'),
          },
          '/a/b/resources/css/foo.css',
        ],
      ]
    )('createDefaultResourceURLRewriter(%s)', (createOptions, expected) => {
      const rewriterFn = createDefaultResourceURLRewriter(createOptions);
      expect(
        rewriterFn({
          baseURL: 'http://example.com/things/foo/bar',
          rawURL: '../css/foo.css',
          resolvedURL: 'http://example.com/things/css/foo.css',
          relativeURL: '../css/foo.css',
          context: {elementName: 'link', attribute: 'href'},
        })
      ).toBe(expected);
    });

    test.each<[URLRewriter | undefined, ...string[]]>([
      [
        createDefaultResourceURLRewriter(),
        'resources/example-things/css/foo.css',
        'resources/example-things/images/img.png',
        'resources/example-things/js/bar.js',
      ],
      [
        createDefaultResourceURLRewriter({
          baseResourceURL: '/api/resources/',
        }),
        '/api/resources/example-things/css/foo.css',
        '/api/resources/example-things/images/img.png',
        '/api/resources/example-things/js/bar.js',
      ],
    ])(
      'createRewriteHTMLResourceURLsResponseHandler()',
      async (urlRewriter, ...rewrittenUrls) => {
        const htmlTemplate =
          '<!DOCTYPE html><html>' +
          '<head><link href="%s" rel="stylesheet"></head>' +
          '<body><a href="foo#bar">foo</a><img src="%s"><script src="%s"></script></body>' +
          '</html>';

        const handler =
          createRewriteHTMLResourceURLsResponseHandler(urlRewriter);
        const input: TransformedResponse<superagent.Response, ResponseData> = {
          originalRes: undefined as unknown as superagent.Response,
          currentRes: {
            url: new URL('http://example.com/example-things/bar'),
            type: 'text/html',
            body: util.format(
              htmlTemplate,
              'css/foo.css',
              'images/img.png',
              'js/bar.js'
            ),
            isError: false,
            status: 200,
          },
        };
        const result = await handler(input);
        validate(result !== undefined);
        const {currentRes: resultRes} = result;

        expect(resultRes).toEqual({
          ...input.currentRes,
          body: util.format(htmlTemplate, ...rewrittenUrls),
        });
      }
    );
  });

  describe('createRestrictedTypeResponseHandler()', () => {
    test('does not modify responses with whitelisted contentType', async () => {
      const currentRes: ResponseData = {
        url: new URL('http://example.com/'),
        type: 'text/html',
        status: 200,
        body: 'foo',
        isError: false,
      };

      expect(
        await createRestrictedTypeResponseHandler({
          contentTypeWhitelist: ['text/html'],
        })({
          originalRes: undefined as unknown as Response,
          currentRes,
        })
      ).toBe(undefined);
    });

    test('rejects responses without whitelisted contentType', async () => {
      const currentRes: ResponseData = {
        url: new URL('http://example.com/'),
        type: 'text/html',
        status: 200,
        body: 'foo',
        isError: false,
      };

      expect(
        await createRestrictedTypeResponseHandler({
          contentTypeWhitelist: ['text/css'],
        })({
          originalRes: undefined as unknown as Response,
          currentRes,
        })
      ).toEqual({
        originalRes: undefined,
        currentRes: {
          url: currentRes.url,
          type: 'text/html',
          status: StatusCodes.BAD_GATEWAY,
          body: 'Bad Gateway: Unexpected response from upstream server',
          isError: true,
        },
      });
    });

    test('contentTypes()', () => {
      expect(Array.from(contentTypes('html', '.html', 'css', '.css'))).toEqual([
        'text/html',
        'text/html',
        'text/css',
        'text/css',
      ]);
    });
  });

  test('defaultBaseResourceURL()', () => {
    expect(defaultBaseResourceURL('/foo')).toEqual('resources/');
    expect(defaultBaseResourceURL('/foo/bar')).toEqual('../resources/');
    expect(defaultBaseResourceURL('/foo/bar/baz')).toEqual('../../resources/');
    expect(() => defaultBaseResourceURL('asfd')).toThrow(ValueError);
    expect(() => defaultBaseResourceURL(/sdf/)).toThrow(ValueError);
  });
});

describe('overrideAcceptHeaderFromQueryParameterMiddleware', () => {
  const app = express();
  app.get('/', overrideAcceptHeaderFromQueryParameterMiddleware, (req, res) => {
    res.send(req.headers.accept);
  });

  test('accept header is used when not overridden', async () => {
    const res = await request(app).get('/').accept('text/plain');
    expect(res.text).toEqual('text/plain');
  });

  test('accept header is ignored when overridden', async () => {
    const res = await request(app)
      .get('/')
      .accept('x-weird/foo')
      .query('Accept=text/plain,application/octet-stream');
    expect(res.text).toEqual('text/plain,application/octet-stream');
  });

  test('accept override query param is case sensitive', async () => {
    const res = await request(app)
      .get('/')
      .accept('x-weird/foo')
      .query('accept=text/plain,application/octet-stream');
    expect(res.text).toEqual('x-weird/foo');
  });
});

describe('delegateToExternalHTML', () => {
  describe('HTML/XHTML content negotiation', () => {
    test.each([
      [HTMLType.HTML, `${HTMLType.HTML},HTMLType.XHTML`],
      [HTMLType.XHTML, `${HTMLType.XHTML},HTMLType.HTML`],
    ])(
      'responds with %s from HTML endpoint when client accepts %j',
      async (expectedType, acceptedTypes) => {
        const app = express();
        app.get(
          '/',
          delegateToExternalHTML({
            externalPathGenerator: () => '/',
            externalBaseURL: 'http://example.com/',
            pathPattern: '/',
          })
        );

        const html =
          '<html><head><title></title><meta property="foo" content=""></head><body></body></html>';
        mockGetResponder.mockResolvedValueOnce({
          status: 200,
          type: 'text/html',
          text: html,
          body: Buffer.from(html, 'utf8'),
          ok: true,
          serverError: false,
        });

        const res = await request(app).get('/').accept(acceptedTypes);
        expect(res.type).toEqual(expectedType);
        if (expectedType === HTMLType.HTML) {
          expect(res.text).toEqual(html);
        } else {
          // XHTML
          expect(res.text).toMatchInlineSnapshot(
            '"<html xmlns=\\"http://www.w3.org/1999/xhtml\\"><head><title/><meta property=\\"foo\\" content=\\"\\"/></head><body/></html>"'
          );
        }
      }
    );
  });
});
