import type {
  CashOpening,
  MoneyCategory,
  StudioPayment,
  StudioProject,
} from "./studio-model";

export function formatMoney(value: number, compact = true) {
  if (compact && Math.abs(value) >= 100000)
    return `${value < 0 ? "−" : ""}₹ ${(Math.abs(value) / 100000).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const paymentModes = [
  "Bank transfer",
  "UPI",
  "Cash",
  "Cheque",
  "Other",
  "Unspecified",
] as const;
export const categoryColors = [
  "#4f46e5",
  "#dc2626",
  "#d97706",
  "#059669",
  "#0284c7",
  "#9333ea",
  "#db2777",
  "#475569",
];
export const defaultCategories: MoneyCategory[] = [
  ["inc-client", "Client payments", "Received", "#059669"],
  ["inc-capital", "Owner contribution", "Received", "#0284c7"],
  ["inc-other", "Other income", "Received", "#4f46e5"],
  ["exp-materials", "Materials", "Spent", "#dc2626"],
  ["exp-labour", "Labour payments", "Spent", "#4f46e5"],
  ["exp-salaries", "Salaries", "Spent", "#059669"],
  ["exp-transport", "Transportation", "Spent", "#d97706"],
  ["exp-electrical", "Electrical materials", "Spent", "#0284c7"],
  ["exp-food", "Food & site welfare", "Spent", "#9333ea"],
  ["exp-other", "Other expenses", "Spent", "#475569"],
].map(([id, name, type, color]) => ({
  id,
  name,
  type: type as StudioPayment["type"],
  color,
  active: true,
}));
export function categoriesFor(custom: MoneyCategory[] = []) {
  const merged = new Map(defaultCategories.map((c) => [c.id, c]));
  custom.forEach((c) => merged.set(c.id, c));
  return [...merged.values()];
}
export const paymentCategory = (p: StudioPayment) =>
  p.categoryId || (p.type === "Spent" ? "exp-other" : "inc-client");
export const cents = (n: number) => Math.round(n * 100);
export function validAmount(value: string, allowZero = false) {
  if (
    !/^\d{1,10}(\.\d{1,2})?$/.test(value) ||
    !Number.isFinite(Number(value)) ||
    Number(value) > 1_000_000_000 ||
    (allowZero ? Number(value) < 0 : Number(value) <= 0)
  )
    throw new Error(
      allowZero
        ? "Enter an amount from 0 to 1,00,00,00,000 with up to two decimal places."
        : "Enter a positive amount with up to two decimal places (maximum 1,00,00,00,000).",
    );
  return Number(value);
}
export function validDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose a valid date.");
  return value;
}
export function filterPayments(
  payments: StudioPayment[],
  projectId: string,
  month: string,
  type = "All",
  categoryId = "",
  query = "",
) {
  const needle = query.trim().toLowerCase();
  return payments
    .filter(
      (p) =>
        (!projectId || p.projectId === projectId) &&
        (!month || p.date.startsWith(month + "-")) &&
        (type === "All" || p.type === type) &&
        (!categoryId || paymentCategory(p) === categoryId) &&
        p.description.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function paymentTotals(payments: StudioPayment[]) {
  const income = payments
    .filter((p) => p.type === "Received")
    .reduce((n, p) => n + cents(p.amount), 0);
  const expenses = payments
    .filter((p) => p.type === "Spent")
    .reduce((n, p) => n + cents(p.amount), 0);
  return {
    income: income / 100,
    expenses: expenses / 100,
    net: (income - expenses) / 100,
  };
}
export function expenseBreakdown(
  payments: StudioPayment[],
  categories: MoneyCategory[],
) {
  const totals = new Map<string, number>();
  payments
    .filter((p) => p.type === "Spent")
    .forEach((p) => {
      const id = paymentCategory(p);
      totals.set(id, (totals.get(id) || 0) + cents(p.amount));
    });
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals]
    .map(([id, value]) => ({
      id,
      name: categories.find((c) => c.id === id)?.name || "Uncategorized",
      color: categories.find((c) => c.id === id)?.color || "#475569",
      amount: value / 100,
      share: total ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}
export function monthEnd(month: string) {
  if (!month) return "9999-12-31";
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`;
}
// Opening cash is the balance before transactions on its date. Bank/UPI never enter cash on hand.
export function cashBalance(
  payments: StudioPayment[],
  openings: CashOpening[],
  projectIds: string[],
  through: string,
  combined = false,
) {
  let total = 0;
  let missing = 0;
  projectIds.forEach((id) => {
    const opening = openings.find(
      (o) => o.projectId === id && o.date <= through,
    );
    if (!opening) {
      missing++;
      return;
    }
    total += cents(opening.amount);
    payments
      .filter(
        (p) =>
          p.projectId === id &&
          p.date >= opening.date &&
          p.date <= through &&
          (combined || p.mode === "Cash"),
      )
      .forEach((p) => {
        total += cents(p.amount) * (p.type === "Received" ? 1 : -1);
      });
  });
  return { amount: total / 100, missing };
}
export function availableBalance(
  payments: StudioPayment[],
  openings: CashOpening[],
  projectIds: string[],
  through: string,
) {
  let total = 0;
  let assumed = 0;
  projectIds.forEach((id) => {
    const opening = openings.find(
      (o) => o.projectId === id && o.date <= through,
    );
    if (!opening) assumed++;
    total += cents(opening?.amount || 0);
    payments
      .filter(
        (p) =>
          p.projectId === id &&
          p.date >= (opening?.date || "") &&
          p.date <= through,
      )
      .forEach((p) => {
        total += cents(p.amount) * (p.type === "Received" ? 1 : -1);
      });
  });
  return { amount: total / 100, assumed };
}

export function receiptMessage(
  studio: string,
  project: StudioProject,
  p: StudioPayment,
) {
  if (p.type !== "Received" || p.projectId !== project.id)
    throw new Error("Only received payments can be shared as a receipt.");
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(p.amount);
  return `Hello ${project.clientName || "there"},\n\nWe have recorded your payment of ${amount} for ${project.name}.\nDate: ${p.date}\nPayment method: ${p.mode || "Not recorded"}\nDetails: ${p.description}\nReference: ${p.id}\n\nThank you,\n${studio}`;
}
export const receiptWhatsAppUrl = (message: string) =>
  `https://wa.me/?text=${encodeURIComponent(message)}`;
