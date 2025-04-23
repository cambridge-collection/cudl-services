import express from 'express';
import fetch from 'node-fetch';

export function getRoutes(iiifBaseURL: string): express.Router {
  const router = express.Router();

  router.get('/download/:itemId/:pageId', async (req, res) => {
    const {itemId, pageId} = req.params;
    const {width, height} = req.query;

    try {
      const manifestUrl = `${iiifBaseURL}/${itemId}`;
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) {
        return res.status(502).json({error: 'Failed to fetch IIIF manifest'});
      }

      const manifest = await manifestRes.json();
      const index = parseInt(pageId, 10);
      const canvas = manifest?.sequences?.[0]?.canvases?.[index];

      if (!canvas) {
        return res.status(404).json({error: 'Page not found'});
      }

      const serviceId = canvas?.images?.[0]?.resource?.service?.['@id'];
      if (!serviceId) {
        return res.status(500).json({error: 'No image service found'});
      }

      const size = width && height ? `${width},${height}` : 'full';
      const iiifImageUrl = `${serviceId}/full/${size}/0/default.jpg`;

      res.redirect(iiifImageUrl);
    } catch (error) {
      console.error(error);
      res.status(500).json({error: 'Internal server error'});
    }
  });

  return router;
}
