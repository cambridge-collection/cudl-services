import { XSLTExecutor } from '@lib.cam/xslt-nailgun';
import express, { Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import { BAD_REQUEST, NOT_FOUND } from 'http-status-codes';
import * as path from 'path';
import util, { promisify } from 'util';
import { CUDLFormat, CUDLMetadataRepository } from '../metadata';
import { isSimplePathSegment } from '../util';

export function getRoutes(options: {
  router?: express.Router;
  metadataRepository: CUDLMetadataRepository;
  xsltExecutor: XSLTExecutor;
}) {
  const router = options.router || express.Router();
  // Currently the format and language are always tei and EN
  router.get(
    '/tei/EN/:id/:from/:to',
    createTeiTranslationHandler(
      options.metadataRepository,
      options.xsltExecutor
    )
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
        res.status(BAD_REQUEST).json({
          error: util.format(`Bad ${prop}: ${req.params[prop]}`),
        });
        return;
      }
    }

    const teiPath = await metadataRepository.getPath(
      CUDLFormat.TEI,
      req.params.id
    );
    try {
      await promisify(fs.access)(teiPath);
    } catch (e) {
      res.status(NOT_FOUND).json({
        error: `ID does not exist: ${req.params.id}`,
      });
      return;
    }

    const pages = await extractTeiPageRange({
      xsltExecutor,
      teiPath,
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
  teiPath: string;
  start: string;
  end: string;
  type?: string;
}): Promise<Buffer> {
  return options.xsltExecutor.execute({
    xsltPath: PAGE_EXTRACT_XSL,
    xmlPath: options.teiPath,
    parameters: {
      start: options.start,
      end: options.end,
      ...(options.type === undefined ? {} : { type: options.type }),
    },
  });
}
