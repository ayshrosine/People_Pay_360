import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

/**
 * Cloudflare R2 access over the S3-compatible API.
 *
 * Object storage is optional: the service reports `isConfigured() === false`
 * and callers fall back to serving files inline. It must never throw from the
 * constructor, because that would stop the whole application from booting on a
 * machine that simply has no R2 credentials.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly client: S3Client | null;
  private readonly bucketName: string | undefined;
  private readonly publicUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('R2_ENDPOINT');

    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL');

    if (!accessKeyId || !secretAccessKey || !this.bucketName || !endpoint) {
      this.logger.warn(
        'Cloudflare R2 is not configured (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_ENDPOINT). File storage is disabled.',
      );
      this.client = null;
      return;
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async uploadFile(file: Buffer, key: string, contentType: string): Promise<string> {
    const client = this.requireClient();

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
      }),
    );

    return this.publicUrl ? `${this.publicUrl.replace(/\/$/, '')}/${key}` : key;
  }

  async getFile(key: string): Promise<Buffer> {
    const client = this.requireClient();

    const response = await client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    );

    const body = response.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body) {
      throw new Error(`Object ${key} returned an empty body`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  generateKey(prefix: string, fileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${prefix}/${timestamp}-${random}-${safeName}`;
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException({
        message: 'File storage is not configured on this deployment.',
        code: 'STORAGE_UNAVAILABLE',
      });
    }
    return this.client;
  }
}
