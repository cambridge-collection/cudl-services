import jsdom from 'jsdom';
import RelateUrl from 'relateurl';
import {URL} from 'url';

import util from 'util';

import parse5 from 'parse5';
import xmlserializer from 'xmlserializer';
import express from 'express';
import accepts from 'accepts';
import assert from 'assert';

export function parseHTML(options: {
  html: string | Buffer;
  contentType?: string;
  url?: URL | string;
}): jsdom.JSDOM {
  const {html, contentType, url} = options;
  return new jsdom.JSDOM(html, {
    contentType,
    url: url === undefined ? undefined : ensureURL(url).toString(),
  });
}

export function serialiseXhtml(html: string): string {
  const htmlDom = parse5.parse(html, {scriptingEnabled: false});
  return xmlserializer.serializeToString(htmlDom);
}

export enum HTMLType {
  HTML = 'text/html',
  XHTML = 'application/xhtml+xml',
}
export interface NegotiatedHtmlType {
  html: string;
  contentType: HTMLType;
}
export interface NegotiatedHtmlTypeBridge {
  (html: string): NegotiatedHtmlType;
}
function isHTMLType(value: unknown): value is HTMLType {
  return value === HTMLType.HTML || value === HTMLType.XHTML;
}

/**
 * Get a function that converts from HTML to either XHTML or HTML based on a request's Accept
 * header.
 *
 * The default is to maintain the input HTML as the output HTML, XHTML is only used if specifically
 * accepted with higher preference than HTML.
 *
 * @param req The request to content-negotiate with.
 * @return the conversion function
 */
export function negotiateHtmlResponseType(
  req: express.Request
): NegotiatedHtmlTypeBridge {
  const accept = accepts(req);
  const acceptedType = accept.type([HTMLType.HTML, HTMLType.XHTML]);
  const negotiatedType = acceptedType === false ? HTMLType.HTML : acceptedType;
  assert(
    isHTMLType(negotiatedType),
    `HTML type content negotiation resulted in unexpected accepted type: ${util.inspect(
      acceptedType
    )}`
  );

  if (negotiatedType === HTMLType.HTML) {
    return html => ({html, contentType: HTMLType.HTML});
  } else {
    return html => ({html: serialiseXhtml(html), contentType: HTMLType.XHTML});
  }
}

export type URLRewriter = (options: {
  rawURL: string;
  resolvedURL: string;
  baseURL: string;
  relativeURL?: string;
}) => string | undefined;

export function ensureURL(url: string | URL): URL {
  return typeof url === 'string' ? new URL(url) : url;
}

export function isSameOrigin(urlA: string | URL, urlB: string | URL) {
  return ensureURL(urlA).origin === ensureURL(urlB).origin;
}

export function isParent(parent: string | URL, child: string | URL) {
  parent = ensureURL(parent);
  child = ensureURL(child);

  if (!isSameOrigin(parent, child)) {
    return false;
  }
  const parentPath = parent.pathname.split('/');
  if (parentPath[parentPath.length - 1] === '') {
    parentPath.pop();
  }
  const childPath = child.pathname.split('/');
  return (
    parentPath.length <= childPath.length &&
    parentPath.every((seg, i) => seg === childPath[i])
  );
}

/**
 * Rewrite URLs in href and src attributes of elements in the document <head>.
 */
export function rewriteResourceURLs(doc: Document, rewriter: URLRewriter) {
  const baseURL = doc.URL;
  for (const el of Array.from(
    doc.querySelectorAll('head [href], body [href], head [src], body [src]')
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
        let relativeURL: {} | {relativeURL: string} = {};
        if (isSameOrigin(baseURL, resolvedURL)) {
          relativeURL = {relativeURL: RelateUrl.relate(baseURL, resolvedURL)};
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
