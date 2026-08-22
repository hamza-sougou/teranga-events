import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignUploadInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}

export interface HeadObjectResult {
  sizeBytes: number;
  contentType?: string;
}

// Thin wrapper around @aws-sdk/client-s3 pointed at Cloudflare R2 (S3-compatible).
// Every method maps 1:1 to a real SDK call, same shape as PaydunyaProvider
// (backend/src/payments/providers/paydunya.provider.ts).
@Injectable()
export class R2Provider {
  private readonly client: S3Client;
  private readonly bucket?: string;
  private readonly publicUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('r2.bucket');
    this.publicUrl = this.configService.get<string>('r2.publicUrl');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.configService.get<string>('r2.accountId')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.get<string>('r2.accessKeyId') ?? '',
        secretAccessKey: this.configService.get<string>('r2.secretAccessKey') ?? '',
      },
      // Without this, @aws-sdk/client-s3 signs a CRC32 checksum of an empty
      // body into the presigned URL (computed at sign time, before the real
      // file exists) — every real upload then fails signature verification.
      // Verified directly against the installed SDK version; not hypothetical.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  // Content-Type is never part of the presigned signature (unsignable header
  // in @aws-sdk/s3-request-presigner) — a client can PUT any bytes with any
  // Content-Type to this URL. Content-Length IS signed, and browsers cannot
  // override it on fetch/XHR, so passing it here is real upload-time size
  // enforcement, not just a declared value.
  async getPresignedUploadUrl(input: PresignUploadInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds ?? 300 });
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  // Idempotent on S3/R2 — does not throw for an already-absent key, so no
  // special-casing is needed here (unlike a typical "tolerate 404" wrapper).
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  buildPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
