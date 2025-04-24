import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { createCanvas } from 'canvas';

export function getRoutes(iiifBaseURL: string): express.Router {
  const router = express.Router();

  router.get('/download/:itemId/:pageId', async (req, res) => {
    const { itemId, pageId } = req.params;
    const { width, height } = req.query;

    try {
      // Step 1: Fetch IIIF manifest
      const manifestUrl = `${iiifBaseURL}/${itemId}`;
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch IIIF manifest' });
      }

      const manifest = await manifestRes.json();
      const index = parseInt(pageId, 10);
      const canvas = manifest?.sequences?.[0]?.canvases?.[index];

      if (!canvas) {
        return res.status(404).json({ error: 'Page not found' });
      }

      const attribution = manifest.attribution || '';

      const serviceId = canvas?.images?.[0]?.resource?.service?.['@id'];
      if (!serviceId) {
        return res.status(500).json({ error: 'No image service found' });
      }

      const size = (width || height) ? `${width || ''},${height || ''}` : 'full';
      const iiifImageUrl = `${serviceId}/full/${size}/0/default.jpg`;

      // Step 2: Download the image
      const imageRes = await fetch(iiifImageUrl);
      if (!imageRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch IIIF image' });
      }
      const imageBuffer = await imageRes.buffer();

      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const imgWidth = metadata.width || 1024;
      const textHeight = 60;

      // Step 3: Create attribution text banner using canvas
      const canvasForText = createCanvas(imgWidth, textHeight);
      const ctx = canvasForText.getContext('2d');

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, imgWidth, textHeight);

      ctx.fillStyle = 'black';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(attribution, imgWidth / 2, textHeight / 2);

      const textBuffer = canvasForText.toBuffer();

      // Step 4: Combine image + text banner
      const finalImageBuffer = await sharp({
        create: {
          width: imgWidth,
          height: metadata.height! + textHeight,
          channels: 3,
          background: 'white',
        }
      })
        .composite([
          { input: imageBuffer, top: 0, left: 0 },
          { input: textBuffer, top: metadata.height!, left: 0 }
        ])
        .jpeg()
        .toBuffer();

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(finalImageBuffer);

    } catch (error) {
      console.error(`Error handling image request for ${itemId}/${pageId}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
