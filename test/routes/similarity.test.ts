jest.mock('../../src/routes/similarity-impl');

import express from 'express';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';
import {mocked} from 'ts-jest/utils';
import {CUDLMetadataRepository} from '../../src/metadata';
import {getRoutes} from '../../src/routes/similarity';
import {
  embedMetadata,
  mapToJson,
  MetadataEmbedLevel,
} from '../../src/routes/similarity-impl';
import {XTF} from '../../src/xtf';

describe('similarity routes /:itemid/:similarityId', () => {
  let metadataRepository: CUDLMetadataRepository;
  let xtf: XTF;

  function getTestApp() {
    const app = express();
    app.use('/', getRoutes({metadataRepository, xtf}));
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    metadataRepository = {
      getJSON: jest.fn(),
      getBytes: jest.fn(),
      getPath: jest.fn(),
    };
    xtf = {
      getSimilarItems: jest.fn(),
      search: jest.fn(),
    };
  });

  test('invalid embedMeta results in BAD REQUEST', async () => {
    const response = await request(getTestApp()).get('/MS-FOO/0?embedMeta=foo');
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(response.body).toEqual({
      error: 'Invalid embedMeta: available values are full, partial, none',
    });
  });

  test('XTF error results in BAD GATEWAY', async () => {
    mocked(xtf).getSimilarItems.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const response = await request(getTestApp()).get('/MS-FOO/0');
    expect(response.status).toBe(StatusCodes.BAD_GATEWAY);
    expect(response.body).toEqual({error: 'Unable to get response from XTF'});
  });

  test.each<[string, number | undefined, MetadataEmbedLevel]>([
    ['?count=10&embedMeta=partial', 10, MetadataEmbedLevel.PARTIAL],
    ['?count=10&embedMeta=full', 10, MetadataEmbedLevel.FULL],
    ['?count=10&embedMeta=none', 10, MetadataEmbedLevel.NONE],
    ['', undefined, MetadataEmbedLevel.NONE],
  ])(
    'responds with hits from XTF with meta attached',
    async (query, count, embedLevel) => {
      mocked(xtf).getSimilarItems.mockResolvedValueOnce(
        ('<example/>' as unknown) as ReturnType<XTF['getSimilarItems']>
      );
      mocked(mapToJson).mockReturnValueOnce(({
        example: 'a',
      } as unknown) as ReturnType<typeof mapToJson>);
      mocked(embedMetadata).mockResolvedValueOnce(({
        example: 'b',
      } as unknown) as ReturnType<typeof embedMetadata>);

      const response = await request(getTestApp()).get(`/MS-FOO/0${query}`);

      expect(response.ok).toBeTruthy();
      expect(response.body).toEqual({example: 'b'});

      expect(xtf.getSimilarItems).toHaveBeenCalledWith('MS-FOO', '0', count);
      expect(mapToJson).toHaveBeenCalledWith('<example/>');
      expect(embedMetadata).toHaveBeenCalledWith(
        {example: 'a'},
        embedLevel,
        metadataRepository
      );
    }
  );
});
