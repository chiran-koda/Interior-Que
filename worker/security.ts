import { createRemoteJWKSet, jwtVerify } from "jose";

export const PROJECT = "interior-que-development";
export const DEFAULT_QUOTA = 1_000_000_000;
export const MAX_PHOTO = 5_000_000;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const requireValue = (ok: unknown, status: number, message: string) => {
  if (!ok) throw new HttpError(status, message);
};
export const id = (value: unknown): string => {
  requireValue(
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value),
    400,
    "Invalid project or photo identifier.",
  );
  return value as string;
};
const keys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);
export async function verifyUser(
  token: string,
  keySet: Parameters<typeof jwtVerify>[1] = keys,
) {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${PROJECT}`,
      audience: PROJECT,
    });
    requireValue(
      payload.email_verified === true &&
        payload.sub &&
        payload.sub.length <= 128,
      401,
      "Sign in with a verified Google account.",
    );
    return payload.sub!;
  } catch {
    throw new HttpError(401, "Your sign-in expired. Please sign in again.");
  }
}
const encoder = new TextEncoder();
export async function sign(secret: string, message: string) {
  requireValue(secret.length >= 32, 503, "Photo storage is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function checkSignature(
  secret: string,
  message: string,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/../g)!, (n) =>
    parseInt(n, 16),
  );
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(message));
}
export async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// Read dimensions from the encoded image, not from browser-supplied metadata.
export function imageDimensions(bytes: ArrayBuffer, mime: string) {
  const b = new Uint8Array(bytes),
    v = new DataView(bytes);
  if (mime === "image/jpeg" && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= b.length) {
      if (b[at++] !== 0xff) break;
      while (b[at] === 0xff) at++;
      const marker = b[at++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = v.getUint16(at);
      if (length < 2 || at + length > b.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7)
        return { height: v.getUint16(at + 3), width: v.getUint16(at + 5) };
      at += length;
    }
  }
  if (
    mime === "image/webp" &&
    b.length >= 30 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  ) {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8X")
      return {
        width: 1 + b[24] + (b[25] << 8) + (b[26] << 16),
        height: 1 + b[27] + (b[28] << 8) + (b[29] << 16),
      };
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return {
        width: v.getUint16(26, true) & 0x3fff,
        height: v.getUint16(28, true) & 0x3fff,
      };
    if (kind === "VP8L" && b[20] === 0x2f)
      return {
        width: 1 + b[21] + ((b[22] & 63) << 8),
        height: 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 15) << 10),
      };
  }
  throw new HttpError(400, "Choose a valid JPEG or WebP photo.");
}
