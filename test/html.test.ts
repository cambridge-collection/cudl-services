import {mocked} from 'ts-jest/utils';
import {URL} from 'url';
import {
  ensureURL,
  HTMLType,
  isParent,
  isSameOrigin,
  NegotiatedHtmlType,
  negotiateHtmlResponseType,
  parseHTML,
  rewriteResourceURLs,
  serialiseXhtml,
  URLRewriter,
} from '../src/html';

import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

const html = `\
<!doctype html>
<html>
    <head>
        <script src="//other.example.com/js/foo.js"></script>
        <script src="/things/js/bar.js"></script>
        <script src="js/baz.js"></script>
        <link href="http://other.example.com/css/foo.css" rel="stylesheet" type="text/css">
        <link href="/things/css/bar.css" rel="stylesheet" type="text/css">
        <link href="css/baz.css" rel="stylesheet" type="text/css">
    </head>
</html>
`;

test.each<[string | URL, string | URL, boolean]>([
  ['http://foo.com/a', 'http://foo.com/b', true],
  [new URL('http://foo.com'), 'http://foo.com', true],
  ['http://foo.com', new URL('http://foo.com'), true],
  [new URL('http://foo.com'), new URL('http://foo.com'), true],
  ['http://foo.com:8080/a', 'http://foo.com:8080/b', true],
  ['http://foo.com/a', 'http://foo.com:8080/b', false],
  ['http://foo.com:80/a', 'http://foo.com/b', true],
  ['https://foo.com:443/a', 'https://foo.com/b', true],
])('isSameOrigin(%s, %s) === %s', (a, b, expected) => {
  expect(isSameOrigin(a, b)).toBe(expected);
});

test.each<[string | URL, string | URL, boolean]>([
  ['http://foo.com/', 'http://foo.com/', true],
  ['http://foo.com/', 'http://foo.com/?a=1', true],
  // query on parent is ignored
  ['http://foo.com/?a=2', 'http://foo.com/?a=1', true],
  ['http://foo.com/', 'http://foo.com/abc', true],
  ['http://foo.com/', 'http://foo.com/abc/def', true],
  ['http://foo.com/a', 'http://foo.com/a', true],
  ['http://foo.com/a', 'http://foo.com/ab', false],
  ['http://foo.com/a', 'http://foo.com/a/b', true],
  ['http://bar.com/a', 'http://foo.com/a', false],
])('isParent(%s, %s) === %s', (a, b, expected) => {
  expect(isParent(a, b)).toBe(expected);
});

test('ensureURL()', () => {
  const url = new URL('http://example/foo');
  expect(ensureURL(url)).toBe(url);
  expect(ensureURL(String(url))).toEqual(url);
});

describe('parseHTML()', () => {
  test('parseHTML()', () => {
    const dom = parseHTML({html});
    const doc = dom.window.document;
    expect(doc.querySelector('script')!.getAttribute('src')).toBe(
      '//other.example.com/js/foo.js'
    );
  });

  test('doc knows its URL', () => {
    const url = 'http://example.com/foo/bar';
    const dom = parseHTML({html, url});
    const doc = dom.window.document;
    expect(doc.URL).toBe(url);
    expect(
      (doc.querySelector('script:nth-of-type(3)') as
        | HTMLScriptElement
        | undefined)!.src
    ).toBe('http://example.com/foo/js/baz.js');
  });
});

describe('rewriteResourceURLs()', () => {
  test('rewriter is called for each src/href attr in <head>', () => {
    const url = 'http://example.com/things/foo';

    const rewriter: URLRewriter = jest.fn();

    const dom = parseHTML({html, url});
    rewriteResourceURLs(dom.window.document, rewriter);

    expect(mocked(rewriter).mock.calls).toEqual(
      [
        {
          baseURL: url,
          rawURL: '//other.example.com/js/foo.js',
          resolvedURL: 'http://other.example.com/js/foo.js',
        },
        {
          baseURL: url,
          rawURL: '/things/js/bar.js',
          resolvedURL: 'http://example.com/things/js/bar.js',
          relativeURL: 'js/bar.js',
        },
        {
          baseURL: url,
          rawURL: 'js/baz.js',
          resolvedURL: 'http://example.com/things/js/baz.js',
          relativeURL: 'js/baz.js',
        },
        {
          baseURL: url,
          rawURL: 'http://other.example.com/css/foo.css',
          resolvedURL: 'http://other.example.com/css/foo.css',
        },
        {
          baseURL: url,
          rawURL: '/things/css/bar.css',
          resolvedURL: 'http://example.com/things/css/bar.css',
          relativeURL: 'css/bar.css',
        },
        {
          baseURL: url,
          rawURL: 'css/baz.css',
          resolvedURL: 'http://example.com/things/css/baz.css',
          relativeURL: 'css/baz.css',
        },
      ].map(options => [options])
    );
  });

  test('url returned by rewriter is substituted in doc', () => {
    const url = 'http://example.com/things/foo';

    const dom = parseHTML({html, url});
    rewriteResourceURLs(dom.window.document, ({resolvedURL}) => {
      if (resolvedURL === 'http://example.com/things/js/bar.js') {
        return 'http://other.example.com/js/bar.js';
      }
    });

    expect(
      dom.window.document
        .querySelector<HTMLScriptElement>('script:nth-of-type(2)')!
        .getAttribute('src')
    ).toBe('http://other.example.com/js/bar.js');
    expect(
      dom.window.document.querySelector<HTMLScriptElement>(
        'script:nth-of-type(2)'
      )!.src
    ).toBe('http://other.example.com/js/bar.js');

    // Others are unchanged
    expect(
      dom.window.document
        .querySelector<HTMLScriptElement>('script:nth-of-type(3)')!
        .getAttribute('src')
    ).toBe('js/baz.js');
    expect(
      dom.window.document.querySelector<HTMLScriptElement>(
        'script:nth-of-type(3)'
      )!.src
    ).toBe('http://example.com/things/js/baz.js');
  });
});

describe('serialiseXHTML', () => {
  test.each([
    html,
    fs.readFileSync(path.join(__dirname, 'data/transcriptions/tei.html'), {
      encoding: 'utf-8',
    }),
  ])('returns expected XHTML for example %#', htmlString => {
    expect(serialiseXhtml(htmlString)).toMatchSnapshot();
  });
});

describe('negotiateHtmlResponseType', () => {
  const html =
    '<html><head><title>hi</title><link rel="manifest" href="/manifest.json"></head></html>';

  test.each([
    [HTMLType.HTML, 'text/html,application/xhtml+xml'],
    [HTMLType.XHTML, 'application/xhtml+xml,text/html'],
    [HTMLType.HTML, 'text/plain'],
    [HTMLType.HTML, ''],
  ])(
    'returns conversion to %s when accepting %j',
    async (expectedType, accept) => {
      const app = express();
      let conversionResult: NegotiatedHtmlType | undefined;
      app.get('/', (req, res) => {
        const htmlTypeBridge = negotiateHtmlResponseType(req);
        conversionResult = htmlTypeBridge(html);
        res.end();
      });
      await request(app).get('/').accept(accept);

      expect(conversionResult?.contentType).toEqual(expectedType);
      if (expectedType === HTMLType.HTML) {
        expect(conversionResult?.html).toEqual(html);
      } else {
        // XHTML conversion
        expect(conversionResult?.html).toMatchInlineSnapshot(
          '"<html xmlns=\\"http://www.w3.org/1999/xhtml\\"><head><title>hi</title><link rel=\\"manifest\\" href=\\"/manifest.json\\"/></head><body/></html>"'
        );
      }
    }
  );
});
