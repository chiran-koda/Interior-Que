import { describe, it, expect, vi } from "vitest";
import {
  handleAssistant,
  assistantContext,
  parseAssistant,
  callProvider,
  type AssistantEnv,
  type AssistantStore,
} from "./assistant";
import type { RecordData, Transaction } from "./firestore";
class MemoryStore implements AssistantStore {
  data = new Map<string, RecordData>();
  rows: Record<string, RecordData[]> = {};
  queries: string[] = [];
  queue = Promise.resolve();
  async get(path: string) {
    return this.data.get(path) || null;
  }
  async transaction<T>(paths: string[], fn: (t: Transaction) => T): Promise<T> {
    let result: T;
    const work = this.queue.then(() => {
      result = fn({
        get: (path) => this.data.get(path) || null,
        set: (path, data) => this.data.set(path, data),
      });
    });
    this.queue = work.then(
      () => {},
      () => {},
    );
    await work;
    return result!;
  }
  async projectRecords(
    company: string,
    project: string,
    key: string,
    shared: boolean,
  ) {
    this.queries.push(key);
    return this.rows[key] || [];
  }
  async expiredJobs() {
    return [];
  }
}
const env: AssistantEnv = {
  FIREBASE_PROJECT_ID: "interior-que-development",
  FIREBASE_SERVICE_ACCOUNT: "not-used",
  ALLOWED_ORIGINS: "https://chiran-koda.github.io",
  AI_API_KEY: "synthetic-test-key",
  AI_MODEL: "test-model",
  AI_PROVIDER: "openai",
};
const setup = (role = "supervisor") => {
  const s = new MemoryStore();
  s.data.set("interiorQueCompanies/firm/members/user", {
    active: true,
    role,
    projectIds: ["p1"],
  });
  s.data.set("interiorQueCompanies/firm/projects/p1", {
    name: "Home",
    progress: 40,
  });
  return s;
};
const request = (
  body: any = {
    companyId: "firm",
    projectId: "p1",
    prompt: "What needs attention?",
  },
  origin = "https://chiran-koda.github.io",
) =>
  new Request("https://assistant.test/ask", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer fake-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const mockProvider = () =>
  vi.fn(async (_url: any, _options: any) =>
    Response.json({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                answer: "One task needs attention.",
                proposal: null,
              }),
            },
          ],
        },
      ],
    }),
  );
