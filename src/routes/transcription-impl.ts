import express, {Request, RequestHandler, Response, Router} from 'express';
import expressAsyncHandler from 'express-async-handler';
import {PathParams} from 'express-serve-static-core';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';
import mime from 'mime';
import RelateURL from 'relateurl';
import superagent from 'superagent';
import {URL} from 'url';
import {ValueError} from '../errors';
import {
  ensureURL,
  isParent,
  negotiateHtmlResponseType,
  parseHTML,
  rewriteResourceURLs,
  URLRewriter,
} from '../html';
import {applyDefaults, applyLazyDefaults, validate} from '../util';
import {relativeResolve} from '../uri';
import Omit = jest.Omit;

const HTML_TYPE = mime.getType('html');
const XHTML_TYPE = mime.getType('xhtml');
validate(typeof HTML_TYPE === 'string');
validate(typeof XHTML_TYPE === 'string');
const HTML_MEDIA_TYPES = new Set([HTML_TYPE, XHTML_TYPE]);
export const DEFAULT_RESOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  'css',
  'eot',
  'otf',
  'svg',
  'woff',
  'woff2',
  'js',
  'ico',
]);

export function defaultBaseResourceURL(pathPattern: PathParams) {
  if (typeof pathPattern === 'string' && pathPattern.startsWith('/')) {
    let segments = 0;
    for (let i = 1; i < pathPattern.length; ++i) {
      if (pathPattern[i] === '/') {
        segments++;
      }
    }
    return `${new Array(segments).fill('../').join('')}resources/`;
  }

  throw new ValueError(
    `Unable to generate a default resource URL for pattern: ${pathPattern}`
  );
}

export function delegateToExternalHTML(options: {
  externalBaseURL: URL | string;
  pathPattern: PathParams;
  externalPathGenerator: (req: Request) => string | Promise<string>;
  baseResourceURL?: string;
  resourceExtensions?: Iterable<string>;
}): RequestHandler[] {
  const {
    externalBaseURL: _externalBaseURL,
    pathPattern,
    externalPathGenerator,
    resourceExtensions: _resourceExtensions,
    baseResourceURL,
  } = applyLazyDefaults(options, {
    resourceExtensions: () => DEFAULT_RESOURCE_EXTENSIONS,
    baseResourceURL: () => defaultBaseResourceURL(options.pathPattern),
  });

  const externalBaseURL = new URL(`${_externalBaseURL}`);
  const resourceExtensions = [..._resourceExtensions];
  if (!resourceExtensions.every(ext => /^[a-z0-9]+$/.test(ext))) {
    throw new ValueError(
      `Invalid resourceExtensions: ${resourceExtensions.join(', ')}`
    );
  }
  const resourceContentTypeWhitelist = contentTypes(..._resourceExtensions);
  const resourcePath = `/resources/:path(*.(${resourceExtensions.join('|')}))`;

  const htmlEndpoint = ExternalResourceDelegator.create({
    pathPattern,
    urlGenerator: async req =>
      new URL(await externalPathGenerator(req), externalBaseURL),
    responseHandler: [
      defaultErrorHandler,
      createRestrictedTypeResponseHandler({
        contentTypeWhitelist: HTML_MEDIA_TYPES,
      }),
      createRewriteHTMLResourceURLsResponseHandler(
        createDefaultResourceURLRewriter({
          upstreamRootURL: ensureURL(externalBaseURL),
          baseResourceURL,
        })
      ),
    ],
    responseTransmitter: htmlContentNegotiationResponseTransmitter,
  });

  const resourceEndpoint = ExternalResourceDelegator.create({
    pathPattern: resourcePath,
    urlGenerator: req => new URL(req.params.path, externalBaseURL),
    responseHandler: [
      defaultErrorHandler,
      createRestrictedTypeResponseHandler({
        contentTypeWhitelist: resourceContentTypeWhitelist,
      }),
    ],
  });

  return [htmlEndpoint.getHandler(), resourceEndpoint.getHandler()];
}

interface ExternalResourceDelegatorOptions<T> {
  pathPattern?: PathParams;
  urlGenerator: URLGenerator;
  responseHandler?: ResponseHandler<T> | Array<ResponseHandler<T>>;
  responseGenerator: ResponseGenerator<T>;
  responseTransmitter: ResponseTransmitter<T>;
}

type ExternalResourceDelegatorCreateOptions<T> = Omit<
  ExternalResourceDelegatorOptions<T>,
  'responseGenerator' | 'responseTransmitter'
> &
  Partial<
    Pick<
      ExternalResourceDelegatorOptions<T>,
      'responseGenerator' | 'responseTransmitter'
    >
  >;

