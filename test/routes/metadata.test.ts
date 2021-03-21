import express from 'express';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';
import {
  DefaultMetadataResponse,
  MetadataError,
  MetadataProvider,
} from '../../src/metadata';

import {
  getRoutes,
  GetRoutesOptions,
  MetadataResponseEmitter,
} from '../../src/routes/metadata';
import {
  DomainNameMatcher,
  ExternalCorsRequestMatcher,
  requireNotUndefined,
} from '../../src/util';
import {mocked} from 'ts-jest/utils';
import {ErrorCategories} from '../../src/errors';

describe('metadata routes /:format/:id', () => {
  let options: GetRoutesOptions;
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
    app.use('/', getRoutes(options));
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

    test('responds with NOT_FOUND when MetadataProvider throws an error tagged with NotFound', async () => {
      mocked(
        requireNotUndefined(options.metadataProviders.get('example')).query
      ).mockRejectedValue(
        new MetadataError({tags: [ErrorCategories.NotFound]})
      );

      const response = await request(getApp()).get('/example/123');

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(response.body).toMatchSnapshot();
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
