import { XSLTExecutor } from '@lib.cam/xslt-nailgun';
import { ExecuteOptions } from '@lib.cam/xslt-nailgun/lib/_internals';
import express, { Request } from 'express';

import {
  BAD_GATEWAY,
  BAD_REQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
} from 'http-status-codes';

import { JSDOM } from 'jsdom';
import path from 'path';
import superagent from 'superagent';
import * as URI from 'uri-js';
import { NotFoundError, UpstreamError } from '../errors';
import {
  CUDLFormat,
  CUDLMetadataRepository,
  LegacyDarwinFormat,
  LegacyDarwinMetadataRepository,
  MetadataRepository,
} from '../metadata';
import { requireRequestParam, requireRequestParams } from '../util';
import expressAsyncHandler = require('express-async-handler');

interface TranscriptionEndpoint<T> {
  path: string;
  service: TranscriptionService<T>;
  options: (req: Request) => T;
}

type XSLTOptions<T, F> = T & { id: string; format: F };

function xsltTranscriptionEndpoint<Fmt extends string, Opt>(options: {
  path: string;
  metadataRepository: MetadataRepository<Fmt>;
  xsltExecutor: XSLTExecutor;
  transforms: Array<TransformStage<XSLTOptions<Opt, Fmt>>>;
  options: (req: Request) => XSLTOptions<Opt, Fmt>;
}): TranscriptionEndpoint<XSLTOptions<Opt, Fmt>> {
  return {
    options: options.options,
    path: options.path,
    service: new XSLTTranscriptionService<XSLTOptions<Opt, Fmt>>({
      metadataRepository: options.metadataRepository,
      transforms: options.transforms,
      xsltExecutor: options.xsltExecutor,
    }),
  };
}

export function getRoutes(options: {
  router?: express.Router;
  metadataRepository: CUDLMetadataRepository;
  legacyDarwinMetadataRepository: LegacyDarwinMetadataRepository;
  xsltExecutor: XSLTExecutor;
}) {
  const router = options.router || express.Router();

  const tei = xsltTranscriptionEndpoint<
    CUDLFormat,
    IDPagesTranscriptionOptions
  >({
    path: '/tei/diplomatic/internal/:id/:start/:end',
    xsltExecutor: options.xsltExecutor,
    metadataRepository: options.metadataRepository,
    transforms: [
      {
        xsltPath: PAGE_EXTRACT_XSLT,
        params: options => ({ start: options.start, end: options.end }),
      },
      { xsltPath: MS_TEI_TRANS_XSLT },
    ],
    options: req => ({
      ...extractIDPagesTranscriptionOptions(req),
      format: CUDLFormat.TEI,
    }),
  });

  const bezae = xsltTranscriptionEndpoint<
    CUDLFormat,
    IDPagesTranscriptionOptions
  >({
    path: '/bezae/diplomatic/:idB/:idA/:start/:end',
    xsltExecutor: options.xsltExecutor,
    metadataRepository: options.metadataRepository,
    transforms: [
      {
        xsltPath: PAGE_EXTRACT_XSLT,
        params: options => ({ start: options.start, end: options.end }),
      },
      { xsltPath: BEZAE_TRANS_XSLT },
    ],
    options: req => {
      return {
        id: `${requireRequestParam(req, 'idA')}/${requireRequestParam(
          req,
          'idB'
        )}`,
        ...requireRequestParams(req, 'start', 'end'),
        format: CUDLFormat.TRANSCRIPTION,
      };
    },
  });

  const dcp = xsltTranscriptionEndpoint({
    path: '/dcp/diplomatic/internal/:id',
    xsltExecutor: options.xsltExecutor,
    metadataRepository: options.metadataRepository,
    transforms: [{ xsltPath: LEGACY_DCP_XSLT }],
    options: req => ({
      ...extractIDTranscriptionOptions(req),
      format: CUDLFormat.DCP,
    }),
  });

  const dcpfull = xsltTranscriptionEndpoint({
    path: '/dcpfull/diplomatic/internal/:id',
    metadataRepository: options.legacyDarwinMetadataRepository,
    xsltExecutor: options.xsltExecutor,
    transforms: [{ xsltPath: LEGACY_DCP_XSLT }],
    options: req => ({
      ...extractIDTranscriptionOptions(req),
      format: LegacyDarwinFormat.DEFAULT,
    }),
  });

  const newton = {
    path: '/newton/:type/external/:id/:start/:end',
    service: new NewtonProjectTranscriptionService({
      baseUrl: 'http://www.newtonproject.ox.ac.uk/',
      baseResourceUrl: '/v1/resources/www.newtonproject.ox.ac.uk/',
    }),
    options: extractTranscriptionOptions,
  };

  const darwinManuscripts = {
    path: '/dmp/diplomatic/external/:id',
    service: new DarwinManuscriptsTranscriptionService({
      baseUrl: 'http://darwin.amnh.org/',
    }),
    options: extractIDTranscriptionOptions,
  };

  const itseet: TranscriptionEndpoint<IDPageTranscriptionOptions> = {
    path: '/palimpsest/normalised/external/:id/:start/:end',
    service: new ITSEETranscriptionService({
      baseUrl: 'http://cal-itsee.bham.ac.uk/',
    }),
    options: req => {
      const opts = extractIDPagesTranscriptionOptions(req);
      if (opts.start !== opts.end) {
        throw new InvalidTranscriptionOptionsError(
          'Only single-page requests are supported'
        );
      }
      return { id: opts.id, page: opts.start };
    },
  };

  const transcriptions: Array<TranscriptionEndpoint<unknown>> = [
    tei,
    bezae,
    dcp,
    dcpfull,
    newton,
    darwinManuscripts,
    itseet,
  ];

  for (const trans of transcriptions) {
    attachTranscriptionHandler(
      router,
      trans.service,
      trans.path,
      trans.options
    );
  }

  return router;
}

