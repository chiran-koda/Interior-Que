import { importPKCS8, SignJWT } from "jose";
import { HttpError, PROJECT, requireValue } from "./security";
export type RecordData = Record<string, any>;
export interface Transaction {
  get(path: string): RecordData | null;
  set(path: string, data: RecordData): void;
}
export interface Store {
  get(path: string): Promise<RecordData | null>;
  transaction<T>(paths: string[], action: (tx: Transaction) => T): Promise<T>;
  expiredJobs(now: number): Promise<RecordData[]>;
}
type Value = Record<string, any>;
export function encode(value: any): Value {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}
export function decode(value: Value): any {
  if ("timestampValue" in value) return Date.parse(value.timestampValue);
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return record(value.mapValue.fields || {});
  return null;
}
const fields = (data: RecordData) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
const record = (data: RecordData) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, decode(v)]));
let cached: { email: string; token: string; expires: number } | undefined;
let obtaining: Promise<string> | undefined;
async function accessToken(raw: string) {
  const account = JSON.parse(raw);
  requireValue(
    account.project_id === PROJECT &&
      account.client_email?.endsWith(`@${PROJECT}.iam.gserviceaccount.com`),
    503,
    "Use an Interior Que Development service account.",
  );
  if (
    cached &&
    cached.email === account.client_email &&
    cached.expires > Date.now()
  )
    return cached.token;
  if (obtaining) return obtaining;
  obtaining = (async () => {
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/datastore",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    requireValue(
      response.ok,
      503,
      "Photo storage could not connect to the project database.",
    );
    const data = (await response.json()) as any;
    cached = {
      email: account.client_email,
      token: data.access_token,
      expires: Date.now() + 3_300_000,
    };
    return data.access_token as string;
  })();
  try {
    return await obtaining;
  } finally {
    obtaining = undefined;
  }
}
export class FirestoreStore implements Store {
  private root = `projects/${PROJECT}/databases/(default)/documents`;
  constructor(private credential: string) {}
  private name(path: string) {
    requireValue(
      /^(interiorQueCompanies\/[\w-]+\/|interiorQuePhotoJobs\/)/.test(path) &&
        !path.includes(".."),
      500,
      "Invalid storage namespace.",
    );
    return `${this.root}/${path}`;
  }
  private async call(suffix: string, body?: unknown) {
    const result = await fetch(
      `https://firestore.googleapis.com/v1/${this.root}${suffix}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${await accessToken(this.credential)}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (result.status === 404) return null;
    const data = (await result.json()) as any;
    if (!result.ok) {
      if (data.error?.status === "ABORTED")
        throw new HttpError(409, "Storage changed. Please retry.");
      throw new HttpError(
        503,
        "The project database is temporarily unavailable. Please retry.",
      );
    }
    return data;
  }
  async get(path: string) {
    this.name(path);
    const data = await this.call(`/${path}`);
    return data ? record(data.fields || {}) : null;
  }
  async projectRecords(
    company: string,
    project: string,
    key: string,
    shared: boolean,
  ) {
    requireValue(
      /^[\w-]{1,100}$/.test(company) &&
        /^[\w-]{1,100}$/.test(project) &&
        [
          "tasks",
          "updates",
          "approvals",
          "selections",
          "changeOrders",
          "drawings",
          "snags",
          "materials",
          "purchaseOrders",
          "paymentSchedules",
        ].includes(key),
      400,
      "Invalid assistant data request.",
    );
    const filters = [
      {
        fieldFilter: {
          field: { fieldPath: "projectId" },
          op: "EQUAL",
          value: encode(project),
        },
      },
      ...(shared
        ? [
            {
              fieldFilter: {
                field: { fieldPath: "clientVisible" },
                op: "EQUAL",
                value: encode(true),
              },
            },
          ]
        : []),
    ];
    const docs = await this.call(`/interiorQueCompanies/${company}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: key }],
        where:
          filters.length === 1
            ? filters[0]
            : { compositeFilter: { op: "AND", filters } },
        limit: 20,
      },
    });
    return (docs as any[])
      .filter((d) => d.document)
      .map((d) => ({
        ...record(d.document.fields || {}),
        id: d.document.name.split("/").pop(),
      }));
  }
  async transaction<T>(
    paths: string[],
    action: (tx: Transaction) => T,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { transaction } = await this.call(":beginTransaction", {
        options: { readWrite: {} },
      });
      try {
        const docs = await this.call(":batchGet", {
          documents: [...new Set(paths)].map((p) => this.name(p)),
          transaction,
        });
        const values = new Map<string, RecordData | null>(
          (docs as any[]).map((d) => [
            (d.found?.name || d.missing).slice(this.root.length + 1),
            d.found ? record(d.found.fields || {}) : null,
          ]),
        );
        const writes: any[] = [];
        const result = action({
          get: (p) => {
            requireValue(values.has(p), 500, "Unread transaction document.");
            return values.get(p)!;
          },
          set: (p, d) =>
            writes.push({ update: { name: this.name(p), fields: fields(d) } }),
        });
        if (writes.length) await this.call(":commit", { transaction, writes });
        else await this.call(":rollback", { transaction });
        return result;
      } catch (e) {
        await this.call(":rollback", { transaction }).catch(() => {});
        if (!(e instanceof HttpError && e.status === 409) || attempt === 3)
          throw e;
      }
    }
    throw new HttpError(409, "Storage is busy. Please retry.");
  }
  async expiredJobs(now: number) {
    const docs = await this.call(":runQuery", {
      structuredQuery: {
        from: [{ collectionId: "interiorQuePhotoJobs" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "expires" },
            op: "LESS_THAN_OR_EQUAL",
            value: encode(now),
          },
        },
        orderBy: [{ field: { fieldPath: "expires" }, direction: "ASCENDING" }],
        limit: 50,
      },
    });
    return (docs as any[])
      .filter((d) => d.document)
      .map((d) => ({
        ...record(d.document.fields),
        jobId: d.document.name.split("/").pop(),
      }));
  }
}
