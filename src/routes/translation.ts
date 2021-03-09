import {XSLTExecutor} from '@lib.cam/xslt-nailgun';
import express, {Request, Response} from 'express';
import expressAsyncHandler from 'express-async-handler';
import {StatusCodes} from 'http-status-codes';
import * as path from 'path';
import util from 'util';
import {applyLazyDefaults, isSimplePathSegment} from '../util';
import {delegateToExternalHTML} from './transcription-impl';
import {URL} from 'url';
import {CUDLFormat, CUDLMetadataRepository} from '../metadata/cudl';
import {ErrorCategories, isTagged} from '../errors';

export function getRoutes(options: {
  router?: express.Router;
  metadataRepository: CUDLMetadataRepository;
  xsltExecutor: XSLTExecutor;
  zacynthiusServiceURL: URL;
}) {
  const {
    router,
    metadataRepository,
    xsltExecutor,
    zacynthiusServiceURL,
  } = applyLazyDefaults(options, {
    router: () => express.Router(),
  });
  // Currently the format and language are always tei and EN
  router.get(
    '/tei/EN/:id/:from/:to',
    createTeiTranslationHandler(metadataRepository, xsltExecutor)
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

const PAGE_EXTRACT_XSL = path.resolve(
  __dirname,
  '../../transforms/transcriptions/pageExtract.xsl'
);
const TEI_XSL = path.resolve(
  __dirname,
  '../../transforms/transcriptions/msTeiTrans.xsl'
);

function createTeiTranslationHandler(
  metadataRepository: CUDLMetadataRepository,
  xsltExecutor: XSLTExecutor
) {
  return expressAsyncHandler(async (req: Request, res: Response) => {
    for (const prop of ['id', 'from', 'to']) {
      if (!isSimplePathSegment(req.params[prop])) {
        res.status(StatusCodes.BAD_REQUEST).json({
          error: util.format(`Bad ${prop}: ${req.params[prop]}`),
        });
        return;
      }
    }

    let teiXml: Buffer;
    try {
      teiXml = await metadataRepository.getBytes(CUDLFormat.TEI, req.params.id);
    } catch (e) {
      if (isTagged(e) && new Set(e.tags).has(ErrorCategories.NotFound)) {
        res.status(StatusCodes.NOT_FOUND).json({
          error: `ID does not exist: ${req.params.id}`,
        });
        return;
      }
      throw e;
    }

    const pages = await extractTeiPageRange({
      xsltExecutor,
      teiXml,
      start: req.params.from,
      end: req.params.to,
    });
    const html = await xsltExecutor.execute({
      xsltPath: TEI_XSL,
      xml: pages,
    });

    res.type('html').end(html);
  });
}

async function extractTeiPageRange(options: {
  xsltExecutor: XSLTExecutor;
  teiXml: string | Buffer;
  start: string;
  end: string;
  type?: string;
}): Promise<Buffer> {
  return options.xsltExecutor.execute({
    xsltPath: PAGE_EXTRACT_XSL,
    xml: options.teiXml,
    parameters: {
      start: options.start,
      end: options.end,
      ...(options.type === undefined ? {} : {type: options.type}),
    },
  });
}