function attachTranscriptionHandler<T>(
  router: express.Router,
  transcriptionService: TranscriptionService<T>,
  path: string,
  extractOptions: (req: Request) => T
) {
  router.get(
    path,
    createTranscriptionHandler(transcriptionService, extractOptions)
  );
}

class InvalidTranscriptionOptionsError extends Error {}

function createTranscriptionHandler<T>(
  transcriptionService: TranscriptionService<T>,
  extractOptions: (req: Request) => T
) {
  return expressAsyncHandler(async (req, res) => {
    let options: T;
    try {
      options = extractOptions(req);
    } catch (e) {
      if (e instanceof InvalidTranscriptionOptionsError) {
        res.status(BAD_REQUEST).json({ error: e.message });
      }
      throw e;
    }

    try {
      const html = await transcriptionService.getTranscription(options);
      res.type('html').end(html);
      return;
    } catch (e) {
      let status, msg;
      if (e instanceof NotFoundError) {
        status = NOT_FOUND;
        msg = 'Transcription not found';
      } else if (e instanceof UpstreamError) {
        status = BAD_GATEWAY;
        msg = 'The external transcription provider is temporarily unavailable';
      } else {
        status = INTERNAL_SERVER_ERROR;
        msg = 'Something went wrong';
      }

      res.status(status).json({ error: msg });
      return;
    }
  });
}

interface IDTranscriptionOptions {
  id: string;
}

function extractIDTranscriptionOptions(req: Request): IDTranscriptionOptions {
  return requireRequestParams(req, 'id');
}

interface IDPageTranscriptionOptions extends IDTranscriptionOptions {
  id: string;
  page: string;
}

interface IDPagesTranscriptionOptions extends IDTranscriptionOptions {
  start: string;
  end: string;
}

function extractIDPagesTranscriptionOptions(
  req: Request
): IDPagesTranscriptionOptions {
  return requireRequestParams(req, 'id', 'start', 'end');
}

