import express from 'express';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

import xml2js from 'xml2js';
import {Collection, GetItemCollections} from '../../src/collections';
import {using} from '../../src/resources';

import {getRoutes} from '../../src/routes/membership';
import {MemoryCollectionsDAO, MemoryDatabasePool} from '../utils';

function getTestApp(getItemCollections: GetItemCollections) {
  const app = express();
  app.use('/', getRoutes({getItemCollections}));
  return app;
}

describe('membership routes', () => {
  const itemCollections: {[itemID: string]: Collection[]} = {
    foo: [],
    bar: [
      {
        title: 'Things A',
        collectionOrder: 42,
        collectionID: 'things-a',
      },
    ],
    baz: [
      {
        title: 'Things A',
        collectionOrder: 42,
        collectionID: 'things-a',
      },
      {
        title: 'Things B',
        collectionOrder: 43,
        collectionID: 'things-b',
      },
    ],
  };
  const daoPool = MemoryDatabasePool.createPooledDAO(
    MemoryCollectionsDAO,
    itemCollections
  );

  let getItemCollections: jest.Mock<Promise<Collection[]>, [string]>;
  let app: express.Application;

  beforeEach(() => {
    getItemCollections = jest.fn(async (itemID: string) =>
      using(daoPool.getInstance(), db => db.getItemCollections(itemID))
    );
    app = getTestApp(getItemCollections);
  });

  describe('/collections/:id', () => {
    test.each([['missing'], ['foo'], ['bar'], ['baz']])(
      "responds with XML generated from item's collections",
      async id => {
        const response = await request(app).get(`/collections/${id}`);

        expect(getItemCollections.mock.calls).toEqual([[id]]);

        // no 404 for missing items, just 0 collections returned...
        expect(response.status).toBe(StatusCodes.OK);
        expect(response.get('content-type')).toBe('text/xml; charset=utf-8');

        const parsedResponse = await xml2js.parseStringPromise(response.text, {
          emptyTag: null,
        });

        const expectedResponse = {
          collections: itemCollections?.[id]?.length
            ? {
                collection: itemCollections[id].map(c => ({
                  title: [c.title],
                  collectionid: [c.collectionID],
                  collectionorder: [`${c.collectionOrder}`],
                })),
              }
            : null,
        };

        expect(parsedResponse).toEqual(expectedResponse);
      }
    );
  });
});
