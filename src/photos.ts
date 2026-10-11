import * as cloud from "./studio-cloud";
export const PHOTO_EDGE = 2000;
export const PHOTO_LIMIT = 5_000_000;
export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  sha256: string;
  name: string;
}
export interface PhotoStorage {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
}
export function dimensions(width: number, height: number) {
  const ratio = Math.min(1, PHOTO_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPEG, PNG or WebP photo. For HEIC photos, export as JPEG first.",
    );
  if (file.size > 40_000_000)
    throw new Error("Choose a photo smaller than 40 MB.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width * bitmap.height > 80_000_000)
      throw new Error("This photo is too large to resize on this device.");
    const size = dimensions(bitmap.width, bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Photo resizing is unavailable in this browser.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const encode = (type: string, quality: number) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("This photo could not be resized.")),
          type,
          quality,
        ),
      );
    let blob = await encode("image/webp", 0.82);
    if (blob.type !== "image/webp") blob = await encode("image/jpeg", 0.84);
    if (blob.size > PHOTO_LIMIT) blob = await encode("image/jpeg", 0.65);
    if (blob.size > PHOTO_LIMIT)
      throw new Error(
        "This photo is still too large after resizing. Choose a smaller photo.",
      );
    // Drawing to a canvas also removes source GPS/EXIF metadata.
    const bytes = await blob.arrayBuffer();
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return {
      blob,
      ...size,
      sha256,
      name:
        file.name.replace(/\.[^.]+$/, "") +
        (blob.type === "image/webp" ? ".webp" : ".jpg"),
    };
  } finally {
    bitmap.close();
  }
}
export function photoServiceUrl() {
  const value = import.meta.env.VITE_PHOTO_API_URL || "";
  if (!value) return "";
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" &&
    !(
      import.meta.env.DEV &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  )
    throw new Error("The photo service must use HTTPS.");
  return parsed.origin;
}
async function token() {
  const user = cloud.currentUser();
  if (!user) throw new Error("Sign in to your studio first.");
  return user.getIdToken();
}
export async function photoRequest(path: string, body?: unknown) {
  const base = photoServiceUrl();
  if (!base)
    throw new Error(
      "Photo storage is awaiting company setup. Ask your owner to finish the storage setup.",
    );
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Photo storage is unavailable. Please retry.",
    );
  return data;
}
export const photoPath = (company: string, project: string, id?: string) =>
  `/v1/companies/${encodeURIComponent(company)}/projects/${encodeURIComponent(project)}/photos${id ? "/" + encodeURIComponent(id) : ""}`;
export async function uploadPhoto(
  company: string,
  project: string,
  photoId: string,
  photo: CompressedPhoto,
  details: { room: string; caption: string; clientVisible: boolean },
  onProgress: (progress: number) => void,
) {
  const result = await photoRequest(photoPath(company, project), {
    id: photoId,
    name: photo.name,
    mime: photo.blob.type,
    sizeBytes: photo.blob.size,
    width: photo.width,
    height: photo.height,
    sha256: photo.sha256,
    ...details,
  });
  if (result.status === "ready") {
    onProgress(100);
    return;
  }
  const authorization = await token();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", result.url);
    xhr.timeout = 180_000;
    xhr.setRequestHeader("Authorization", `Bearer ${authorization}`);
    xhr.setRequestHeader("Content-Type", photo.blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let message = "Upload failed. Retry this photo.";
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Connection interrupted. Retry this photo."));
    xhr.ontimeout = () =>
      reject(new Error("Upload took too long. Retry this photo."));
    xhr.send(photo.blob);
  });
}
export const getPhotoUrl = (company: string, project: string, id: string) =>
  photoRequest(`${photoPath(company, project, id)}/url`, {});
export const getStorage = (company: string): Promise<PhotoStorage> =>
  photoRequest(`/v1/companies/${encodeURIComponent(company)}/storage`);
export const bytesLabel = (bytes: number) =>
  bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
    : bytes >= 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(bytes / 1000)} KB`;