interface TranscriptionOptions extends IDPagesTranscriptionOptions {
  type: string;
}

function extractTranscriptionOptions(req: Request): TranscriptionOptions {
  return requireRequestParams(req, 'id', 'start', 'end', 'type');
}

interface TranscriptionService<Params> {
  getTranscription(options: Params): Promise<string>;
}

interface HTML {
  html: string;
  baseUrl: string;
}

export type HttpGet = typeof superagent.get;

export abstract class HttpTranscriptionService<Params>
  implements TranscriptionService<Params> {
  protected readonly baseUrl: URI.URIComponents;
  protected readonly httpGet: HttpGet;

  constructor(options: { baseUrl: string; httpGet?: HttpGet }) {
    this.baseUrl = URI.parse(options.baseUrl);
    this.httpGet = options.httpGet || superagent.get;
  }

  protected getUrl(options: Params) {
    return URI.serialize(
      URI.resolveComponents(this.baseUrl, this.getRelativeUrl(options))
    );
  }

  protected abstract getRelativeUrl(options: Params): URI.URIComponents;

  protected async getExternalTranscription(options: Params): Promise<HTML> {
    const url = this.getUrl(options);
    const resp = await this.httpGet(url);

    if (resp.ok) {
      return { html: resp.text, baseUrl: url };
    }
    const msg = `External transcription provider responded with HTTP ${resp.status}: ${url}`;
    const errClass =
      resp.status === 404
        ? NotFoundError
        : resp.serverError
        ? UpstreamError
        : Error;
    throw new errClass(msg);
  }

  protected filterTranscriptionHtml(html: HTML): string {
    return html.html;
  }

  async getTranscription(options: Params) {
    const html = await this.getExternalTranscription(options);
    return this.filterTranscriptionHtml(html);
  }
}

export class NewtonProjectTranscriptionService extends HttpTranscriptionService<
  TranscriptionOptions
> {
  private readonly baseResourceUrl: URI.URIComponents;

  constructor(options: {
    baseUrl: string;
    baseResourceUrl: string;
    httpGet?: HttpGet;
  }) {
    super(options);
    this.baseResourceUrl = URI.parse(options.baseResourceUrl);
  }

  protected getRelativeUrl(options: TranscriptionOptions) {
    return {
      path: `/view/texts/${options.type}/${encodeURIComponent(options.id)}`,
      query: `skin=minimal&show_header=no&start=${encodeURIComponent(
        options.start
      )}&end=${encodeURIComponent(options.end)}`,
    };
  }

  protected filterTranscriptionHtml(html: HTML) {
    return rewriteHtmlResourceUrls({
      ...html,
      rewrite: options => {
        const resource = URI.parse(options.url);
        if (
          URI.equal(httpOrigin(this.baseUrl), httpOrigin(resource)) &&
          resource.path?.startsWith('/resources/')
        ) {
          return URI.serialize(
            URI.resolveComponents(this.baseResourceUrl, {
              path: resource.path?.substr('/resources/'.length),
            })
          );
        }
      },
    });
  }
}

export class DarwinManuscriptsTranscriptionService extends HttpTranscriptionService<
  IDTranscriptionOptions
> {
  protected getRelativeUrl(options: TranscriptionOptions): URI.URIComponents {
    return {
      path: 'transcription-viewer.php',
      query: `eid=${encodeURIComponent(options.id)}`,
    };
  }
}

export class ITSEETranscriptionService extends HttpTranscriptionService<
  IDPageTranscriptionOptions
> {
  protected getRelativeUrl(
    options: IDPageTranscriptionOptions
  ): URI.URIComponents {
    const id = encodeURIComponent(options.id);
    const page = encodeURIComponent(options.page);
    return {
      path: `/itseeweb/fedeli/${id}/${page}_${id}.html`,
    };
  }
}

