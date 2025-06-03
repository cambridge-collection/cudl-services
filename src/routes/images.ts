// @ts-nocheck
import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import {CORS_HEADERS, isEnumMember, requireRequestParam} from '../util';

interface IIIFManifest {
  sequences?: { canvases?: any[] }[];
  attribution?: string;
}
interface MetadataJson {
  descriptiveMetadata?: {
    downloadImageRights?: string;
    watermarkStatement?: string;
  }[];
}

let cachedAuthHeader: string | null = null;

async function getBasicAuthHeader(credentials: string): Promise<string> {
  const auth = Buffer.from(credentials).toString('base64');
  cachedAuthHeader = `Basic ${auth}`;
  return cachedAuthHeader;
}

export function getRoutes(iiifBaseURL: string, iiifBaseURLCredentials: string, cudlBaseURL: string, cudlBaseURLCredentials: string): express.Router {
  const router = express.Router();

  router.get('/download/:itemId/:pageId', async (req, res) => {
    const { itemId, pageId } = req.params;
    const { width, height } = req.query;

    try {
      const iiifAuthHeader = await getBasicAuthHeader(iiifBaseURLCredentials);

      // Fetch IIIF manifest (with Basic Auth)
      const manifestUrl = `${iiifBaseURL}/${itemId}`;
      console.log("manifestUrl: " + manifestUrl);
      const manifestRes = await fetch(manifestUrl, {
        headers: { Authorization: iiifAuthHeader }
      });
      if (!manifestRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch IIIF manifest' });
      }

      const manifest = (await manifestRes.json()) as IIIFManifest;
      const index = parseInt(pageId, 10);

      if (isNaN(index) || index < 1) {
        return res.status(400).json({ error: 'Invalid page number. Must be a positive integer.' });
      }

      const canvas = manifest?.sequences?.[0]?.canvases?.[index - 1];
      if (!canvas) {
        return res.status(404).json({ error: 'Page not found' });
      }

      const serviceId = canvas?.images?.[0]?.resource?.service?.['@id'];
      if (!serviceId) {
        return res.status(500).json({ error: 'No image service found' });
      }

      // Fetch CUDL metadata (with Basic Auth)
      const cudlAuthHeader = await getBasicAuthHeader(cudlBaseURLCredentials);

      const metadataUrl = cudlBaseURL + `/view/${itemId}.json`;
      const metadataRes = await fetch(metadataUrl, {
        headers: { Authorization: cudlAuthHeader }
      });
      const metadataJson = (await metadataRes.json()) as MetadataJson;
      const attribution =
        metadataJson?.descriptiveMetadata?.[0]?.watermarkStatement ||
        'Contact UL for Download Image rights.';

      // Fetch IIIF image
      const size = width || height ? `${width || ''},${height || ''}` : 'full';
      const iiifImageUrl = `${serviceId}/full/${size}/0/default.jpg`;
      const imageRes = await fetch(iiifImageUrl);
      if (!imageRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch IIIF image' });
      }

      const imageBuffer = await imageRes.buffer();
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const imgWidth = metadata.width || 1024;

      const fontSize = Math.min(20, Math.round(imgWidth * 0.015));
      const charWidth = fontSize * 0.6;
      const charsPerLine = Math.floor(imgWidth / charWidth);

      const wrapText = (text: string, maxCharsPerLine: number): string[] => {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';
        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length > maxCharsPerLine) {
            lines.push(currentLine.trim());
            currentLine = word;
          } else {
            currentLine += ' ' + word;
          }
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        return lines;
      };

      const safeText = attribution
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const wrappedLines = wrapText(safeText, charsPerLine);
      const lineHeight = fontSize + 4;
      const totalTextHeight = wrappedLines.length * lineHeight;

      const svgLines = wrappedLines
        .map(
          (line, i) => `
        <tspan x="50%" dy="${i === 0 ? 0 : lineHeight}" dominant-baseline="middle">${line}</tspan>
      `
        )
        .join('');

      const svg = `
        <svg width="${imgWidth}" height="${totalTextHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text x="50%" y="${
        lineHeight / 2
      }" font-size="${fontSize}" fill="white" text-anchor="middle" font-family="sans-serif">
            ${svgLines}
          </text>
        </svg>
      `;

      const finalImageBuffer = await sharp({
        create: {
          width: imgWidth,
          height: metadata.height! + totalTextHeight,
          channels: 3,
          background: 'white',
        },
      })
        .composite([
          { input: imageBuffer, top: 0, left: 0 },
          { input: Buffer.from(svg), top: metadata.height!, left: 0 },
        ])
        .jpeg()
        .toBuffer();

      res.set(CORS_HEADERS);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Disposition', `attachment; filename="${itemId}_page${pageId}.jpg"`);
      res.send(finalImageBuffer);
    } catch (error) {
      console.error(`Error handling image request for ${itemId}/${pageId}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
