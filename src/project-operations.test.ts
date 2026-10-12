import { describe, it, expect } from "vitest";
import {
  demoStudio,
  scopedStudio,
  type StudioData,
  type StudioPayment,
} from "./studio-model";
import {
  projectTemplates,
  templateTasks,
  budgetSummary,
  outstanding,
  drawingGroup,
  safeDrawingLink,
  canFinishHandover,
  validateOperation,
  applyOperation,
  applyProjectPayment,
  type ChangeOrder,
  type Drawing,
  type PurchaseOrder,
  type Snag,
} from "./project-operations";
const owner = (s: StudioData) => s.members.find((m) => m.role === "owner")!;
const selection = (s: StudioData) => ({
  id: "selection",
  projectId: "p1",
  room: "Kitchen",
  title: "Laminate",
  specification: "Oak",
  photoId: "",
  authorId: owner(s).id,
  reviewerId: s.members.find((m) => m.role === "client")!.id,
  due: "2026-10-12",
  status: "Awaiting decision" as const,
  response: "",
  clientVisible: true,
});
const drawing = (s: StudioData, id = "drawing"): Drawing => ({
  id,
  projectId: "p1",
  room: "Kitchen",
  title: "Layout",
  groupId: drawingGroup("Kitchen", "Layout"),
  url: "https://example.com/layout.pdf",
  version: 0,
  date: "2026-10-12",
  authorId: owner(s).id,
  status: "Draft",
  clientVisible: false,
});
const order = (
  s: StudioData,
  id = "order",
  materialId = "",
): PurchaseOrder => ({
  id,
  projectId: "p1",
  materialId,
  title: "Plywood",
  supplier: "Supplier",
  quantity: 10,
  receivedQuantity: 0,
  unit: "Sheets",
  unitRate: 100,
  due: "2026-10-15",
  notes: "",
  authorId: owner(s).id,
});
const snag = (s: StudioData): Snag => ({
  id: "snag",
  projectId: "p1",
  title: "Handle",
  room: "Kitchen",
  description: "Loose",
  photoId: "",
  authorId: owner(s).id,
  assigneeId: "",
  due: "2026-10-15",
  status: "Open",
  resolution: "",
  completionPhotoId: "",
  clientVisible: true,
});
describe("Project templates", () => {
  for (const t of projectTemplates)
    it(`${t.name} schedules every task inside the project`, () => {
      const tasks = templateTasks(
        t.id,
        { id: "new", start: "2026-12-27", end: "2027-02-02" },
        "owner",
      );
      expect(tasks).toHaveLength(t.tasks.length);
      expect(new Set(tasks.map((x) => x.id)).size).toBe(tasks.length);
      expect(
        tasks.every(
          (x) =>
            x.projectId === "new" &&
            x.assigneeId === "owner" &&
            x.status === "To do" &&
            x.due >= "2026-12-27" &&
            x.due <= "2027-02-02",
        ),
      ).toBe(true);
      expect(tasks.map((x) => x.due)).toEqual(tasks.map((x) => x.due).sort());
    });
  it("supports one-day projects and rejects reversed dates or unknown templates", () => {
    expect(
      templateTasks(
        "basic",
        { id: "p", start: "2026-10-12", end: "2026-10-12" },
        "o",
      ).every((t) => t.due === "2026-10-12"),
    ).toBe(true);
    expect(() =>
      templateTasks(
        "unknown",
        { id: "p", start: "2026-10-12", end: "2026-10-12" },
        "o",
      ),
    ).toThrow();
    expect(() =>
      templateTasks(
        "basic",
        { id: "p", start: "2026-10-12", end: "2026-10-01" },
        "o",
      ),
    ).toThrow();
  });
});
describe("Budget and payment correctness", () => {
  it("counts only approved extras and client income, with exact paise", () => {
    const s = demoStudio();
    s.projectBudgets = [
      {
        id: "p1",
        projectId: "p1",
        contractValue: 1000.05,
        costBudget: 700,
        quotationRef: "Q1",
      },
    ];
    s.changeOrders = [
      {
        ...selection(s),
        description: "Extra",
        amount: 100.01,
        extraDays: 2,
        status: "Approved",
      },
      {
        ...selection(s),
        id: "pending",
        description: "Extra",
        amount: 500,
        extraDays: 5,
      },
    ] as ChangeOrder[];
    s.payments = [
      {
        id: "r",
        projectId: "p1",
        description: "Client",
        type: "Received",
        amount: 100.01,
        date: "2026-10-12",
        categoryId: "inc-client",
      },
      {
        id: "cap",
        projectId: "p1",
        description: "Capital",
        type: "Received",
        amount: 5000,
        date: "2026-10-12",
        categoryId: "inc-capital",
      },
      {
        id: "e",
        projectId: "p1",
        description: "Cost",
        type: "Spent",
        amount: 800.02,
        date: "2026-10-12",
      },
    ];
    expect(budgetSummary(s, "p1")).toMatchObject({
      contract: 1100.06,
      received: 100.01,
      spent: 800.02,
      remaining: 1000.05,
      forecastMargin: 400.06,
      overBudget: 100.02,
      extraDays: 2,
    });
    expect(budgetSummary(s, "p2").configured).toBe(false);
  });
  it("updates a linked receipt, relinks and unlinks without duplicate income", () => {
    let s = demoStudio();
    s.payments = [];
    s.paymentSchedules = ["a", "b"].map((id) => ({
      id,
      projectId: "p1",
      title: id,
      amount: 500,
      received: 0,
      due: "2026-10-12",
      clientVisible: true,
    }));
    let p: StudioPayment = {
      id: "payment",
      projectId: "p1",
      type: "Received",
      description: "Advance",
      amount: 100.01,
      date: "2026-10-12",
      milestoneId: "a",
    };
    s = applyProjectPayment(s, p);
    s = applyProjectPayment(s, { ...p, amount: 120.02 });
    expect(s.payments).toHaveLength(1);
    expect(s.paymentSchedules![0].received).toBe(120.02);
    s = applyProjectPayment(s, { ...p, milestoneId: "b", amount: 90.01 });
    expect(s.paymentSchedules!.map((x) => x.received)).toEqual([0, 90.01]);
    const { milestoneId, ...unlinked } = p;
    s = applyProjectPayment(s, unlinked);
    expect(s.paymentSchedules!.map((x) => x.received)).toEqual([0, 0]);
    expect(s.payments).toHaveLength(1);
    expect(() => applyProjectPayment(s, { ...p, projectId: "p2" })).toThrow();
    expect(() =>
      applyProjectPayment(s, { ...p, id: "expense", type: "Spent" }),
    ).toThrow();
    expect(() =>
      applyProjectPayment(s, { ...p, milestoneId: "missing" }),
    ).toThrow();
    expect(outstanding({ ...s.paymentSchedules![0], received: 600 })).toBe(0);
  });
});
describe("Decisions, versions and delivery workflow", () => {
  it("records reviewer decisions once and rejects reassignment during review", () => {
    let s = demoStudio(),
      r = selection(s),
      client = s.members.find((m) => m.role === "client")!;
    s = applyOperation(s, "selections", r, owner(s));
    expect(() =>
      applyOperation(s, "selections", { ...r, status: "Approved" }, owner(s)),
    ).toThrow();
    expect(() =>
      applyOperation(
        s,
        "selections",
        { ...r, status: "Changes requested" },
        client,
      ),
    ).toThrow();
    s = applyOperation(
      s,
      "selections",
      { ...r, status: "Approved", title: "Tampered" },
      client,
    );
    expect(s.selections![0].title).toBe("Laminate");
    expect(() =>
      applyOperation(s, "selections", { ...r, status: "Approved" }, client),
    ).toThrow();
  });
  it("allocates drawing versions and supersedes the previous approval", () => {
    let s = demoStudio();
    s = applyOperation(s, "drawings", drawing(s), owner(s));
    s = applyOperation(
      s,
      "drawings",
      { ...s.drawings![0], status: "Approved", clientVisible: true },
      owner(s),
    );
    s = applyOperation(s, "drawings", drawing(s, "drawing2"), owner(s));
    expect(s.drawings![0].version).toBe(2);
    s = applyOperation(
      s,
      "drawings",
      { ...s.drawings![0], status: "Approved", clientVisible: true },
      owner(s),
    );
    expect(s.drawings!.filter((d) => d.status === "Approved")).toHaveLength(1);
    expect(s.drawings!.find((d) => d.id === "drawing")!.status).toBe(
      "Superseded",
    );
    expect(s.drawingHeads![0].currentId).toBe("drawing2");
    expect(drawingGroup("Kitchen ", "LAYOUT")).toBe(
      drawingGroup("kitchen", "layout"),
    );
    for (const url of [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "invalid",
    ])
      expect(safeDrawingLink(url)).toBe(false);
  });
  it("aggregates material receipts across orders and protects supplier prices", () => {
    let s = demoStudio();
    s.materials = [
      {
        id: "mat",
        projectId: "p1",
        name: "Plywood",
        quantity: 20,
        unit: "Sheets",
        status: "To order",
        notes: "",
      },
    ];
    s = applyOperation(s, "purchaseOrders", order(s, "a", "mat"), owner(s));
    s = applyOperation(s, "purchaseOrders", order(s, "b", "mat"), owner(s));
    const supervisor = s.members.find((m) => m.role === "supervisor")!;
    s = applyOperation(
      s,
      "purchaseOrders",
      {
        ...s.purchaseOrders!.find((x) => x.id === "a")!,
        receivedQuantity: 10,
        unitRate: 0,
      },
      supervisor,
    );
    expect(s.materials[0].status).toBe("Ordered");
    expect(s.purchaseOrders!.find((x) => x.id === "a")!.unitRate).toBe(100);
    s = applyOperation(
      s,
      "purchaseOrders",
      { ...s.purchaseOrders!.find((x) => x.id === "b")!, receivedQuantity: 10 },
      supervisor,
    );
    expect(s.materials[0].status).toBe("On site");
    expect(() =>
      applyOperation(
        s,
        "purchaseOrders",
        { ...s.purchaseOrders![0], receivedQuantity: 11 },
        supervisor,
      ),
    ).toThrow();
    expect(() =>
      applyOperation(
        s,
        "purchaseOrders",
        { ...s.purchaseOrders![0], receivedQuantity: 1 },
        supervisor,
      ),
    ).toThrow();
    expect(() =>
      applyOperation(s, "purchaseOrders", order(s, "new"), supervisor),
    ).toThrow();
    expect(s.payments).toEqual(demoStudio().payments);
  });
  it("requires a repair and independent verification before handover", () => {
    let s = demoStudio();
    const o = owner(s),
      supervisor = s.members.find((m) => m.role === "supervisor")!;
    s = applyOperation(s, "snags", snag(s), o);
    const handover = {
      id: "p1",
      projectId: "p1",
      checks: [true, true, true, true, true],
      date: "2026-10-12",
      notes: "",
      completed: true,
      clientVisible: true,
    };
    expect(() => applyOperation(s, "handovers", handover, o)).toThrow();
    expect(() =>
      applyOperation(
        s,
        "snags",
        { ...s.snags![0], status: "Ready for check" },
        supervisor,
      ),
    ).toThrow();
    s = applyOperation(
      s,
      "snags",
      {
        ...s.snags![0],
        status: "Ready for check",
        resolution: "Handle tightened",
      },
      supervisor,
    );
    expect(() =>
      applyOperation(
        s,
        "snags",
        { ...s.snags![0], status: "Resolved" },
        supervisor,
      ),
    ).toThrow();
    s = applyOperation(s, "snags", { ...s.snags![0], status: "Resolved" }, o);
    expect(canFinishHandover(s.snags!, [true, true, false, true, true])).toBe(
      false,
    );
    s = applyOperation(s, "handovers", handover, o);
    expect(() =>
      applyOperation(s, "handovers", { ...handover, completed: false }, o),
    ).toThrow();
  });
  it("accepts zero budgets and rejects invalid numeric values", () => {
    expect(() =>
      validateOperation("projectBudgets", {
        id: "p1",
        projectId: "p1",
        contractValue: 0,
        costBudget: 0,
        quotationRef: "",
      }),
    ).not.toThrow();
    expect(() =>
      validateOperation("purchaseOrders", {
        ...order(demoStudio()),
        receivedQuantity: NaN,
      }),
    ).toThrow();
  });
});
describe("New collection privacy", () => {
  it("hides costs from staff and unpublished project records from clients", () => {
    const s = demoStudio();
    s.projectBudgets = [
      {
        id: "p1",
        projectId: "p1",
        contractValue: 100,
        costBudget: 50,
        quotationRef: "",
      },
    ];
    s.paymentSchedules = [
      {
        id: "m",
        projectId: "p1",
        title: "Advance",
        amount: 100,
        received: 0,
        due: "2026-10-12",
        clientVisible: true,
      },
    ];
    s.changeOrders = [
      {
        ...selection(s),
        description: "Extra",
        amount: 10,
        extraDays: 1,
      } as ChangeOrder,
    ];
    s.selections = [
      selection(s),
      { ...selection(s), id: "internal", clientVisible: false },
      { ...selection(s), id: "other", projectId: "p3" },
    ];
    s.drawings = [drawing(s)];
    s.purchaseOrders = [order(s)];
    s.snags = [snag(s)];
    const client = scopedStudio(
        s,
        s.members.find((m) => m.role === "client")!,
      ),
      staff = scopedStudio(
        s,
        s.members.find((m) => m.role === "supervisor")!,
      );
    expect(client.projectBudgets).toEqual([]);
    expect(client.purchaseOrders).toEqual([]);
    expect(client.drawings).toEqual([]);
    expect(client.selections!.map((x) => x.id)).toEqual(["selection"]);
    expect(client.paymentSchedules).toHaveLength(1);
    expect(client.changeOrders).toHaveLength(1);
    expect(staff.changeOrders).toEqual([]);
    expect(staff.paymentSchedules).toEqual([]);
    expect(staff.projectBudgets).toEqual([]);
    const paused = scopedStudio(s, { ...owner(s), active: false });
    expect(paused.selections).toEqual([]);
    expect(paused.snags).toEqual([]);
  });
});