export interface ResponseData {
  url: URL;
  status: number;
  type: string;
  body: Buffer | string;
  isError: boolean;
}

type URLGenerator = (req: Request) => URL | Promise<URL>;
type ResponseGenerator<T> = (url: URL) => T | Promise<T>;
type ResponseHandler<T> = (delegateData: T) => Promise<T | undefined>;
interface ResponseTransmitterOptions<T> {
  delegateData: Promise<T>;
  clientRequest: Request;
  clientResponse: Response;
}
interface ResponseTransmitter<T> {
  (options: ResponseTransmitterOptions<T>): Promise<void>;
}

export class ExternalResourceDelegator<T> {
  private readonly pathPattern: PathParams;
  private readonly urlGenerator: URLGenerator;
  private readonly responseGenerator: ResponseGenerator<T>;
  private readonly responseHandler: Array<ResponseHandler<T>>;
  private readonly responseTransmitter: ResponseTransmitter<T>;

  static readonly DEFAULT_PATH_PATTERN = '/:path(*)';

  constructor(options: ExternalResourceDelegatorOptions<T>) {
    const defaultOptions = applyDefaults(options, {
      pathPattern: ExternalResourceDelegator.DEFAULT_PATH_PATTERN,
      responseHandler: [],
    });
    this.pathPattern = defaultOptions.pathPattern;
    this.urlGenerator = defaultOptions.urlGenerator;
    this.responseGenerator = defaultOptions.responseGenerator;
    this.responseHandler = Array.isArray(defaultOptions.responseHandler)
      ? Array.from(defaultOptions.responseHandler)
      : [defaultOptions.responseHandler];
    this.responseTransmitter = defaultOptions.responseTransmitter;
  }

  static create(
    options: ExternalResourceDelegatorCreateOptions<
      TransformedResponse<superagent.Response, ResponseData>
    >
  ): ExternalResourceDelegator<
    TransformedResponse<superagent.Response, ResponseData>
  > {
    return new ExternalResourceDelegator<
      TransformedResponse<superagent.Response, ResponseData>
    >({
      pathPattern: options.pathPattern,
      responseHandler: options.responseHandler || [],
      urlGenerator: options.urlGenerator,
      responseGenerator:
        options.responseGenerator ||
        superagentResponseGenerator(defaultSuperagentResponseDataGenerator),
      responseTransmitter:
        options.responseTransmitter || defaultSuperagentResponseTransmitter,
    });
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    const url = await this.urlGenerator(req);
    try {
      let delegatedResponse = await this.responseGenerator(url);
      for (const handler of this.responseHandler) {
        const nextResponse = await handler(delegatedResponse);
        if (nextResponse !== undefined) {
          delegatedResponse = nextResponse;
        }
      }
      await this.responseTransmitter({
        delegateData: Promise.resolve(delegatedResponse),
        clientRequest: req,
        clientResponse: res,
      });
    } catch (e) {
      await this.responseTransmitter({
        delegateData: Promise.reject(e),
        clientRequest: req,
        clientResponse: res,
      });
    }
  }

  registerHandler(router: Router): void {
    router.get(
      this.pathPattern,
      expressAsyncHandler(this.handleRequest.bind(this))
    );
  }

  getHandler(): RequestHandler {
    const router = Router();
    this.registerHandler(router);
    return router;
  }
}

export interface TransformedResponse<A, B> {
  originalRes: A;
  currentRes: B;
}

type ResponseDataGenerator<A, B> = (
  url: URL,
  delegateHttpResponse: A
) => B | Promise<B>;

export function superagentResponseGenerator<T>(
  responseDataGenerator: ResponseDataGenerator<superagent.Response, T>
): ResponseGenerator<TransformedResponse<superagent.Response, T>> {
  return async (url: URL) => {
    const delegatedHTTPResponse = await superagent
      .get(url.toString())
      .buffer(true)
      .parse(superagent.parse['application/octet-stream']);
    return {
      originalRes: delegatedHTTPResponse,
      currentRes: await responseDataGenerator(url, delegatedHTTPResponse),
    };
  };
}

function defaultSuperagentResponseDataGenerator(
  url: URL,
  delegateHTTPResponse: superagent.Response
): ResponseData {
  return {
    url,
    status: delegateHTTPResponse.status,
    type: delegateHTTPResponse.type,
    body: delegateHTTPResponse.body as Buffer,
    isError: false,
  };
}

const defaultSuperagentResponseTransmitter: ResponseTransmitter<
  TransformedResponse<superagent.Response, ResponseData>
> = async ({delegateData, clientResponse}) => {
  const {status, type, body} = (await delegateData).currentRes;
  clientResponse.status(status).type(type).send(body);
};

