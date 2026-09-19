import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  canAccessObject,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

export interface LocalObjectFile {
  path: string;
  metadataPath: string;
  name: string;
  download(): Promise<[Buffer]>;
}

export interface ObjectMetadata {
  name?: string;
  size?: number;
  contentType?: string;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {
    void mkdir(UPLOADS_DIR, { recursive: true });
  }

  private async ensureUploadsDir(): Promise<void> {
    await mkdir(UPLOADS_DIR, { recursive: true });
  }

  private getSafeObjectPath(objectId: string): string {
    if (
      !objectId ||
      objectId.includes('/') ||
      objectId.includes('\\') ||
      objectId.includes('..')
    ) {
      throw new ObjectNotFoundError();
    }

    return path.join(UPLOADS_DIR, objectId);
  }

  private getMetadataPath(objectId: string): string {
    return `${this.getSafeObjectPath(objectId)}.metadata.json`;
  }

  private getObjectIdFromPath(objectPath: string): string {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const objectId = objectPath.slice('/objects/'.length);

    if (
      !objectId ||
      objectId.includes('/') ||
      objectId.includes('\\') ||
      objectId.includes('..')
    ) {
      throw new ObjectNotFoundError();
    }

    return objectId;
  }

  private createObjectFile(objectId: string): LocalObjectFile {
    return {
      path: this.getSafeObjectPath(objectId),
      metadataPath: this.getMetadataPath(objectId),
      name: objectId,
      download: async () => {
        const buffer = await readFile(this.getSafeObjectPath(objectId));
        return [buffer];
      },
    };
  }

  private async readMetadata(
    objectFile: LocalObjectFile,
  ): Promise<ObjectMetadata> {
    try {
      const contents = await readFile(objectFile.metadataPath, 'utf8');
      return JSON.parse(contents) as ObjectMetadata;
    } catch {
      return {};
    }
  }

  private async writeMetadata(
    objectFile: LocalObjectFile,
    metadata: ObjectMetadata,
  ): Promise<void> {
    await writeFile(
      objectFile.metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf8',
    );
  }

  getPublicObjectSearchPaths(): string[] {
    return [];
  }

  getPrivateObjectDir(): string {
    return UPLOADS_DIR;
  }

  async searchPublicObject(
    _filePath: string,
  ): Promise<LocalObjectFile | null> {
    return null;
  }

  async downloadObject(
    file: LocalObjectFile,
    cacheTtlSec = 3600,
  ): Promise<Response> {
    try {
      const metadata = await this.readMetadata(file);
      const fileStats = await stat(file.path);

      const nodeStream = createReadStream(file.path);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type':
            metadata.contentType || 'application/octet-stream',
          'Cache-Control': `private, max-age=${cacheTtlSec}`,
          'Content-Length': String(fileStats.size),
        },
      });
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    await this.ensureUploadsDir();

    const objectId = randomUUID();

    const objectFile = this.createObjectFile(objectId);

    await this.writeMetadata(objectFile, {});

    return `/api/storage/uploads/${objectId}`;
  }

  async saveUploadedObject(
    objectId: string,
    data: Buffer,
    metadata: ObjectMetadata,
  ): Promise<LocalObjectFile> {
    await this.ensureUploadsDir();

    const objectFile = this.createObjectFile(objectId);

    await writeFile(objectFile.path, data);
    await this.writeMetadata(objectFile, metadata);

    return objectFile;
  }

  async getObjectEntityFile(
    objectPath: string,
  ): Promise<LocalObjectFile> {
    const objectId = this.getObjectIdFromPath(objectPath);

    const objectFile = this.createObjectFile(objectId);

    try {
      await stat(objectFile.path);
    } catch {
      throw new ObjectNotFoundError();
    }

    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith('/api/storage/uploads/')) {
      const objectId = rawPath.slice('/api/storage/uploads/'.length);

      if (
        !objectId ||
        objectId.includes('/') ||
        objectId.includes('\\') ||
        objectId.includes('..')
      ) {
        throw new ObjectNotFoundError();
      }

      return `/objects/${objectId}`;
    }

    if (rawPath.startsWith('/objects/')) {
      return rawPath;
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);

    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);

    await setObjectAclPolicy(objectFile, aclPolicy);

    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: LocalObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
