import { beforeEach, describe, expect, it } from "vitest";
import { handle, sweep, type PhotoEnv } from "./service";
import { digest, PROJECT, verifyUser } from "./security";
import {
  encode,
  decode,
  FirestoreStore,
  type Store,
  type Transaction,
  type RecordData,
} from "./firestore";
import { generateKeyPair, SignJWT } from "jose";
class MemoryStore implements Store {
  data = new Map<string, RecordData>();
  tail = Promise.resolve();
  failCommit = false;
  async get(path: string) {
    return structuredClone(this.data.get(path) || null);
  }
  async transaction<T>(
    paths: string[],
    action: (tx: Transaction) => T,
  ): Promise<T> {
    let result: T;
    const operation = this.tail.then(() => {
      const writes = new Map<string, RecordData>();
      result = action({
        get: (p) => {
          if (!paths.includes(p)) throw Error("Unread path");
          return structuredClone(this.data.get(p) || null);
        },
        set: (p, d) => {
          writes.set(p, structuredClone(d));
        },
      });
      if (
        this.failCommit &&
        [...writes.keys()].some((k) => k.includes("/files/"))
      )
        throw Error("Temporary database failure");
      for (const [p, d] of writes) this.data.set(p, d);
    });
    this.tail = operation.catch(() => {});
    await operation;
    return result!;
  }
  async expiredJobs(now: number) {
    return [...this.data]
      .filter(
        ([p, d]) => p.startsWith("interiorQuePhotoJobs/") && d.expires <= now,
      )
      .map(([, d]) => d);
  }
}
let store: MemoryStore,
  env: PhotoEnv,
  objects: Map<string, { bytes: Uint8Array; metadata: any }>,
  now: number;
