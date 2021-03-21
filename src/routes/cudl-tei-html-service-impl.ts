import express, {Request} from 'express';
import {ValueError} from '../errors';
import {StatusCodes} from 'http-status-codes';
import {relativeResolve} from '../uri';
import {URL} from 'url';
import {delegateToExternalHTML} from './transcription-impl';

export enum TeiHtmlServiceContent {
  TRANSCRIPTION = 'transcription',
  TRANSLATION = 'translation',
}

export function teiHtmlServicePathGenerator(type: TeiHtmlServiceContent) {
  const suffix = {
    [TeiHtmlServiceContent.TRANSLATION]: '-translation',
    [TeiHtmlServiceContent.TRANSCRIPTION]: '',
  }[type];

  return (req: Pick<Request, 'params'>) => {
    const {id, start} = req.params;
    if (!(id && start)) {
      throw new ValueError(
        `failed to generate TEI HTML service ${type} path: id and start params must be present`
      );
    }
    const end = req.params.end || start;
    const page = start === end ? start : `${start}-${end}`;
    return `html/data/tei/${id}/${id}-${page}${suffix}.html`;
  };
}

export function teiHtmlServiceHandler(
  type: TeiHtmlServiceContent,
  teiServiceURL: URL
): express.Handler {
  const pathBase = {
    [TeiHtmlServiceContent.TRANSLATION]: '/EN',
    [TeiHtmlServiceContent.TRANSCRIPTION]: '/diplomatic/internal',
  }[type];

  const router = express.Router();

  // Normalise TEI requests specifying :start and :end by dropping :end if it's the same as :start
  router.use(`/tei${pathBase}/:id/:start/:end$`, normaliseStartEndParameters);
  router.use(
    '/tei/',
    // we can't use one handler with an optional :end because the baseResourceURL is generated
    // from the pathPattern rather than the actual request URL, so the baseResourceURL would be
    // incorrect for requests without an :end.
    delegateToExternalHTML({
      pathPattern: `${pathBase}/:id/:start$`,
      externalBaseURL: teiServiceURL,
      externalPathGenerator: teiHtmlServicePathGenerator(type),
    }),
    delegateToExternalHTML({
      pathPattern: `${pathBase}/:id/:start/:end$`,
      externalBaseURL: teiServiceURL,
      externalPathGenerator: teiHtmlServicePathGenerator(type),
    })
  );

  return router;
}

export const normaliseStartEndParameters: express.Handler = (
  req,
  res,
  next
) => {
  const {start, end} = req.params;
  if (start === end) {
    res.redirect(
      StatusCodes.MOVED_PERMANENTLY,
      `${relativeResolve(req.baseUrl, `../${start}`)}`
    );
  } else {
    next();
  }
};
