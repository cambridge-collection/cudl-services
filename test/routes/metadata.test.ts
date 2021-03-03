import express from 'express';
import fs from 'fs';
import {StatusCodes} from 'http-status-codes';
import path from 'path';
import request from 'supertest';
import {promisify} from 'util';
import {
  DefaultMetadataResponse,
  MetadataError,
  MetadataProvider,
} from '../../src/metadata';

import {
  getRoutes,
  getRoutesV2,
  GetRoutesV2Options,
  MetadataResponseEmitter,
} from '../../src/routes/metadata';
import {TEST_DATA_PATH} from '../constants';

import {getTestDataMetadataRepository} from '../utils';
import {
  DomainNameMatcher,
  ExternalCorsRequestMatcher,
  requireNotUndefined,
} from '../../src/util';
import {mocked} from 'ts-jest/utils';
import {CUDLMetadataRepository} from '../../src/metadata/cudl';

function getTestApp(metadataRepository: CUDLMetadataRepository) {
  const app = express();
  app.use('/', getRoutes({metadataRepository}));
  return app;
}

describe('metadata routes /:format/:id', () => {
  let repo: CUDLMetadataRepository, app: express.Application;

  beforeEach(() => {
    repo = getTestDataMetadataRepository();
    app = getTestApp(repo);
  });

  test.each([
    ['MS-ADD-03959'],
    ['non-embeddable-item'],
    ['item-without-rights-statement'],
  ])('/json/%s reponds with JSON metadata', async id => {
    const response = await request(app).get(`/json/${id}`);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(response.body).toEqual(
      JSON.parse(
        await promisify(fs.readFile)(
          path.resolve(TEST_DATA_PATH, `metadata/json/${id}.json`),
          'utf-8'
        )
      )
    );
  });

  test('/json/:id forbids cross-origin requests for non-embeddable items', async () => {
    const response = await request(app)
      .get('/json/non-embeddable-item')
      .set('Origin', 'https://example.com');
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(response.body.error).toMatch(
      'This item is only available from cudl.lib.cam.ac.uk'
    );
  });

  test('/json/:id responds with 404 for missing ID', async () => {
    const response = await request(app).get('/json/MS-MISSING');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('/json/:id responds with 500 for invalid metadata', async () => {
    const response = await request(app).get('/json/INVALID');
    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  test.each([
    ['format', `/${encodeURIComponent('abc/def')}/foo`],
    ['id', `/foo/${encodeURIComponent('abc/def')}`],
  ])('%s param cannot contain slashes', async (param, url) => {
    const response = await request(app).get(url);
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('/:format/:id responds with 500 for invalid metadata when requesting non-json metadata', async () => {
    const response = await request(app).get('/tei/INVALID');
    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  test('/:format/:id responds with non-JSON metadata', async () => {
    const response = await request(app).get('/tei/MS-ADD-03959');
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.text).toEqual(
      await promisify(fs.readFile)(
        path.resolve(
          TEST_DATA_PATH,
          'metadata/data/tei/MS-ADD-03959/MS-ADD-03959.xml'
        ),
        'utf-8'
      )
    );
  });

  test('/:format/:id responds with 403 for non-json metadata without a rights statement', async () => {
    const response = await request(app).get(
      '/tei/item-without-rights-statement'
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(response.body.error).toBe(
      'Access not allowed to requested metadata'
    );
  });
});

describe('metadata routes v2 /:format/:id', () => {
  let options: GetRoutesV2Options;
  const metadataResponse = new DefaultMetadataResponse('example-id', () =>
    Promise.resolve(Buffer.from('data\n'))
  );
  beforeEach(() => {
    const isExternalCorsRequest = (jest.fn() as unknown) as ExternalCorsRequestMatcher;
    isExternalCorsRequest.internalDomainNameMatcher = {
      matches: jest.fn(),
      describeMatchingDomains: jest.fn(),
    };
    options = {
      metadataProviders: new Map<string, MetadataProvider>([
        ['example', {query: jest.fn()}],
      ]),
      isExternalEmbedPermitted: jest.fn(),
      isExternalAccessPermitted: jest.fn(),
      isExternalCorsRequest: isExternalCorsRequest,
      metadataEmitters: [],
    };
  });

  function getApp() {
    const app = express();
    app.use('/', getRoutesV2(options));
    return app;
  }

  describe('/:format/:id', () => {
    function expectCommonResponseAttributes(res: request.Response) {
      expect(res.get('Access-Control-Allow-Origin')).toEqual('*');
      expect(res.get('vary')).toEqual('Origin');
    }

    describe('successful metadata responses', () => {
      let provider: MetadataProvider;
      beforeEach(() => {
        provider = requireNotUndefined(
          options.metadataProviders.get('example')
        );
        mocked(provider.query).mockReturnValue(
          Promise.resolve(metadataResponse)
        );
      });

      test('responds with metadata', async () => {
        const res = await request(getApp()).get('/example/example-id');

        expect(mocked(provider.query).mock.calls).toEqual([['example-id']]);
        expect(res.ok).toBeTruthy();
        expect(res.type).toMatchInlineSnapshot('"text/plain"');
        expect(res.charset).toMatchInlineSnapshot('"utf-8"');
        expect(res.text).toMatchInlineSnapshot(`
                  "data
                  "
              `);
      });

      test('responds with metadata from first compatible MetadataResponseEmitter', async () => {
        const metadataResponseEmitterA: MetadataResponseEmitter = {
          canEmit: jest.fn().mockReturnValue(false),
          emit: jest.fn(),
        };
        const metadataResponseEmitterB: MetadataResponseEmitter = {
          canEmit: jest.fn(mdRes => mdRes === metadataResponse),
          emit: jest.fn(async (mdRes, res) => {
            res.contentType('x-example/type');
            res.send('emitter representation');
          }),
        };
        const metadataResponseEmitterC: MetadataResponseEmitter = {
          canEmit: jest.fn().mockReturnValue(false),
          emit: jest.fn(),
        };
        options.metadataEmitters = [
          metadataResponseEmitterA,
          metadataResponseEmitterB,
          metadataResponseEmitterC,
        ];

        const res = await request(getApp())
          .get('/example/example-id')
          .responseType('blob');

        // emitter B will be used
        expect(res.ok).toBeTruthy();
        expect(res.type).toMatchInlineSnapshot('"x-example/type"');
        expect(res.body).toEqual(Buffer.from('emitter representation'));

        expect(metadataResponseEmitterA.canEmit).toHaveBeenCalled();
        expect(metadataResponseEmitterA.emit).toBeCalledTimes(0);
        expect(metadataResponseEmitterB.canEmit).toHaveBeenCalled();
        expect(metadataResponseEmitterB.emit).toHaveBeenCalled();
        expect(metadataResponseEmitterC.canEmit).toBeCalledTimes(0);
        expect(metadataResponseEmitterC.emit).toBeCalledTimes(0);
      });
    });

    test('responds with BAD_REQUEST for unknown format', async () => {
      const response = await request(getApp()).get('/not-a-format/123');
      expectCommonResponseAttributes(response);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(response.type).toMatchInlineSnapshot('"application/json"');
      expect(response.charset).toMatchInlineSnapshot('"utf-8"');
      expect(response.body).toMatchInlineSnapshot(`
        Object {
          "error": "Bad format: not-a-format",
        }
      `);
    });

    test('responds with BAD_REQUEST invalid IDs', async () => {
      const response = await request(getApp()).get('/example/foo*bar');
      expectCommonResponseAttributes(response);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(response.type).toMatchInlineSnapshot('"application/json"');
      expect(response.charset).toMatchInlineSnapshot('"utf-8"');
      expect(response.body).toMatchInlineSnapshot(`
        Object {
          "error": "Bad id: foo*bar",
        }
      `);
    });

    describe('CORS access restriction', () => {
      beforeEach(() => {
        options.isExternalCorsRequest = ExternalCorsRequestMatcher({
          internalDomains: DomainNameMatcher('internal.domain'),
        });

        // Have the metadata provider return 3 possible metadata responses
        mocked(
          requireNotUndefined(options.metadataProviders.get('example')).query
        ).mockImplementation(async id => {
          if (
            id === 'non-embeddable' ||
            id === 'embeddable' ||
            id === 'no-embeddable-policy'
          ) {
            return new DefaultMetadataResponse(id, () =>
              Promise.resolve(Buffer.from(`${id} data\n`))
            );
          }
          throw new MetadataError(`id not found: ${id}`);
        });

        mocked(
          requireNotUndefined(options.isExternalEmbedPermitted)
        ).mockImplementation(async mdr =>
          new Map([
            ['non-embeddable', false],
            ['embeddable', true],
          ]).get(mdr.getId())
        );
      });

      test.each(['non-embeddable', 'embeddable', 'no-embeddable-policy'])(
        'CORS requests for any item from internal domains are not blocked',
        async id => {
          const response = await request(getApp())
            .get(`/example/${id}`)
            .set('Origin', 'https://internal.domain');
          expect(response.ok).toBeTruthy();
          expect(response.text).toEqual(`${id} data\n`);
        }
      );

      test.each(['non-embeddable', 'embeddable', 'no-embeddable-policy'])(
        'non-CORS requests for any item are not blocked',
        async id => {
          // note: no Origin header as this is not a CORS request
          const response = await request(getApp()).get(`/example/${id}`);
          expect(response.ok).toBeTruthy();
          expect(response.text).toEqual(`${id} data\n`);
        }
      );

      test.each(['non-embeddable', 'embeddable', 'no-embeddable-policy'])(
        'CORS requests for non-embeddable items from external domains are blocked',
        async id => {
          const response = await request(getApp())
            .get(`/example/${id}`)
            .set('Origin', 'https://external.domain');

          if (id === 'non-embeddable') {
            expect(response.status).toBe(StatusCodes.FORBIDDEN);
            expect(response.body).toMatchInlineSnapshot(`
              Object {
                "error": "This metadata is only available from [*.]internal.domain",
              }
            `);
          } else {
            expect(response.ok).toBeTruthy();
            expect(response.text).toEqual(`${id} data\n`);
          }
        }
      );
    });

    describe('isExternalAccessPermitted - general access restriction', () => {
      beforeEach(() => {
        mocked(
          requireNotUndefined(options.metadataProviders.get('example')).query
        ).mockImplementation(async id => {
          if (
            id === 'restricted' ||
            id === 'unrestricted' ||
            id === 'no-restriction-policy'
          ) {
            return new DefaultMetadataResponse(id, () =>
              Promise.resolve(Buffer.from(`${id} data\n`))
            );
          }
          throw new MetadataError(`id not found: ${id}`);
        });

        mocked(
          requireNotUndefined(options.isExternalAccessPermitted)
        ).mockImplementation(async mdr =>
          new Map([
            ['restricted', false],
            ['unrestricted', true],
          ]).get(mdr.getId())
        );
      });

      test('requests for restricted items are forbidden', async () => {
        const response = await request(getApp()).get('/example/restricted');

        expect(response.status).toBe(StatusCodes.FORBIDDEN);
      });

      test.each(['unrestricted', 'no-restriction-policy'])(
        'requests for explicitly and implicitly unrestricted items are allowed',
        async id => {
          const response = await request(getApp()).get(`/example/${id}`);

          expect(response.ok).toBeTruthy();
          expect(response.text).toEqual(`${id} data\n`);
        }
      );
    });
  });
});
