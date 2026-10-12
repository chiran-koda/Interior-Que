import { describe, expect, it } from "vitest";
import {
  availableBalance,
  cashBalance,
  categoriesFor,
  expenseBreakdown,
  filterPayments,
  formatMoney,
  monthEnd,
  paymentTotals,
  receiptMessage,
  receiptWhatsAppUrl,
  validAmount,
  validDate,
} from "./money";
import { demoStudio, scopedStudio, type StudioPayment } from "./studio-model";
const payments: StudioPayment[] = [
  {
    id: "a",
    projectId: "p1",
    description: "Advance & deposit",
    amount: 100.15,
    date: "2026-09-01",
    type: "Received",
    mode: "Cash",
    categoryId: "inc-client",
  },
  {
    id: "b",
    projectId: "p1",
    description: "Plywood",
    amount: 30.05,
    date: "2026-09-15",
    type: "Spent",
    mode: "Cash",
    categoryId: "exp-materials",
  },
  {
    id: "c",
    projectId: "p1",
    description: "UPI installment",
    amount: 50,
    date: "2026-09-20",
    type: "Received",
    mode: "UPI",
  },
  {
    id: "d",
    projectId: "p2",
    description: "Labour",
    amount: 80,
    date: "2026-09-25",
    type: "Spent",
    mode: "Bank transfer",
    categoryId: "exp-labour",
  },
  {
    id: "e",
    projectId: "p1",
    description: "October painting",
    amount: 10,
    date: "2026-10-01",
    type: "Spent",
  },
];
describe("money journal and calculations", () => {
  it("combines every payment method and declares the zero-opening assumption", () => {
    expect(availableBalance(payments, [], ["p1"], "2026-09-30")).toEqual({
      amount: 120.1,
      assumed: 1,
    });
    expect(availableBalance(payments, [], ["p1"], "2026-10-31")).toEqual({
      amount: 110.1,
      assumed: 1,
    });
    expect(
      availableBalance(
        payments,
        [{ id: "p1", projectId: "p1", amount: 10, date: "2026-09-01" }],
        ["p1", "p2"],
        "2026-09-30",
      ),
    ).toEqual({ amount: 50.1, assumed: 1 });
  });
  it("includes earlier periods, respects the opening date and omits future transactions", () => {
    const history = [
      ...payments,
      { ...payments[0], id: "older", date: "2026-08-01", amount: 25 },
    ];
    expect(availableBalance(history, [], ["p1"], "2026-09-30").amount).toBe(
      145.1,
    );
    expect(
      availableBalance(
        history,
        [{ id: "p1", projectId: "p1", amount: 100, date: "2026-09-15" }],
        ["p1"],
        "2026-09-30",
      ),
    ).toEqual({ amount: 119.95, assumed: 0 });
  });
  it("shows paise instead of rounding away financial amounts", () => {
    expect(formatMoney(100.15, false)).toContain("100.15");
    expect(formatMoney(-125.5, false)).toContain("125.50");
  });
  it("uses project and month together and does not change all-time data", () => {
    const selected = filterPayments(payments, "p1", "2026-09");
    expect(selected).toHaveLength(3);
    expect(paymentTotals(selected)).toEqual({
      income: 150.15,
      expenses: 30.05,
      net: 120.1,
    });
    expect(payments).toHaveLength(5);
    expect(filterPayments(payments, "p1", "2026-08")).toEqual([]);
  });
  it("filters the journal by type, category and search", () => {
    expect(
      filterPayments(
        payments,
        "",
        "2026-09",
        "Spent",
        "exp-materials",
        "ply",
      ).map((p) => p.id),
    ).toEqual(["b"]);
    expect(
      filterPayments(payments, "", "", "Received", "inc-client"),
    ).toHaveLength(2);
  });
  it("keeps category rename/archive history and groups unclassified legacy expenses", () => {
    const categories = categoriesFor([
      {
        id: "exp-materials",
        name: "Boards",
        type: "Spent",
        active: false,
        color: "#dc2626",
      },
    ]);
    const breakdown = expenseBreakdown(payments, categories);
    expect(breakdown.find((c) => c.id === "exp-materials")?.name).toBe(
      "Boards",
    );
    expect(breakdown.find((c) => c.id === "exp-other")?.amount).toBe(10);
    expect(breakdown.reduce((n, c) => n + c.share, 0)).toBeCloseTo(100);
  });
  it("uses cash opening dates and excludes bank, UPI, unknown methods and later months", () => {
    const openings = [
      { id: "p1", projectId: "p1", amount: 10, date: "2026-09-01" },
    ];
    expect(
      cashBalance(payments, openings, ["p1"], monthEnd("2026-09")),
    ).toEqual({ amount: 80.1, missing: 0 });
    expect(
      cashBalance(payments, openings, ["p1", "p2"], monthEnd("2026-09")),
    ).toEqual({ amount: 80.1, missing: 1 });
    expect(
      cashBalance(
        payments,
        [{ ...openings[0], date: "2026-10-01" }],
        ["p1"],
        monthEnd("2026-09"),
      ),
    ).toEqual({ amount: 0, missing: 1 });
  });
  it("does not double-count a transaction after editing it", () => {
    const updated = payments.map((p) =>
      p.id === "b" ? { ...p, amount: 20.05 } : p,
    );
    expect(
      cashBalance(
        updated,
        [{ id: "p1", projectId: "p1", amount: 10, date: "2026-09-01" }],
        ["p1"],
        "2026-09-30",
      ).amount,
    ).toBe(90.1);
  });
  it("requires valid monetary amounts and calendar dates", () => {
    for (const invalid of [
      "NaN",
      "Infinity",
      "-5",
      "0",
      "1.001",
      "1e3",
      "1000000001",
    ])
      expect(() => validAmount(invalid)).toThrow();
    expect(validAmount("0", true)).toBe(0);
    expect(validAmount("12.05")).toBe(12.05);
    expect(() => validDate("2026-02-31")).toThrow();
    expect(validDate("2024-02-29")).toBe("2024-02-29");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
  });
  it("prepares an encoded WhatsApp draft only for a receipt's project", () => {
    const project = {
      ...demoStudio().projects[0],
      id: "p1",
      clientName: "Ramesh",
    };
    const text = receiptMessage("Que Studio", project, payments[0]);
    expect(text).toContain("₹100.15");
    expect(text).toContain("Ramesh");
    expect(new URL(receiptWhatsAppUrl(text)).searchParams.get("text")).toBe(
      text,
    );
    expect(() => receiptMessage("Que", project, payments[1])).toThrow();
    expect(() =>
      receiptMessage("Que", { ...project, id: "p2" }, payments[0]),
    ).toThrow();
  });
  it("keeps financial configuration hidden from staff, clients and paused members", () => {
    const data = demoStudio();
    data.cashOpenings = [
      { id: "p1", projectId: "p1", amount: 500, date: "2026-09-01" },
    ];
    data.moneyCategories = categoriesFor();
    data.balanceOpenings = [
      { id: "p1", projectId: "p1", amount: 1000, date: "2026-09-01" },
    ];
    for (const member of data.members.filter((m) => m.role !== "owner")) {
      expect(scopedStudio(data, member).cashOpenings).toEqual([]);
      expect(scopedStudio(data, member).moneyCategories).toEqual([]);
      expect(scopedStudio(data, member).balanceOpenings).toEqual([]);
    }
  });
});
