import { Readable } from 'node:stream';

import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from 'express';

import { ObjectStorageService } from '../lib/objectStorage';
import { requireAuth } from '../middlewares/require-auth';

const router: IRouter = Router();

const objectStorageService = new ObjectStorageService();

router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Missing or invalid required fields',
      });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const relativeUploadURL = await objectStorageService.getObjectEntityUploadURL();
      const uploadURL = new URL(
        relativeUploadURL,
        `https://${req.get("host")}`,
      ).toString();

      const objectPath =
        objectStorageService.normalizeObjectEntityPath(relativeUploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: {
            name,
            size,
            contentType,
          },
        }),
      );
    } catch (error) {
      req.log.error(
        { err: error },
        'Error generating upload URL',
      );

      res.status(500).json({
        error: 'Failed to generate upload URL',
      });
    }
  },
);

router.put(
  '/storage/uploads/:objectId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const rawObjectId = req.params.objectId;
      const objectId = Array.isArray(rawObjectId)
        ? rawObjectId[0]
        : rawObjectId;

      if (
        !objectId ||
        objectId.includes('/') ||
        objectId.includes('\\') ||
        objectId.includes('..')
      ) {
        res.status(400).json({ error: 'Invalid object ID' });
        return;
      }

      const chunks: Buffer[] = [];

      for await (const chunk of req) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk),
        );
      }

      const data = Buffer.concat(chunks);

      if (data.length === 0) {
        res.status(400).json({ error: 'Empty file' });
        return;
      }

      if (data.length > 10 * 1024 * 1024) {
        res.status(413).json({ error: 'File too large' });
        return;
      }

      const contentType =
        req.headers['content-type'] ||
        'application/octet-stream';

      if (
        contentType !== 'application/pdf' &&
        contentType !==
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        contentType !== 'application/octet-stream'
      ) {
        res.status(400).json({
          error: 'Only PDF and DOCX files are supported',
        });
        return;
      }

      await objectStorageService.saveUploadedObject(
        objectId,
        data,
        {
          size: data.length,
          contentType,
        },
      );

      res.status(200).json({
        success: true,
        objectPath: `/objects/${objectId}`,
      });
    } catch (error) {
      req.log.error(
        { err: error },
        'Error uploading object',
      );

      res.status(500).json({
        error: 'Failed to upload file',
      });
    }
  },
);

router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw)
        ? raw.join('/')
        : raw;

      const file =
        await objectStorageService.searchPublicObject(
          filePath,
        );

      if (!file) {
        res.status(404).json({
          error: 'File not found',
        });
        return;
      }

      const response =
        await objectStorageService.downloadObject(file);

      res.status(response.status);

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );

        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error(
        { err: error },
        'Error serving public object',
      );

      res.status(500).json({
        error: 'Failed to serve public object',
      });
    }
  },
);

router.get(
  '/storage/objects/*path',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const objectPath = Array.isArray(raw)
        ? `/objects/${raw.join('/')}`
        : `/objects/${raw}`;

      const file =
        await objectStorageService.getObjectEntityFile(
          objectPath,
        );

      const response =
        await objectStorageService.downloadObject(file);

      res.status(response.status);

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );

        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error(
        { err: error },
        'Error serving object',
      );

      res.status(404).json({
        error: 'File not found',
      });
    }
  },
);

export default router;
