import assert from 'assert';
import Debugger from 'debug';
import express from 'express';
import proxy from 'express-http-proxy';
import { URL } from 'url';
import * as util from 'util';

import { CUDLMetadataRepository } from '../metadata';

const debug = Debugger('cudl-services:darwin');

const DEFAULT_TIMEOUT = 20 * 1000;

/**
 * This is a proxy for the Darwin Correspondence Project's XTF server. All it
 * does is authenticate requests. For some reason it was bundled into this
 * codebase.
 * FIXME: This has nothing to do with CUDL, extract it to somewhere else
 */
export function getRoutes(options: {
  router?: express.Router;
  darwinXtfUrl: string;
}) {
  const router = options.router || express.Router();
  router.use(proxyDarwinXtfRequestHandler(options.darwinXtfUrl));
  return router;
}

function proxyDarwinXtfRequestHandler(darwinXtfUrl: string) {
  let upstream: Upstream;
  try {
    upstream = parseUpstreamUrl(darwinXtfUrl);
  } catch (e) {
    throw new Error(
      `invalid darwin XTF URL ${util.inspect(darwinXtfUrl)}: ${e.message}`
    );
  }

  return proxy(upstream.origin, {
    timeout: DEFAULT_TIMEOUT,
    filter: req => req.method === 'GET',
    proxyReqPathResolver: req => {
      assert(req.url.startsWith('/'));
      assert(!upstream.pathPrefix.endsWith('/'));
      return `${upstream.pathPrefix}${req.url}`;
    },
  });
}

interface Upstream {
  /**
   * The scheme://host:port
   */
  origin: string;
  /**
   * The sub-path of the upstream to make requests under. Doesn't end in /.
   */
  pathPrefix: string;
}

function parseUpstreamUrl(url: string): Upstream {
  const parts = new URL(url);

  if (parts.username || parts.password || parts.hash || parts.search) {
    throw new Error(`\
a proxy destination URL must not contain username/password credentials, query \
parameters or a fragment`);
  }

  if (!/^https?:?$/.test(parts.protocol)) {
    throw new Error(`protocol must be http or https`);
  }

  return {
    origin: parts.origin,
    pathPrefix: parts.pathname.replace(/\/*$/g, ''),
  };
}
