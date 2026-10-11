import {
  DEFAULT_QUOTA,
  MAX_PHOTO,
  HttpError,
  checkSignature,
  digest,
  id,
  imageDimensions,
  requireValue,
  sign,
} from "./security";
import type { Store, RecordData, Transaction } from "./firestore";
export interface PhotoEnv {
  PHOTOS: R2Bucket;
  URL_SIGNING_SECRET: string;
  DEFAULT_COMPANY_QUOTA_BYTES?: string;
  ALLOWED_ORIGINS: string;
}
export interface Dependencies {
  store: Store;
  verifyUser(token: string): Promise<string>;
  now?: () => number;
}
const root = (company: string) => `interiorQueCompanies/${id(company)}`;
const paths = (
  company: string,
  project: string,
  uid: string,
  photo: string,
) => {
  const r = root(company);
  return {
    member: `${r}/members/${id(uid)}`,
    project: `${r}/projects/${id(project)}`,
    upload: `${r}/photoUploads/${id(photo)}`,
    file: `${r}/files/${id(photo)}`,
    storage: `${r}/photoStorage/current`,
    job: `interiorQuePhotoJobs/${company.length}_${company}_${photo}`,
  };
};
export function authorize(
  member: RecordData | null,
  project: RecordData | null,
  projectId: string,
  write: boolean,
  shared = false,
) {
  requireValue(
    member?.active === true &&
      project &&
      ["owner", "designer", "supervisor", "client"].includes(member.role),
    403,
    "You no longer have access to this project.",
  );
  requireValue(
    member!.role === "owner" || member!.projectIds?.includes(projectId),
    403,
    "This project is not assigned to you.",
  );
  requireValue(
    !write || member!.role !== "client",
    403,
    "Only the project team can upload photos.",
  );
  requireValue(
    write || member!.role !== "client" || shared,
    403,
    "This photo has not been shared with you.",
  );
}
function storage(data: RecordData | null, env: PhotoEnv) {
  const quotaBytes =
    data?.quotaBytes ??
    Number(env.DEFAULT_COMPANY_QUOTA_BYTES || DEFAULT_QUOTA);
  requireValue(
    Number.isSafeInteger(quotaBytes) && quotaBytes > 0,
    503,
    "The company storage limit is not configured correctly.",
  );
  return {
    quotaBytes,
    usedBytes: data?.usedBytes || 0,
    reservedBytes: data?.reservedBytes || 0,
  };
}
const cleanText = (value: unknown, length: number) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";
function signedMessage(
  method: string,
  path: string,
  uid: string,
  expires: number,
) {
  return `${method}\n${path}\n${uid}\n${expires}`;
}
async function signedUrl(
  env: PhotoEnv,
  base: string,
  path: string,
  method: string,
  uid: string,
  expires: number,
) {
  const url = new URL(path, base);
  url.searchParams.set("uid", uid);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    await sign(
      env.URL_SIGNING_SECRET,
      signedMessage(method, path, uid, expires),
    ),
  );
  return url.href;
}
async function photoDetails(request: Request) {
  requireValue(
    Number(request.headers.get("Content-Length") || 0) <= 8192,
    413,
    "Photo details are too large.",
  );
  const reader = request.body?.getReader();
  requireValue(reader, 400, "Choose a photo.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader!.cancel();
      throw new HttpError(413, "Photo details are too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    requireValue(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Invalid photo details.",
    );
    return value;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid photo details.");
  }
}
export async function handle(
  request: Request,
  env: PhotoEnv,
  deps: Dependencies,
): Promise<Response> {
  const url = new URL(request.url),
    now = deps.now?.() ?? Date.now();
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const cors: Record<string, string> = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && allowed.includes(origin)) {
    cors["Access-Control-Allow-Origin"] = origin;
    cors.Vary = "Origin";
  }
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: cors });
  try {
    requireValue(
      !origin || allowed.includes(origin),
      403,
      "This app address is not allowed.",
    );
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    requireValue(
      typeof env.URL_SIGNING_SECRET === "string" &&
        env.URL_SIGNING_SECRET.length >= 32,
      503,
      "Photo storage is not configured yet.",
    );
    const match = url.pathname.match(
      /^\/v1\/companies\/([\w-]+)\/(?:storage|projects\/([\w-]+)\/photos(?:\/([\w-]+)(?:\/(upload|view|url))?)?)$/,
    );
    requireValue(match, 404, "Photo endpoint not found.");
    const [, company, project, photo, operation] = match!;
    let uid: string;
    if (operation === "view" && request.method === "GET") {
      uid = id(url.searchParams.get("uid"));
      const expires = Number(url.searchParams.get("expires"));
      requireValue(
        Number.isSafeInteger(expires) &&
          expires > now &&
          expires <= now + 60_000 &&
          (await checkSignature(
            env.URL_SIGNING_SECRET,
            signedMessage("GET", url.pathname, uid, expires),
            url.searchParams.get("signature") || "",
          )),
        403,
        "This photo link expired. Open it again from the project.",
      );
    } else {
      const auth = request.headers.get("Authorization") || "";
      requireValue(
        auth.startsWith("Bearer "),
        401,
        "Sign in to your studio first.",
      );
      uid = id(await deps.verifyUser(auth.slice(7)));
    }
    const r = root(company);
    if (!project && request.method === "GET") {
      const member = await deps.store.get(`${r}/members/${uid}`);
      requireValue(
        member?.active === true &&
          ["owner", "designer", "supervisor"].includes(member.role),
        403,
        "Only the team can view company storage.",
      );
      return json(
        storage(await deps.store.get(`${r}/photoStorage/current`), env),
      );
    }
    requireValue(project, 404, "Choose a project.");
    const p = paths(company, project, uid, photo || "unused");
    if (request.method === "POST" && !photo) {
      const b = await photoDetails(request),
        photoId = id(b.id),
        q = paths(company, project, uid, photoId);
      requireValue(
        ["image/jpeg", "image/webp"].includes(b.mime) &&
          Number.isSafeInteger(b.sizeBytes) &&
          b.sizeBytes > 0 &&
          b.sizeBytes <= MAX_PHOTO &&
          /^[a-f0-9]{64}$/.test(b.sha256),
        400,
        "Choose a compressed JPEG or WebP photo up to 5 MB.",
      );
      requireValue(
        Number.isInteger(b.width) &&
          Number.isInteger(b.height) &&
          Math.min(b.width, b.height) > 0 &&
          Math.max(b.width, b.height) <= 2000,
        400,
        "Photos must be resized to a 2,000 pixel long edge.",
      );
      const details = {
        projectId: project,
        authorId: uid,
        name: cleanText(b.name, 300) || "Site photo",
        room: cleanText(b.room, 120),
        caption: cleanText(b.caption, 2000),
        clientVisible: b.clientVisible === true,
        mime: b.mime,
        sizeBytes: b.sizeBytes,
        width: b.width,
        height: b.height,
        sha256: b.sha256,
      };
      requireValue(details.room, 400, "Choose a room or area.");
      const record = await deps.store.transaction(Object.values(q), (tx) => {
        authorize(tx.get(q.member), tx.get(q.project), project, true);
        const existing = tx.get(q.upload),
          current = storage(tx.get(q.storage), env);
        if (existing) {
          requireValue(
            existing.authorId === uid &&
              Object.keys(details).every(
                (k) => existing[k] === details[k as keyof typeof details],
              ),
            409,
            "This photo upload belongs to different details. Start a new upload.",
          );
          requireValue(
            existing.status === "ready" ||
              (existing.status === "pending" && existing.expires > now),
            410,
            "This upload expired. Remove it and choose the photo again.",
          );
          return existing;
        }
        requireValue(
          current.usedBytes + current.reservedBytes + details.sizeBytes <=
            current.quotaBytes,
          413,
          "Your company’s photo storage is full. Ask the owner to review storage.",
        );
        const objectKey = `companies/${company}/projects/${project}/photos/${photoId}.${b.mime === "image/webp" ? "webp" : "jpg"}`;
        const data = {
          ...details,
          objectKey,
          status: "pending",
          expires: now + 86_400_000,
          date: new Date(now).toISOString().slice(0, 10),
        };
        tx.set(q.upload, data);
        tx.set(q.storage, {
          ...current,
          reservedBytes: current.reservedBytes + details.sizeBytes,
        });
        tx.set(q.job, {
          company,
          project,
          photo: photoId,
          uid,
          objectKey,
          expires: data.expires,
        });
        return data;
      });
      if (record.status === "ready")
        return json({ status: "ready", id: photoId });
      return json({
        status: "pending",
        id: photoId,
        url: await signedUrl(
          env,
          url.origin,
          `/v1/companies/${company}/projects/${project}/photos/${photoId}/upload`,
          "PUT",
          uid,
          now + 300_000,
        ),
      });
    }
    requireValue(photo, 404, "Photo not found.");
    if (operation === "upload" && request.method === "PUT") {
      const expires = Number(url.searchParams.get("expires"));
      requireValue(
        url.searchParams.get("uid") === uid &&
          Number.isSafeInteger(expires) &&
          expires > now &&
          expires <= now + 300_000 &&
          (await checkSignature(
            env.URL_SIGNING_SECRET,
            signedMessage("PUT", url.pathname, uid, expires),
            url.searchParams.get("signature") || "",
          )),
        403,
        "Your upload link expired. Retry the photo.",
      );
      const [member, proj, upload] = await Promise.all([
        deps.store.get(p.member),
        deps.store.get(p.project),
        deps.store.get(p.upload),
      ]);
      authorize(member, proj, project, true);
      requireValue(
        upload?.authorId === uid && upload.projectId === project,
        403,
        "This upload is not yours.",
      );
      if (upload!.status === "ready")
        return json({ status: "ready", id: photo });
      requireValue(
        upload!.status === "pending" && upload!.expires > now,
        410,
        "This upload expired. Choose the photo again.",
      );
      requireValue(
        request.headers.get("Content-Type") === upload!.mime,
        400,
        "Photo format does not match.",
      );
      const length = request.headers.get("Content-Length");
      requireValue(
        !length || Number(length) === upload!.sizeBytes,
        400,
        "Photo size does not match.",
      );
      const reader = request.body?.getReader();
      requireValue(reader, 400, "Choose a photo.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        size += value.length;
        if (size > upload!.sizeBytes || size > MAX_PHOTO) {
          await reader!.cancel();
          throw new HttpError(413, "Photo exceeds the reserved size.");
        }
        chunks.push(value);
      }
      requireValue(
        size === upload!.sizeBytes,
        400,
        "Photo upload was incomplete. Retry it.",
      );
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      requireValue(
        (await digest(bytes.buffer)) === upload!.sha256,
        400,
        "The photo changed during upload. Choose it again.",
      );
      const dimensions = imageDimensions(bytes.buffer, upload!.mime);
      requireValue(
        dimensions.width === upload!.width &&
          dimensions.height === upload!.height,
        400,
        "The photo dimensions do not match.",
      );
      const key = upload!.objectKey;
      requireValue(
        key.startsWith(
          `companies/${company}/projects/${project}/photos/${photo}.`,
        ),
        500,
        "Invalid photo location.",
      );
      await env.PHOTOS.put(key, bytes, {
        httpMetadata: {
          contentType: upload!.mime,
          cacheControl: "private, no-store",
        },
        customMetadata: { sha256: upload!.sha256 },
      });
      try {
        await deps.store.transaction(Object.values(p), (tx) => {
          authorize(tx.get(p.member), tx.get(p.project), project, true);
          const current = tx.get(p.upload)!;
          if (current.status === "ready") return;
          requireValue(
            current.status === "pending" &&
              current.expires > (deps.now?.() ?? Date.now()),
            410,
            "This upload expired. Choose the photo again.",
          );
          const quota = storage(tx.get(p.storage), env);
          tx.set(p.storage, {
            ...quota,
            usedBytes: quota.usedBytes + current.sizeBytes,
            reservedBytes: Math.max(0, quota.reservedBytes - current.sizeBytes),
          });
          tx.set(p.upload, { ...current, status: "ready" });
          const { expires, sha256, status, ...metadata } = current;
          tx.set(p.file, { ...metadata, kind: "photo", url: "" });
          tx.set(p.job, {
            company,
            project,
            photo,
            uid,
            objectKey: key,
            expires: Number.MAX_SAFE_INTEGER,
          });
        });
      } catch (e) {
        // Keep an uploaded object for retry if the database is unavailable. Expiry cleanup removes abandoned objects.
        if (e instanceof HttpError && [403, 410].includes(e.status))
          await env.PHOTOS.delete(key);
        throw e;
      }
      return json({ status: "ready", id: photo });
    }
    const [member, proj, file] = await Promise.all([
      deps.store.get(p.member),
      deps.store.get(p.project),
      deps.store.get(p.file),
    ]);
    requireValue(
      file?.kind === "photo" && file.projectId === project,
      404,
      "Photo not found.",
    );
    authorize(member, proj, project, false, file!.clientVisible);
    if (operation === "url" && request.method === "POST")
      return json({
        url: await signedUrl(
          env,
          url.origin,
          `/v1/companies/${company}/projects/${project}/photos/${photo}/view`,
          "GET",
          uid,
          now + 60_000,
        ),
        expires: now + 60_000,
      });
    if (operation === "view" && request.method === "GET") {
      const object = await env.PHOTOS.get(file!.objectKey);
      requireValue(object, 404, "Photo not found in storage.");
      return new Response(object!.body, {
        headers: {
          ...cors,
          "Content-Type": file!.mime,
          "Content-Length": String(object!.size),
          "Content-Disposition": "inline",
        },
      });
    }
    throw new HttpError(404, "Photo endpoint not found.");
  } catch (e) {
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Photo storage is temporarily unavailable. Please retry.",
      },
      e instanceof HttpError ? e.status : 503,
    );
  }
}
export async function sweep(env: PhotoEnv, store: Store, now = Date.now()) {
  for (const job of await store.expiredJobs(now)) {
    const p = paths(
      id(job.company),
      id(job.project),
      id(job.uid),
      id(job.photo),
    );
    const key = await store.transaction([p.upload, p.storage, p.job], (tx) => {
      const upload = tx.get(p.upload),
        quota = storage(tx.get(p.storage), env);
      if (!upload || upload.status === "ready" || upload.expires > now) {
        const current = tx.get(p.job);
        if (current)
          tx.set(p.job, { ...current, expires: Number.MAX_SAFE_INTEGER });
        return null;
      }
      if (upload.status === "pending") {
        tx.set(p.upload, { ...upload, status: "expired" });
        tx.set(p.storage, {
          ...quota,
          reservedBytes: Math.max(0, quota.reservedBytes - upload.sizeBytes),
        });
      }
      // Retain a cleanup job for a day to also remove any in-flight late writes.
      tx.set(p.job, { ...job, expires: now + 3_600_000 });
      return upload.objectKey as string;
    });
    if (key) {
      try {
        await env.PHOTOS.delete(key);
      } catch {
        continue;
      } // Keep the scheduled job so a temporary R2 failure is retried.
      await store.transaction([p.upload, p.job], (tx) => {
        const upload = tx.get(p.upload),
          current = tx.get(p.job);
        if (
          current &&
          upload?.status === "expired" &&
          upload.expires + 86_400_000 <= now
        )
          tx.set(p.job, { ...current, expires: Number.MAX_SAFE_INTEGER });
      });
    }
  }
}
