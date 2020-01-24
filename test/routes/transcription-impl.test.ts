import { BAD_GATEWAY } from 'http-status-codes';
import { Response } from 'superagent';
import superagent from 'superagent';
import * as util from 'util';
import { ValueError } from '../../src/errors';
import { URLRewriter } from '../../src/html';
import {
  contentTypes,
  createDefaultResourceURLRewriter,
  createRestrictedTypeResponseHandler,
  createRewriteHTMLResourceURLsResponseHandler,
  defaultBaseResourceURL,
  ResponseData,
  TransformedResponse,
} from '../../src/routes/transcription-impl';
import { URL } from 'url';
import { validate } from '../../src/util';

describe('response handlers', () => {
  describe('HTML resource URL rewriting', () => {
    test.each<[Parameters<typeof createDefaultResourceURLRewriter>[0], string]>(
      [
        [undefined, 'resources/foo/css/foo.css'],
        [
          { baseResourceURL: '/foo/bar/resources/' },
          '/foo/bar/resources/foo/css/foo.css',
        ],
      ]
    )('createDefaultResourceURLRewriter(%s)', (createOptions, expected) => {
      const rewriterFn = createDefaultResourceURLRewriter(createOptions);
      expect(
        rewriterFn({
          baseURL: 'http://example.com/foo/bar',
          rawURL: 'css/foo.css',
          resolvedURL: 'http://example.com/foo/css/foo.css',
          relativeURL: 'css/foo.css',
        })
      ).toBe(expected);
    });

    test.each<[URLRewriter | undefined, string]>([
      [createDefaultResourceURLRewriter(), 'resources/foo/css/foo.css'],
      [
        createDefaultResourceURLRewriter({
          baseResourceURL: '/api/resources/',
        }),
        '/api/resources/foo/css/foo.css',
      ],
    ])(
      'createRewriteHTMLResourceURLsResponseHandler()',
      async (urlRewriter, rewrittenURL) => {
        const htmlTemplate = `<!DOCTYPE html><html><head><link href="%s" rel="stylesheet"></head><body></body></html>`;

        const handler = createRewriteHTMLResourceURLsResponseHandler(
          urlRewriter
        );
        const input: TransformedResponse<superagent.Response, ResponseData> = {
          originalRes: (undefined as unknown) as superagent.Response,
          currentRes: {
            url: new URL('http://example.com/foo/bar'),
            type: 'text/html',
            body: util.format(htmlTemplate, 'css/foo.css'),
            isError: false,
            status: 200,
          },
        };
        const result = await handler(input);
        validate(result !== undefined);
        const { currentRes: resultRes } = result;

        expect(resultRes).toEqual({
          ...input.currentRes,
          body: util.format(htmlTemplate, rewrittenURL),
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
          originalRes: (undefined as unknown) as Response,
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
          originalRes: (undefined as unknown) as Response,
          currentRes,
        })
      ).toEqual({
        originalRes: undefined,
        currentRes: {
          url: currentRes.url,
          type: 'text/html',
          status: BAD_GATEWAY,
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