const base = "https://photos.example";
const path = "/v1/companies/company/projects/p1/photos";
const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 20, 3, 1, 17, 0, 2, 17, 0, 3, 17,
  0, 0xff, 0xd9,
]);
async function request(
  route: string,
  method = "GET",
  body?: any,
  user = "supervisor",
) {
  return handle(
    new Request(new URL(route, base), {
      method,
      headers: {
        Origin: "https://app.example",
        Authorization: `Bearer ${user}`,
        "Content-Type":
          body instanceof Uint8Array ? "image/jpeg" : "application/json",
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }),
    }),
    env,
    {
      store,
      verifyUser: async (token) => {
        if (token === "invalid") throw Error("Bad token");
        return token;
      },
      now: () => now,
    },
  );
}
async function reserve(photoId = "photo", changes = {}) {
  return request(path, "POST", {
    id: photoId,
    name: "Kitchen.jpg",
    room: "Kitchen",
    caption: "Ceiling complete",
    clientVisible: false,
    mime: "image/jpeg",
    sizeBytes: jpeg.length,
    width: 20,
    height: 10,
    sha256: await digest(jpeg.buffer),
    ...changes,
  });
}
async function uploaded(photoId = "photo", shared = false) {
  const reservation = await reserve(photoId, { clientVisible: shared });
  expect(reservation.status).toBe(200);
  const data = (await reservation.json()) as any;
  const result = await request(data.url, "PUT", jpeg);
  expect(result.status).toBe(200);
  return data.url;
}
beforeEach(() => {
  now = Date.now();
  store = new MemoryStore();
  objects = new Map();
  const root = "interiorQueCompanies/company";
  for (const [name, role, projects] of [
    ["owner", "owner", []],
    ["supervisor", "supervisor", ["p1"]],
    ["designer", "designer", ["p1"]],
    ["client", "client", ["p1"]],
    ["other", "supervisor", ["p2"]],
  ] as const)
    store.data.set(`${root}/members/${name}`, {
      role,
      active: true,
      projectIds: projects,
    });
  store.data.set(`${root}/projects/p1`, { name: "Home" });
  env = {
    URL_SIGNING_SECRET: "a-long-test-secret-with-at-least-32-characters",
    ALLOWED_ORIGINS: "https://app.example",
    DEFAULT_COMPANY_QUOTA_BYTES: "1000000000",
    PHOTOS: {
      put: async (key: string, bytes: Uint8Array, metadata: any) => {
        objects.set(key, { bytes, metadata });
      },
      get: async (key: string) => {
        const item = objects.get(key);
        return item
          ? { body: new Blob([item.bytes]).stream(), size: item.bytes.length }
          : null;
      },
      delete: async (key: string) => {
        objects.delete(key);
      },
    } as unknown as R2Bucket,
  };
});
describe("Private project photo service", () => {
  it("stores metadata and exact bytes; counts a successful retry once", async () => {
    const url = await uploaded();
    expect((await request(url, "PUT", jpeg)).status).toBe(200);
    expect((await reserve()).status).toBe(200);
    expect(objects.size).toBe(1);
    expect(
      store.data.get("interiorQueCompanies/company/photoStorage/current"),
    ).toEqual({
      quotaBytes: 1_000_000_000,
      usedBytes: jpeg.length,
      reservedBytes: 0,
    });
    const file = store.data.get("interiorQueCompanies/company/files/photo")!;
    expect(file.objectKey).toBe(
      "companies/company/projects/p1/photos/photo.jpg",
    );
    expect(file).not.toHaveProperty("sha256");
    expect(file).not.toHaveProperty("expires");
  });
  it("reserves quota atomically across concurrent requests", async () => {
    env.DEFAULT_COMPANY_QUOTA_BYTES = String(jpeg.length);
    const results = await Promise.all([reserve("one"), reserve("two")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 413]);
    expect(
      store.data.get("interiorQueCompanies/company/photoStorage/current")
        ?.reservedBytes,
    ).toBe(jpeg.length);
  });
  it("supports an administrator-configured company quota", async () => {
    store.data.set("interiorQueCompanies/company/photoStorage/current", {
      quotaBytes: jpeg.length - 1,
      usedBytes: 0,
      reservedBytes: 0,
    });
    expect((await reserve()).status).toBe(413);
  });
  it("denies clients, unassigned staff, paused members and other companies", async () => {
    const input = {
      id: "photo",
      name: "x",
      room: "Kitchen",
      mime: "image/jpeg",
      sizeBytes: jpeg.length,
      width: 20,
      height: 10,
      sha256: await digest(jpeg.buffer),
    };
    for (const user of ["client", "other"])
      expect((await request(path, "POST", input, user)).status).toBe(403);
    store.data.get("interiorQueCompanies/company/members/supervisor")!.active =
      false;
    expect((await reserve()).status).toBe(403);
    expect(
      (await request(path.replace("company", "another"), "POST", input)).status,
    ).toBe(403);
  });
  it("binds upload URLs to the uploader, method and photo; rejects expired URLs", async () => {
    const { url } = (await (await reserve()).json()) as any;
    expect((await request(url, "PUT", jpeg, "designer")).status).toBe(403);
    expect(
      (
        await request(
          url.replace("/photo/upload", "/another/upload"),
          "PUT",
          jpeg,
        )
      ).status,
    ).toBe(403);
    now += 300_001;
    expect((await request(url, "PUT", jpeg)).status).toBe(403);
  });
  it("rejects changed bytes, incorrect dimensions and oversized image claims", async () => {
    expect((await reserve("large", { width: 2001 })).status).toBe(400);
    expect((await reserve("large", { sizeBytes: 5_000_001 })).status).toBe(400);
    let { url } = (await (await reserve()).json()) as any;
    const altered = jpeg.slice();
    altered[7] = 9;
    expect((await request(url, "PUT", altered)).status).toBe(400);
    expect(objects.size).toBe(0);
    ({ url } = (await (
      await reserve("wrongdimensions", { width: 19 })
    ).json()) as any);
    expect((await request(url, "PUT", jpeg)).status).toBe(400);
  });
  it("keeps internal photos private; returns only short-lived viewing URLs", async () => {
    await uploaded();
    const route = path + "/photo/url";
    expect((await request(route, "POST", {}, "client")).status).toBe(403);
    const result = await request(route, "POST", {}, "designer"),
      data = (await result.json()) as any;
    expect(data.expires - now).toBe(60_000);
    const view = await request(data.url);
    expect(view.status).toBe(200);
    expect(view.headers.get("Cache-Control")).toBe("no-store");
    now += 60_001;
    expect((await request(data.url)).status).toBe(403);
  });
  it("allows published client photos but rechecks access on every view", async () => {
    await uploaded("photo", true);
    const { url } = (await (
      await request(path + "/photo/url", "POST", {}, "client")
    ).json()) as any;
    expect((await request(url)).status).toBe(200);
    store.data.get("interiorQueCompanies/company/members/client")!.active =
      false;
    expect((await request(url)).status).toBe(403);
  });
  it("rechecks membership between reservation and actual upload", async () => {
    const { url } = (await (await reserve()).json()) as any;
    store.data.get(
      "interiorQueCompanies/company/members/supervisor",
    )!.projectIds = [];
    expect((await request(url, "PUT", jpeg)).status).toBe(403);
    expect(objects.size).toBe(0);
  });
  it("recovers after R2 succeeds but metadata finalization fails", async () => {
    const { url } = (await (await reserve()).json()) as any;
    store.failCommit = true;
    expect((await request(url, "PUT", jpeg)).status).toBe(503);
    expect(objects.size).toBe(1);
    store.failCommit = false;
    expect((await request(url, "PUT", jpeg)).status).toBe(200);
    expect(
      store.data.get("interiorQueCompanies/company/photoStorage/current")
        ?.usedBytes,
    ).toBe(jpeg.length);
  });
  it("releases abandoned reservations and deletes orphan objects once", async () => {
    const { url } = (await (await reserve()).json()) as any;
    store.failCommit = true;
    await request(url, "PUT", jpeg);
    store.failCommit = false;
    now += 86_400_001;
    await sweep(env, store, now);
    await sweep(env, store, now + 3_600_001);
    expect(objects.size).toBe(0);
    expect(
      store.data.get("interiorQueCompanies/company/photoStorage/current")
        ?.reservedBytes,
    ).toBe(0);
    expect((await reserve()).status).toBe(410);
  });
  it("denies other web origins and does not reveal secrets in errors", async () => {
    const response = await handle(
      new Request(base + path, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
      env,
      { store, verifyUser: async () => "" },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await response.text()).not.toContain(env.URL_SIGNING_SECRET);
  });
  it("rejects missing signing configuration before reserving storage", async () => {
    env.URL_SIGNING_SECRET = "";
    expect((await reserve()).status).toBe(503);
    expect(
      store.data.has("interiorQueCompanies/company/photoStorage/current"),
    ).toBe(false);
  });
  it("bounds metadata bodies without relying on a content length header", async () => {
    expect((await reserve("large", { caption: "x".repeat(9000) })).status).toBe(
      413,
    );
    expect(
      store.data.has("interiorQueCompanies/company/photoStorage/current"),
    ).toBe(false);
  });
  it("retries a failed final orphan deletion without releasing quota twice", async () => {
    const { url } = (await (await reserve()).json()) as any;
    store.failCommit = true;
    await request(url, "PUT", jpeg);
    store.failCommit = false;
    now += 172_800_001;
    const deleteObject = env.PHOTOS.delete;
    env.PHOTOS.delete = async () => {
      throw Error("Temporary R2 failure");
    };
    await sweep(env, store, now);
    expect(objects.size).toBe(1);
    env.PHOTOS.delete = deleteObject;
    await sweep(env, store, now + 3_600_001);
    expect(objects.size).toBe(0);
    expect(
      store.data.get("interiorQueCompanies/company/photoStorage/current")
        ?.reservedBytes,
    ).toBe(0);
    expect((await store.expiredJobs(now + 7_200_002)).length).toBe(0);
  });
});
describe("Firebase isolation and verification", () => {
  it("round-trips Firestore values and refuses other database namespaces", async () => {
    const value = {
      quotaBytes: 1e9,
      visible: true,
      list: ["p1"],
      nested: { name: "Photo" },
    };
    expect(decode(encode(value))).toEqual(value);
    await expect(
      new FirestoreStore("{}").get("DesignQuote/projects/p1"),
    ).rejects.toThrow("Invalid storage namespace");
  });
  it("verifies signature, issuer, audience, expiry and verified Google email", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const make = (
      aud = PROJECT,
      verified = true,
      expiry = "1h",
      issuer = `https://securetoken.google.com/${PROJECT}`,
    ) =>
      new SignJWT({ email_verified: verified })
        .setProtectedHeader({ alg: "RS256" })
        .setSubject("user")
        .setAudience(aud)
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(privateKey);
    expect(await verifyUser(await make(), publicKey)).toBe("user");
    for (const jwt of [
      await make("quote-app-21646"),
      await make(PROJECT, false),
      await make(PROJECT, true, "-1h"),
      await make(PROJECT, true, "1h", "https://evil.example"),
    ])
      await expect(verifyUser(jwt, publicKey)).rejects.toThrow();
    const wrong = await generateKeyPair("RS256");
    await expect(verifyUser(await make(), wrong.publicKey)).rejects.toThrow();
  });
});
