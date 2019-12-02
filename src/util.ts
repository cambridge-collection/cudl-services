import express from 'express';
import url from 'url';
import escapeStringRegexp from 'escape-string-regexp';

const CUDL_HOST = 'cudl.lib.cam.ac.uk';
const CUDL_HOST_REGEX = new RegExp(
  '(?:^|\\.)' + escapeStringRegexp(CUDL_HOST) + '$'
);

export const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
});

export function isExternalCorsRequest(req: express.Request) {
  const origin = req.header('origin');
  if (!origin) {
    return false;
  }

  const host = url.parse(origin).hostname;

  // If we have an origin header and it's not cudl, then it's an external cors
  // request.
  return typeof host === 'string' && !CUDL_HOST_REGEX.test(host);
}

export function isSimplePathSegment(value: string): boolean {
  return /^[\w-]+$/.test(value);
}