const htmlContentNegotiationResponseTransmitter: ResponseTransmitter<
  TransformedResponse<superagent.Response, ResponseData>
> = async ({delegateData, clientRequest, clientResponse}) => {
  const {status, type, body} = (await delegateData).currentRes;
  if (!HTML_MEDIA_TYPES.has(type)) {
    clientResponse.status(status).type(type).send(body);
  } else {
    const {html, contentType} = negotiateHtmlResponseType(clientRequest)(
      body.toString()
    );
    clientResponse.status(status).type(contentType).send(html);
  }
};

type DefaultResponseHandler = ResponseHandler<
  TransformedResponse<superagent.Response, ResponseData>
>;

export const defaultErrorHandler: ResponseHandler<
  TransformedResponse<superagent.Response, ResponseData>
> = async ({originalRes, currentRes}) => {
  let newStatus;
  if (originalRes.status === StatusCodes.NOT_FOUND) {
    newStatus = StatusCodes.NOT_FOUND;
  } else if (originalRes.serverError) {
    newStatus = StatusCodes.BAD_GATEWAY;
  }

  if (newStatus !== undefined) {
    return {
      originalRes,
      currentRes: {
        url: currentRes.url,
        status: newStatus,
        type: 'text/html',
        body: getReasonPhrase(newStatus),
        isError: true,
      },
    };
  }
  return {originalRes, currentRes};
};

function ignoreErrorResponses(
  responseHandler: DefaultResponseHandler
): DefaultResponseHandler {
  return async ({originalRes, currentRes}) => {
    if (currentRes.isError) {
      return;
    }
    return responseHandler({originalRes, currentRes});
  };
}

export function createRewriteHTMLResourceURLsResponseHandler(
  urlRewriter?: URLRewriter
): DefaultResponseHandler {
  const _urlRewriter = urlRewriter || createDefaultResourceURLRewriter();

  return ignoreErrorResponses(async ({originalRes, currentRes}) => {
    if (!HTML_MEDIA_TYPES.has(currentRes.type)) {
      throw new Error('currentRes is not an HTML response');
    }

    const dom = parseHTML({
      html: currentRes.body,
      contentType: currentRes.type,
      url: currentRes.url,
    });
    rewriteResourceURLs(dom.window.document, _urlRewriter);

    return {
      originalRes,
      currentRes: {
        ...currentRes,
        body: dom.serialize(),
      },
    };
  });
}

export function* contentTypes(...extensions: string[]): Iterable<string> {
  for (const extension of extensions) {
    const type = mime.getType(extension);
    if (typeof type !== 'string') {
      throw new ValueError(
        `content-type not known for extension: ${extension}`
      );
    }
    yield type;
  }
}

export function createRestrictedTypeResponseHandler(options: {
  contentTypeWhitelist: Iterable<string>;
}): DefaultResponseHandler {
  const permittedTypes = new Set(options.contentTypeWhitelist);
  return ignoreErrorResponses(async ({originalRes, currentRes}) => {
    if (!permittedTypes.has(currentRes.type)) {
      return {
        originalRes,
        currentRes: {
          url: currentRes.url,
          status: StatusCodes.BAD_GATEWAY,
          type: 'text/html',
          body: `${getReasonPhrase(
            StatusCodes.BAD_GATEWAY
          )}: Unexpected response from upstream server`,
          isError: true,
        },
      };
    }
    return undefined;
  });
}

export function createDefaultResourceURLRewriter(options?: {
  upstreamRootURL?: URL;
  baseResourceURL?: string;
}): URLRewriter {
  const {baseResourceURL} = applyDefaults(
    {baseResourceURL: options?.baseResourceURL},
    {
      baseResourceURL: 'resources/',
    }
  );
  return ({baseURL, resolvedURL}) => {
    if (
      options?.upstreamRootURL &&
      !isParent(options.upstreamRootURL, baseURL)
    ) {
      throw new ValueError('upstreamRootURL is not a parent of baseURL');
    }
    const upstreamRoot = options?.upstreamRootURL
      ? String(options?.upstreamRootURL)
      : new URL(resolvedURL).origin;

    if (!isParent(upstreamRoot, resolvedURL)) {
      return undefined;
    }

    const rootRelativeResourceURL = RelateURL.relate(
      upstreamRoot,
      resolvedURL,
      {output: RelateURL.PATH_RELATIVE}
    );
    return relativeResolve(baseResourceURL, rootRelativeResourceURL);
  };
}

export const overrideAcceptHeaderFromQueryParameterMiddleware: express.Handler = (
  req,
  res,
  next
) => {
  const overriddenAccept = req.query['Accept'];
  if (typeof overriddenAccept === 'string') {
    req.headers.accept = overriddenAccept;
  }
  next();
};
