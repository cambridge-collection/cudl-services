import { ExecuteOptions, XSLTExecutor } from '@lib.cam/xslt-nailgun';
import { Request, Router } from 'express';

import { StatusCodes } from 'http-status-codes';

import { JSDOM } from 'jsdom';
import path from 'path';
import { URL } from 'url';
import { NotFoundError, UpstreamError } from '../errors';
import {
  CUDLFormat,
  CUDLMetadataRepository,
  LegacyDarwinFormat,
  LegacyDarwinMetadataRepository,
  MetadataRepository,
} from '../metadata';
import {
  applyLazyDefaults,
  requireRequestParam,
  requireRequestParams,
} from '../util';
import { delegateToExternalHTML } from './transcription-impl';
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
  legacyDarwinMetadataRepository: LegacyDarwinMetadataRepository;
  metadataRepository: CUDLMetadataRepository;
  router?: Router;
  xsltExecutor: XSLTExecutor;
  zacynthiusServiceURL: URL;
}) {
  const { router, zacynthiusServiceURL } = applyLazyDefaults(options, {
    router: () => Router(),
  });

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

  const transcriptions: Array<TranscriptionEndpoint<unknown>> = [
    tei,
    bezae,
    dcp,
    dcpfull,
  ];

  for (const trans of transcriptions) {
    attachTranscriptionHandler(
      router,
      trans.service,
      trans.path,
      trans.options
    );
  }

  router.use(
    '/newton/',
    delegateToExternalHTML({
      pathPattern: '/:type/external/:id/:start/:end',
      externalBaseURL: 'http://www.newtonproject.ox.ac.uk/',
      externalPathGenerator: req => {
        const options = requireRequestParams(req, 'id', 'start', 'end', 'type');
        return `view/texts/${options.type}/${encodeURIComponent(
          options.id
        )}?skin=minimal&show_header=no&start=${encodeURIComponent(
          options.start
        )}&end=${encodeURIComponent(options.end)}`;
      },
    })
  );

  router.use(
    '/dmp/',
    delegateToExternalHTML({
      pathPattern: '/diplomatic/external/:id',
      externalBaseURL: 'http://darwin.amnh.org/',
      externalPathGenerator: req =>
        `transcription-viewer.php?eid=${encodeURIComponent(
          extractIDTranscriptionOptions(req).id
        )}`,
    })
  );

  router.use(
    '/palimpsest/',
    delegateToExternalHTML({
      pathPattern: '/normalised/external/:id/:start/:end',
      externalBaseURL: 'http://cal-itsee.bham.ac.uk/',
      externalPathGenerator: req => {
        const opts = extractIDPagesTranscriptionOptions(req);
        if (opts.start !== opts.end) {
          throw new InvalidTranscriptionOptionsError(
            'Only single-page requests are supported'
          );
        }
        return `itseeweb/fedeli/${opts.id}/${opts.start}_${opts.id}.html`;
      },
    })
  );

  router.use(
    '/zacynthius/',
    delegateToExternalHTML({
      pathPattern: '/:type(overtext|undertext)/:page(\\w+)',
      externalBaseURL: zacynthiusServiceURL,
      externalPathGenerator: req =>
        `${req.params.type}/${req.params.page}.html`,
    })
  );

  return router;
}

function attachTranscriptionHandler<T>(
  router: Router,
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
        res.status(StatusCodes.BAD_REQUEST).json({ error: e.message });
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
        status = StatusCodes.NOT_FOUND;
        msg = 'Transcription not found';
      } else if (e instanceof UpstreamError) {
        status = StatusCodes.BAD_GATEWAY;
        msg = 'The external transcription provider is temporarily unavailable';
      } else {
        throw e;
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
