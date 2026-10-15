import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

/**
 * Object storage (docs/06 § Files).
 *
 * The bucket is private. Files are never publicly reachable — access is always
 * via a signed, expiring URL, and every issue/open is recorded in the audit log
 * by the calling service.
 */
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

/** Short-lived by default: long enough to click, short enough to matter. */
export const DEFAULT_URL_TTL_SECONDS = 300;

export async function signedGetUrl(
  key: string,
  ttlSeconds: number = DEFAULT_URL_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

export async function signedPutUrl(
  key: string,
  contentType: string,
  ttlSeconds: number = DEFAULT_URL_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: ttlSeconds },
  );
}
