/**
 * The object-storage client and its server-side-encryption configuration.
 *
 * Server-only. This module deliberately exposes NO way to obtain a URL: it hands out
 * the client and command builders only. The single place a URL leaves the server is
 * signedUrl.ts, and only after authorization.
 *
 * This replaces src/lib/s3.ts, which exported signedGetUrl()/signedPutUrl() taking a
 * caller-supplied TTL with no tenant scoping — the cross-tenant, unbounded-TTL
 * surface the guardrail review flagged. Both are deleted.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export type ServerSideEncryption =
  | { ServerSideEncryption: "AES256" }
  | { ServerSideEncryption: "aws:kms"; SSEKMSKeyId: string };

/**
 * Encryption applied to every uploaded object. Default is AES256 (SSE-S3), which
 * MinIO supports out of the box, so local development needs no KMS. Set
 * S3_SSE_ALGORITHM=aws:kms (and S3_KMS_KEY_ID) for stronger key custody.
 *
 * Note: because the parameters are part of the signature, an uploader using the
 * presigned PUT must send the matching x-amz-server-side-encryption header, or the
 * signature will not match. Documented in api/README.md.
 */
export function serverSideEncryption(): ServerSideEncryption {
  if (env.S3_SSE_ALGORITHM === "aws:kms") {
    if (!env.S3_KMS_KEY_ID) {
      throw new Error("S3_SSE_ALGORITHM=aws:kms requires S3_KMS_KEY_ID to be set");
    }
    return { ServerSideEncryption: "aws:kms", SSEKMSKeyId: env.S3_KMS_KEY_ID };
  }
  return { ServerSideEncryption: "AES256" };
}

/** Command for a download URL. One key, one object, nothing else. */
export function getObjectCommand(key: string): GetObjectCommand {
  return new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
}

/** Command for an upload URL, with content type pinned and SSE applied. */
export function putObjectCommand(key: string, contentType: string): PutObjectCommand {
  return new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ...serverSideEncryption(),
  });
}
