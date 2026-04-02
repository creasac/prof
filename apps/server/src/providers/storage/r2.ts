import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "../../env.js";

let r2Client: S3Client | null = null;

export function isR2Configured() {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

export async function putR2Object(options: {
  key: string;
  body: Buffer;
  contentType: string;
  contentDisposition?: string;
}) {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
      ContentDisposition: options.contentDisposition,
    }),
  );
}

export async function getR2Object(key: string) {
  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    }),
  );

  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`R2 object ${key} was not found.`);
  }

  return {
    body: Buffer.from(bytes),
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength ?? undefined,
    contentDisposition: response.ContentDisposition ?? undefined,
  };
}

export async function deleteR2Object(key: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    }),
  );
}

function getR2Client() {
  if (r2Client) {
    return r2Client;
  }

  if (!isR2Configured()) {
    throw new Error("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.");
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });

  return r2Client;
}