describe("Shared AI server permissions and limits", () => {
  it("rejects production configuration, unknown origins and unassigned projects before provider calls", async () => {
    const s = setup(),
      fetcher = mockProvider(),
      deps = { store: s, verifyUser: async () => "user", fetcher };
    expect(
      (
        await handleAssistant(
          request(),
          { ...env, FIREBASE_PROJECT_ID: "quote-app-21646" },
          deps,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await handleAssistant(
          request(undefined, "https://evil.test"),
          env,
          deps,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleAssistant(
          request({ companyId: "firm", projectId: "p2", prompt: "Show data" }),
          env,
          deps,
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a caller-supplied role or data payload", async () => {
    const fetcher = mockProvider(),
      s = setup();
    expect(
      (
        await handleAssistant(
          request({
            companyId: "firm",
            projectId: "p1",
            prompt: "Show money",
            role: "owner",
          }),
          env,
          { store: s, verifyUser: async () => "user", fetcher },
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("withholds a response if project access is revoked while the provider works", async () => {
    const s = setup(),
      fetcher = mockProvider();
    const revoked = vi.fn(async (url: any, options: any) => {
      const response = await fetcher(url, options);
      s.data.set("interiorQueCompanies/firm/members/user", {
        active: false,
        role: "supervisor",
        projectIds: ["p1"],
      });
      return response;
    });
    const response = await handleAssistant(request(), env, {
      store: s,
      verifyUser: async () => "user",
      fetcher: revoked,
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("One task needs attention.");
  });
  it("bounds project context and includes only client-shared collections", async () => {
    const s = setup("client");
    s.rows.paymentSchedules = [
      {
        projectId: "p1",
        title: "Shared payment",
        amount: 5000,
        received: 2000,
        clientVisible: true,
      },
      {
        projectId: "p1",
        title: "Private payment",
        amount: 12345,
        clientVisible: false,
      },
    ];
    s.rows.updates = Array.from({ length: 100 }, (_, i) => ({
      projectId: "p1",
      summary: "a".repeat(5000),
      date: "2026-10-12",
      clientVisible: true,
    }));
    const context = await assistantContext(s, "firm", "p1", "client", {
      name: "Home",
    });
    const json = JSON.stringify(context);
    expect(json.length).toBeLessThanOrEqual(45000);
    expect(json).toContain("5000");
    expect(json).toContain("2000");
    expect(json).not.toContain("12345");
  });
  it("does not call a provider or consume quota without the future key", async () => {
    const s = setup(),
      fetcher = mockProvider();
    const response = await handleAssistant(
      request(),
      { ...env, AI_API_KEY: undefined },
      { store: s, verifyUser: async () => "user", fetcher },
    );
    expect(response.status).toBe(503);
    expect([...s.data.keys()].some((k) => k.includes("aiPrivateUsage"))).toBe(
      false,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("hides money from staff and internal records from clients even with an over-broad store response", async () => {
    const s = setup();
    s.rows.updates = [
      { projectId: "p1", summary: "Internal", clientVisible: false },
      { projectId: "p1", summary: "Shared", clientVisible: true },
      { projectId: "p2", summary: "Other project", clientVisible: true },
    ];
    s.rows.purchaseOrders = [
      {
        projectId: "p1",
        title: "Plywood",
        supplier: "Vendor",
        unitRate: 999,
        quantity: 10,
      },
    ];
    const staff = await assistantContext(s, "firm", "p1", "supervisor", {
      name: "Home",
    });
    expect(JSON.stringify(staff)).not.toContain("unitRate");
    expect(s.queries).not.toContain("changeOrders");
    s.queries = [];
    const client = await assistantContext(s, "firm", "p1", "client", {
      name: "Home",
    });
    expect(JSON.stringify(client)).not.toContain("Internal");
    expect(JSON.stringify(client)).not.toContain("Other project");
    expect(s.queries).not.toContain("purchaseOrders");
    expect(s.queries).not.toContain("tasks");
  });
  it("enforces the daily global limit atomically across concurrent users", async () => {
    const s = setup(),
      fetcher = mockProvider(),
      deps = {
        store: s,
        verifyUser: async () => "user",
        fetcher,
        now: () => 100000,
      };
    const responses = await Promise.all([
      handleAssistant(request(), { ...env, DAILY_GLOBAL_REQUESTS: "1" }, deps),
      handleAssistant(request(), { ...env, DAILY_GLOBAL_REQUESTS: "1" }, deps),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps credentials out of output and disables provider response storage", async () => {
    const fetcher = mockProvider(),
      response = await handleAssistant(request(), env, {
        store: setup(),
        verifyUser: async () => "user",
        fetcher,
      });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(env.AI_API_KEY);
    const payload = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(payload.store).toBe(false);
    expect(payload.max_output_tokens).toBe(1800);
    expect(payload.text.format.strict).toBe(true);
  });
  it("drops action proposals for clients and rejects malformed model output", () => {
    const proposal = {
      kind: "task",
      title: "Inspect",
      summary: "",
      room: "",
      due: "2026-10-12",
      stage: "Execution",
      tomorrow: "",
      blocker: "",
    };
    expect(
      parseAssistant(
        JSON.stringify({ answer: "Review needed", proposal }),
        "client",
      ).proposal,
    ).toBeNull();
    expect(
      parseAssistant(
        JSON.stringify({ answer: "Review needed", proposal }),
        "designer",
      ).proposal?.title,
    ).toBe("Inspect");
    expect(() => parseAssistant("not JSON", "owner")).toThrow();
    expect(() =>
      parseAssistant(
        JSON.stringify({
          answer: "Okay",
          proposal: { kind: "transfer-money" },
        }),
        "owner",
      ),
    ).toThrow();
  });
  it("sends Gemini keys in headers, never URLs, and handles provider failure without exposing details", async () => {
    const fetcher = vi.fn(async (_url: any, _options: any) =>
      Response.json(
        { error: { message: "sensitive-provider-detail" } },
        { status: 401 },
      ),
    );
    await expect(
      callProvider(
        { ...env, AI_PROVIDER: "gemini" },
        "Hello",
        { role: "client" },
        fetcher,
      ),
    ).rejects.toThrow("could not complete");
    expect(String(fetcher.mock.calls[0][0])).not.toContain(env.AI_API_KEY!);
    expect((fetcher.mock.calls[0][1].headers as any)["x-goog-api-key"]).toBe(
      env.AI_API_KEY,
    );
  });
});
