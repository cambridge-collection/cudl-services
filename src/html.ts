import jsdom from 'jsdom';
import RelateUrl from 'relateurl';
import { URL } from 'url';

export function parseHTML(options: {
  html: string | Buffer;
  contentType?: string;
  url?: URL | string;
}) {
  const { html, contentType, url } = options;
  return new jsdom.JSDOM(html, {
    contentType,
    url: url === undefined ? undefined : ensureURL(url).toString(),
  });
}

export type URLRewriter = (options: {
  rawURL: string;
  resolvedURL: string;
  baseURL: string;
  relativeURL?: string;
}) => string | undefined;

function ensureURL(url: string | URL): URL {
  return typeof url === 'string' ? new URL(url) : url;
}

export function isSameOrigin(urlA: string | URL, urlB: string | URL) {
  return ensureURL(urlA).origin === ensureURL(urlB).origin;
}

/**
 * Rewrite URLs in href and src attributes of elements in the document <head>.
 */
export function rewriteResourceURLs(doc: Document, rewriter: URLRewriter) {
  const baseURL = doc.URL;
  for (const el of Array.from(
    doc.querySelectorAll('head [href], head [src]')
  )) {
    for (const attrName of ['src', 'href']) {
      const rawURL = el.getAttribute(attrName);
      if (typeof rawURL === 'string') {
        const resolvedURL = ((el as unknown) as Record<string, unknown>)[
          attrName
        ];
        if (typeof resolvedURL !== 'string') {
          throw new Error(
            `HTML element has attribute ${attrName} but no corresponding property`
          );
        }
        let relativeURL: {} | { relativeURL: string } = {};
        if (isSameOrigin(baseURL, resolvedURL)) {
          relativeURL = { relativeURL: RelateUrl.relate(baseURL, resolvedURL) };
        }
        const newValue = rewriter({
          rawURL,
          resolvedURL,
          baseURL,
          ...relativeURL,
        });
        if (newValue !== undefined && newValue !== rawURL) {
          el.setAttribute(attrName, newValue);
        }
      }
    }
  }
}
