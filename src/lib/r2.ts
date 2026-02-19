import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? process.env.S3AccessKeyId;
const secretAccessKey =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? process.env.S3SecretAccessKey;
const bucketNameEnv =
  process.env.CLOUDFLARE_R2_BUCKET_NAME ?? process.env.S3BucketName;
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

let s3Client: S3Client | null = null;
const bucketName: string | null = bucketNameEnv ?? null;

function getClient(): { client: S3Client; bucket: string } {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "Missing Cloudflare R2 env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME"
    );
  }
  if (!s3Client) {
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    s3Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return { client: s3Client, bucket: bucketName };
}

export interface UploadResult {
  Location: string;
  Bucket: string;
  Key: string;
  ETag?: string;
}

export type UploadBase64Opts = { mime?: string };

function isBase64Image(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  return (
    value.startsWith("data:") ||
    (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 100)
  );
}

/** True for data:image/... or data:video/...;base64,... (same R2 upload flow). */
function isBase64Media(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  return value.startsWith("data:") && value.includes(",");
}

/** True if we should upload to R2: data URL or raw base64 (no data: prefix). */
function isBase64Upload(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:") && value.includes(",")) return true;
  return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 100;
}

/**
 * Uploads base64 media (image or video) to Cloudflare R2 (S3-compatible).
 * Accepts Data URL (data:image/png;base64,... or data:video/mp4;base64,...) or plain base64.
 * Uses MIME from Data URL when present; otherwise opts.mime or default image/png.
 */
export async function uploadBase64ImageToS3(
  image: string,
  key: string,
  opts?: UploadBase64Opts
): Promise<UploadResult> {
  const { client, bucket } = getClient();

  let base64Data = image;
  let contentType = opts?.mime ?? "image/png";
  let fileExtension = "png";

  if (image.startsWith("data:")) {
    const commaIndex = image.indexOf(",");
    const dataUrlMeta = image.substring(0, commaIndex);
    base64Data = image.substring(commaIndex + 1);
    const matches = dataUrlMeta.match(/data:(.*);base64/);
    if (matches?.[1]) {
      contentType = matches[1].trim();
      const ext = contentType.match(/\/([^;]+)/)?.[1];
      if (ext) fileExtension = ext;
    }
  } else if (opts?.mime) {
    const ext = opts.mime.match(/\/([^;]+)/)?.[1];
    if (ext) fileExtension = ext;
  }

  const imageBuffer = Buffer.from(base64Data, "base64");
  const finalKey = key.includes(".") ? key : `${key}.${fileExtension}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: finalKey,
      Body: imageBuffer,
      ContentType: contentType,
    })
  );

  const base =
    publicUrl && publicUrl.length > 0
      ? publicUrl.replace(/\/$/, "")
      : `https://${bucket}.r2.cloudflarestorage.com`;
  const Location = `${base}/${finalKey}`;

  return { Location, Bucket: bucket, Key: finalKey };
}

/**
 * Uploads a buffer to R2. Use for HLS segments, manifest, or thumbnail files.
 */
export async function uploadBufferToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<UploadResult> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const base =
    publicUrl && publicUrl.length > 0
      ? publicUrl.replace(/\/$/, "")
      : `https://${bucket}.r2.cloudflarestorage.com`;
  const Location = `${base}/${key}`;
  return { Location, Bucket: bucket, Key: key };
}

/**
 * Deletes a file from R2. Accepts either object key or full URL.
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  let finalKey = key;
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      finalKey = u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;
    } catch {
      const parts = key.split("/");
      finalKey = parts[parts.length - 1] ?? key;
    }
  }

  const { client, bucket } = getClient();

  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: finalKey })
    );
  } catch (err) {
    const e = err as { Code?: string; message?: string };
    if (e?.Code === "NoSuchKey") return;
    throw err;
  }
}

export { isBase64Image, isBase64Media, isBase64Upload };