function httpOrigin(url: URI.URIComponents) {
  return URI.serialize({
    ...url,
    path: undefined,
    query: undefined,
    fragment: undefined,
  });
}

type ElementWithHref = Element & { href: string };
type ElementWithSrc = Element & { src: string };

function isElementWithHref(el: Element): el is ElementWithHref {
  const maybeElementWithHref = el as Partial<ElementWithHref>;
  return typeof maybeElementWithHref.href === 'string';
}

function isElementWithSrc(el: Element): el is ElementWithSrc {
  const maybeElementWithSrc = el as Partial<ElementWithSrc>;
  return typeof maybeElementWithSrc.src === 'string';
}

type UrlRewriterOptions = { url: string } & (
  | { srcEl: ElementWithSrc }
  | { hrefEl: ElementWithHref }
);
export type UrlRewriter = (options: UrlRewriterOptions) => string | undefined;

export function rewriteHtmlResourceUrls(options: {
  html: string;
  baseUrl: string | URL;
  rewrite: UrlRewriter | UrlRewriter[];
}): string {
  const dom = new JSDOM(options.html, { url: String(options.baseUrl) });
  const doc = dom.window.document;
  const urlRewriters = Array.isArray(options.rewrite)
    ? options.rewrite
    : [options.rewrite];

  doc.querySelectorAll('*[href], *[src]').forEach(el => {
    let rwOptions: UrlRewriterOptions | undefined = undefined;

    if (isElementWithHref(el)) {
      rwOptions = { url: el.href, hrefEl: el };
    } else if (isElementWithSrc(el)) {
      rwOptions = { url: el.src, srcEl: el };
    }

    if (!rwOptions) {
      return;
    }

    const _rwOptions = rwOptions;
    urlRewriters.forEach(rewriter => {
      const url = rewriter(_rwOptions);
      if (url === undefined) {
        return;
      }

      if (isElementWithHref(el)) {
        el.href = url;
      } else if (isElementWithSrc(el)) {
        el.src = url;
      }
    });
  });

  return dom.serialize();
}

const TRANSFORMS_DIR = path.resolve(__dirname, '../../transforms');
const PAGE_EXTRACT_XSLT = path.resolve(
  TRANSFORMS_DIR,
  'transcriptions/pageExtract.xsl'
);
const MS_TEI_TRANS_XSLT = path.resolve(
  TRANSFORMS_DIR,
  'transcriptions/msTeiTrans.xsl'
);
const BEZAE_TRANS_XSLT = path.resolve(
  TRANSFORMS_DIR,
  'transcriptions/bezaeHTML.xsl'
);
const LEGACY_DCP_XSLT = path.resolve(
  TRANSFORMS_DIR,
  'transcriptions/dcpTrans.xsl'
);

interface TransformStage<Opt> {
  xsltPath: string;
  params?: (options: Opt) => ExecuteOptions['parameters'];
}

class XSLTTranscriptionService<
  Opt extends { id: string; format: Fmt },
  Fmt extends string = string
> implements TranscriptionService<Opt> {
  protected readonly metadataRepository: MetadataRepository<Fmt>;
  protected readonly xsltExecutor: XSLTExecutor;
  protected readonly transforms: Array<TransformStage<Opt>>;

  constructor(options: {
    metadataRepository: MetadataRepository<Fmt>;
    xsltExecutor: XSLTExecutor;
    transforms: Array<TransformStage<Opt>>;
  }) {
    this.metadataRepository = options.metadataRepository;
    this.xsltExecutor = options.xsltExecutor;
    this.transforms = options.transforms;
  }

  async getTranscription(options: Opt): Promise<string> {
    let xml = await this.metadataRepository.getBytes(
      options.format,
      options.id
    );

    for (const tx of this.transforms) {
      xml = await this.xsltExecutor.execute({
        xsltPath: tx.xsltPath,
        xml,
        parameters: tx.params === undefined ? undefined : tx.params(options),
      });
    }

    return xml.toString('utf-8');
  }
}
