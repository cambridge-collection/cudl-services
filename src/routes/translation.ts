import express, {Request} from 'express';
import {applyLazyDefaults} from '../util';
import {delegateToExternalHTML} from './transcription-impl';
import {URL} from 'url';
import {ValueError} from '../errors';
import {
  TeiHtmlServiceContent,
  teiHtmlServiceHandler,
} from './cudl-tei-html-service-impl';

export interface GetRoutesOptions {
  router?: express.Router;
  teiServiceURL: URL;
  zacynthiusServiceURL: URL;
}

export function getRoutes(options: GetRoutesOptions): express.Handler {
  const {router, teiServiceURL, zacynthiusServiceURL} = applyLazyDefaults(
    options,
    {
      router: () => express.Router(),
    }
  );

  router.use(
    teiHtmlServiceHandler(TeiHtmlServiceContent.TRANSLATION, teiServiceURL)
  );

  router.use(
    '/zacynthius/',
    delegateToExternalHTML({
      pathPattern: '/:page(\\w+)',
      externalBaseURL: zacynthiusServiceURL,
      externalPathGenerator: req => `translation/${req.params.page}.html`,
    })
  );

  return router;
}

export function teiTranslationPathGenerator(req: Pick<Request, 'params'>) {
  const {id, start, end} = req.params;
  if (!(id && start && end)) {
    throw new ValueError(
      'failed to generate TEI translation path: id, start and end params must be present'
    );
  }
  const page = start === end ? start : `${start}-${end}`;
  return `html/data/tei/${id}/${id}-${page}-translation.html`;
}
