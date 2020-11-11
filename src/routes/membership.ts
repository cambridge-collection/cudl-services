import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import xmlbuilder from 'xmlbuilder';
import {Collection, GetItemCollections} from '../collections';

export function getRoutes(options: {
  router?: express.Router;
  getItemCollections: GetItemCollections;
}) {
  const router = options.router || express.Router();
  router.get(
    '/collections/:id',
    createItemCollectionsHandler(options.getItemCollections)
  );
  return router;
}

function createItemCollectionsHandler(getItemCollections: GetItemCollections) {
  return expressAsyncHandler(async (req, res) => {
    const itemCollections = await getItemCollections(req.params.id);

    res.set('Content-Type', 'text/xml');
    res.send(collectionsToXML(itemCollections));
  });
}

function collectionsToXML(collections: Collection[]): string {
  const xmlObj = {
    collections: {
      collection: collections.map(collectionToXMLObj),
    },
  };

  return xmlbuilder.create(xmlObj, {encoding: 'utf-8'}).end({pretty: true});
}

function collectionToXMLObj(collection: Collection) {
  return {
    title: {'#text': collection.title},
    collectionid: {'#text': collection.collectionID},
    collectionorder: {'#text': collection.collectionOrder},
  };
}
