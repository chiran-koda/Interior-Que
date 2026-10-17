import { useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Plus,
  Pencil,
  MessageCircle,
  Tags,
  Search,
  CalendarDays,
  Download,
  FileText,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Button, Empty, Field, Modal } from "./components";
import { today, uid, dateLabel } from "./model";
import {
  categoriesFor,
  resolveTransactionCategory,
  formatMoney as money,
  categoryColors,
  availableBalance,
  expenseBreakdown,
  filterPayments,
  monthEnd,
  paymentCategory,
  paymentModes,
  paymentTotals,
  receiptMessage,
  receiptWhatsAppUrl,
  validAmount,
  validDate,
} from "./money";
import type {
  CashOpening,
  MoneyCategory,
  StudioData,
  StudioPayment,
} from "./studio-model";
import "./money.css";
import { MoneyCategoryPicker } from "./MoneyCategoryPicker";
import type { StudioProject } from "./studio-model";

interface Props {
  data: StudioData;
  query: string;
  busy: boolean;
  onSave: (payment: StudioPayment) => Promise<boolean>;
  onCategory: (category: MoneyCategory) => Promise<boolean>;
  onOpening: (opening: CashOpening) => Promise<boolean>;
}
export function MoneyWorkspace({
  data,
  query,
  busy,
  onSave,
  onCategory,
  onOpening,
}: Props) {
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() =>
    (
      data.payments
        .map((p) => p.date)
        .filter((d) => d <= today())
        .sort()
        .at(-1) || today()
    ).slice(0, 7),
  );
  const [type, setType] = useState("All");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [editing, setEditing] = useState<StudioPayment | "new" | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [openingDialog, setOpeningDialog] = useState(false);
  const [receipt, setReceipt] = useState<StudioPayment | null>(null);
  const categories = categoriesFor(data.moneyCategories);
  // Project + month drive all cards/charts. Search/type/category refine only the journal.
  const period = filterPayments(data.payments, projectId, month);
  const rows = filterPayments(period, "", "", type, categoryId, search).filter(
    (p) => p.description.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const totals = paymentTotals(period);
  const breakdown = expenseBreakdown(period, categories);
  const balance = availableBalance(
    data.payments,
    data.balanceOpenings || [],
    data.projects
      .filter((p) => !projectId || p.id === projectId)
      .map((p) => p.id),
    monthEnd(month),
  );
  const monthLabel = month
    ? new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      })
    : "All time";
  const project = data.projects.find((p) => p.id === receipt?.projectId);
  const reset = () => setLimit(20);
  return (
    <div className="money-workspace">
      <div className="money-toolbar">
        <label>
          <CalendarDays size={17} />
          <span className="sr-only">Money month</span>
          <input
            aria-label="Money month"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              reset();
            }}
          />
        </label>
        <select
          aria-label="Money project"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            reset();
          }}
        >
          <option value="">All projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button
          onClick={() => {
            setMonth("");
            reset();
          }}
        >
          All time
        </Button>
        <div className="money-toolbar-actions">
          <Button onClick={() => setCategoryDialog(true)}>
            <Tags size={16} />
            Categories
          </Button>
          <Button
            variant="primary"
            onClick={() => setEditing("new")}
            disabled={!data.projects.length || busy}
          >
            <Plus size={17} />
            Record transaction
          </Button>
        </div>
      </div>
      <div className="money-period">
        <span>
          {projectId
            ? data.projects.find((p) => p.id === projectId)?.name
            : "Across all projects"}{" "}
          · {monthLabel}
        </span>
        <span>{period.length} transactions</span>
      </div>
      <div className="money-cards">
        {[
          {
            label: "Total income",
            value: totals.income,
            detail: "Payments received in this period",
            Icon: ArrowDownLeft,
            tone: "income",
          },
          {
            label: "Total expenses",
            value: totals.expenses,
            detail: "Recorded spending in this period",
            Icon: ArrowUpRight,
            tone: "expense",
          },
          {
            label: "Net total",
            value: totals.net,
            detail: "Income minus expenses",
            Icon: Wallet,
            tone: totals.net < 0 ? "expense" : "net",
          },
        ].map((c) => (
          <article className={`money-card ${c.tone}`} key={c.label}>
            <span className="money-card-icon">
              <c.Icon size={22} />
            </span>
            <div>
              <span>{c.label}</span>
              <strong>{money(c.value, false)}</strong>
              <small>{c.detail}</small>
            </div>
          </article>
        ))}
        <article className="money-card cash">
          <span className="money-card-icon">
            <Wallet size={22} />
          </span>
          <div>
            <span>Combined balance</span>
            <strong>{money(balance.amount, false)}</strong>
            <small>
              All payment methods ·{" "}
              {month ? "at month end" : "all recorded dates"}
            </small>
            {balance.assumed > 0 && (
              <small>
                ₹0 opening assumed for {balance.assumed} project
                {balance.assumed === 1 ? "" : "s"}.
              </small>
            )}
            <button
              className="money-text-button"
              onClick={() => setOpeningDialog(true)}
              disabled={!data.projects.length}
            >
              Opening balance <Pencil size={12} />
            </button>
          </div>
        </article>
      </div>
      <div className="money-charts">
        <section className="studio-panel money-chart">
          <div className="money-section-heading">
            <div>
              <h2>Expense overview</h2>
              <p>
                {monthLabel} · {breakdown.length} categories
              </p>
            </div>
          </div>
          {breakdown.length ? (
            <div className="money-donut-layout">
              <div
                className="money-donut"
                role="img"
                aria-label={`Expense distribution, total ${money(totals.expenses, false)}. The amounts are listed alongside.`}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={76}
                      outerRadius={108}
                      stroke="white"
                      strokeWidth={3}
                    >
                      {breakdown.map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => money(Number(value), false)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="money-donut-center">
                  <strong>{money(totals.expenses)}</strong>
                  <small>Total expenses</small>
                </div>
              </div>
              <div className="money-chart-legend">
                {breakdown.map((c) => (
                  <div key={c.id}>
                    <i style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <b>{money(c.amount, false)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              title="No expenses in this period"
              text="Record an expense or choose a different month or project."
            />
          )}
        </section>
        <section className="studio-panel money-chart">
          <div className="money-section-heading">
            <div>
              <h2>Expenses by category</h2>
              <p>See where your project money goes.</p>
            </div>
            <Button onClick={() => setCategoryDialog(true)}>
              <Pencil size={14} />
              Edit categories
            </Button>
          </div>
          {breakdown.length ? (
            <div className="money-category-bars">
              {breakdown.map((c) => (
                <div className="money-category-bar" key={c.id}>
                  <div>
                    <i style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <b>{money(c.amount, false)}</b>
                  </div>
                  <div>
                    <span className="money-bar-track">
                      <span
                        style={{ width: `${c.share}%`, background: c.color }}
                      />
                    </span>
                    <small>{c.share.toFixed(1)}%</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your breakdown will appear here"
              text="Expenses are grouped by the categories you choose."
            />
          )}
        </section>
      </div>
      <section className="studio-panel money-journal">
        <div className="money-section-heading">
          <div>
            <h2>Transactions</h2>
            <p>Edit a record or share a payment receipt with your client.</p>
          </div>
        </div>
        <div className="money-journal-filters">
          <label>
            <Search size={16} />
            <input
              aria-label="Search money transactions"
              placeholder="Search transactions…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                reset();
              }}
            />
          </label>
          <select
            aria-label="Transaction type filter"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setCategoryId("");
              reset();
            }}
          >
            <option value="All">Income & expenses</option>
            <option value="Received">Income</option>
            <option value="Spent">Expenses</option>
          </select>
          <select
            aria-label="Transaction category filter"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              reset();
            }}
          >
            <option value="">All categories</option>
            {categories
              .filter((c) => type === "All" || c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (archived)"}
                </option>
              ))}
          </select>
        </div>
        {rows.length ? (
          <>
            <div className="money-table-scroll">
              <table className="money-table">
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Description",
                      "Category",
                      "Type",
                      "Project",
                      "Method",
                      "Amount",
                      "Actions",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((p) => (
                    <tr key={p.id}>
                      <td>{dateLabel(p.date)}</td>
                      <td>
                        <b>{p.description}</b>
                      </td>
                      <td>
                        <span className="money-category-tag">
                          <i
                            style={{
                              background:
                                categories.find(
                                  (c) => c.id === paymentCategory(p),
                                )?.color || "#475569",
                            }}
                          />
                          {categories.find((c) => c.id === paymentCategory(p))
                            ?.name || "Uncategorized"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`money-type ${p.type === "Received" ? "income" : "expense"}`}
                        >
                          {p.type === "Received" ? "Income" : "Expense"}
                        </span>
                      </td>
                      <td>
                        {data.projects.find(
                          (project) => project.id === p.projectId,
                        )?.name || "Project unavailable"}
                      </td>
                      <td>{p.mode || "Not recorded"}</td>
                      <td
                        className={
                          p.type === "Received"
                            ? "money-income"
                            : "money-expense"
                        }
                      >
                        {money(p.amount, false)}
                      </td>
                      <td>
                        <div className="money-row-actions">
                          <button
                            className="icon-btn"
                            aria-label={`Edit ${p.description}`}
                            disabled={busy}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil size={16} />
                          </button>
                          {p.type === "Received" && (
                            <button
                              className="icon-btn"
                              aria-label={`Receipt for ${p.description}`}
                              onClick={() => setReceipt(p)}
                            >
                              <FileText size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="money-table-footer">
              <span>
                Showing {Math.min(limit, rows.length)} of {rows.length} ·
                Filtered net {money(paymentTotals(rows).net, false)}
              </span>
              {limit < rows.length && (
                <Button onClick={() => setLimit(limit + 20)}>Show more</Button>
              )}
            </div>
          </>
        ) : (
          <Empty
            title={
              data.payments.length
                ? "No matching transactions"
                : "Record your first transaction"
            }
            text={
              data.payments.length
                ? "Try a different month, project or search."
                : "Start with a payment received or a project expense."
            }
          />
        )}
      </section>
      {editing && (
        <PaymentEditor
          key={typeof editing === "string" ? "new" : editing.id}
          record={typeof editing === "string" ? undefined : editing}
          projectId={projectId}
          data={data}
          categories={categories}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onCategory={onCategory}
        />
      )}
      {categoryDialog && (
        <CategoryManager
          categories={categories}
          busy={busy}
          onClose={() => setCategoryDialog(false)}
          onSave={onCategory}
        />
      )}
      {openingDialog && (
        <OpeningEditor
          data={data}
          projectId={projectId}
          busy={busy}
          onClose={() => setOpeningDialog(false)}
          onSave={onOpening}
        />
      )}
      {receipt && project && (
        <PaymentReceipt
          studio={data.name}
          project={project}
          payment={receipt}
          category={
            categories.find((c) => c.id === paymentCategory(receipt))?.name
          }
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

function PaymentReceipt({
  studio,
  project,
  payment,
  category,
  onClose,
}: {
  studio: string;
  project: StudioProject;
  payment: StudioPayment;
  category?: string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const download = async () => {
    if (lock.current) return;
    lock.current = true;
    setDownloading(true);
    setError("");
    try {
      const { downloadPaymentReceipt } = await import("./payment-receipt");
      await downloadPaymentReceipt(studio, project, payment, category);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The PDF could not be prepared. Please try again.",
      );
    } finally {
      lock.current = false;
      setDownloading(false);
    }
  };
  return (
    <Modal
      title="Payment receipt"
      subtitle="Download a PDF or review the message before opening WhatsApp."
      onClose={() => {
        if (!lock.current) onClose();
      }}
      closeDisabled={downloading}
    >
      <div className="money-receipt-preview">
        {receiptMessage(studio, project, payment)}
      </div>
      <p className="money-share-hint">
        Download the PDF to keep a copy or attach it in WhatsApp. Choose your
        client and send the message yourself.
      </p>
      {error && (
        <p className="studio-error money-receipt-error" role="alert">
          {error}
        </p>
      )}
      <div className="money-modal-actions">
        <Button disabled={downloading} onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" disabled={downloading} onClick={download}>
          <Download size={17} />
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </Button>
        <a
          className="btn secondary"
          href={receiptWhatsAppUrl(receiptMessage(studio, project, payment))}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={17} />
          Open WhatsApp
        </a>
      </div>
    </Modal>
  );
}

function PaymentEditor({
  record,
  projectId,
  data,
  categories,
  busy,
  onClose,
  onSave,
  onCategory,
}: {
  record?: StudioPayment;
  projectId: string;
  data: StudioData;
  categories: MoneyCategory[];
  busy: boolean;
  onClose: () => void;
  onSave: Props["onSave"];
  onCategory: Props["onCategory"];
}) {
  const [type, setType] = useState<StudioPayment["type"]>(
    record?.type || "Received",
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false),
    proposedCategory = useRef<MoneyCategory | null>(null);
  const [id] = useState(record?.id || uid());
  const [selectedProjectId, setSelectedProjectId] = useState(
    record?.projectId || projectId || data.projects[0]?.id || "",
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lock.current || busy) return;
    setError("");
    const fd = new FormData(e.currentTarget),
      f = (key: string) => String(fd.get(key) || "").trim();
    try {
      const amount = validAmount(f("amount"));
      const description = f("description");
      if (!description || description.length > 500)
        throw new Error("Add a description of up to 500 characters.");
      const selectedProject = record?.projectId || f("projectId");
      if (!data.projects.some((p) => p.id === selectedProject))
        throw new Error("Choose an available project.");
      const resolved = resolveTransactionCategory(
        categories,
        type,
        f("categoryName"),
        record ? paymentCategory(record) : "",
      );
      const mode = f("mode") as StudioPayment["mode"];
      if (!paymentModes.includes(mode!))
        throw new Error("Choose a payment method.");
      const milestoneId = type === "Received" ? f("milestoneId") : "";
      if (
        milestoneId &&
        !data.paymentSchedules?.some(
          (s) => s.id === milestoneId && s.projectId === selectedProject,
        )
      )
        throw new Error("Choose a milestone from this project.");
      const date = validDate(f("date"));
      lock.current = true;
      setSubmitting(true);
      let category = resolved.category;
      if (!category) {
        if (
          !proposedCategory.current ||
          proposedCategory.current.name !== resolved.name ||
          proposedCategory.current.type !== type
        )
          proposedCategory.current = {
            id: uid(),
            name: resolved.name,
            type,
            color: categoryColors[0],
            active: true,
          };
        category = proposedCategory.current;
        if (!(await onCategory(category)))
          throw new Error(
            "The new category could not be saved. Your transaction has not been saved; retry when connected.",
          );
      }
      if (
        await onSave({
          id,
          projectId: selectedProject,
          type,
          amount,
          description,
          date,
          categoryId: category.id,
          mode,
          ...(milestoneId ? { milestoneId } : {}),
        })
      )
        onClose();
      else
        setError(
          "The transaction was not saved. Check the workspace message and retry.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Modal
      title={record ? "Edit transaction" : "Record a transaction"}
      subtitle={
        record
          ? "The project and income/expense type stay fixed for this record."
          : "Choose the project, amount and category."
      }
      onClose={() => {
        if (!busy && !lock.current) onClose();
      }}
      closeDisabled={busy || submitting}
    >
      <form className="studio-form" onSubmit={submit}>
        <fieldset disabled={busy || submitting}>
          <div className="form-grid">
            <label className="field">
              <span>Transaction type</span>
              <select
                aria-label="Transaction type"
                value={type}
                disabled={!!record}
                onChange={(e) =>
                  setType(e.target.value as StudioPayment["type"])
                }
              >
                <option value="Received">Income received</option>
                <option value="Spent">Expense paid</option>
              </select>
            </label>
            <label className="field">
              <span>Project *</span>
              <select
                name="projectId"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                required
              >
                {data.projects
                  .filter((p) => !record || p.id === record.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="Amount (₹)"
              name="amount"
              value={record?.amount}
              type="number"
              min={0.01}
              step="0.01"
              required
            />
            <Field
              label="Date"
              name="date"
              type="date"
              value={record?.date || today()}
              required
            />
            <MoneyCategoryPicker
              key={type}
              categories={categories}
              type={type}
              currentId={record ? paymentCategory(record) : ""}
              disabled={busy || submitting}
            />
            <Field
              label="Payment method"
              name="mode"
              value={record?.mode || (record ? "Unspecified" : "Bank transfer")}
              required
            >
              {paymentModes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Field>
          </div>
          {type === "Received" && (
            <Field
              key={selectedProjectId}
              label="Payment milestone (optional)"
              name="milestoneId"
              value={record?.milestoneId || ""}
            >
              <option value="">No milestone</option>
              {(data.paymentSchedules || [])
                .filter((s) => s.projectId === selectedProjectId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </Field>
          )}
          <Field
            label="Description"
            name="description"
            value={record?.description}
            placeholder="e.g. Advance payment or plywood purchase"
            required
          />
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-hint">
            Visible only to the company owner. Saving records this payment; it
            doesn’t transfer money.
          </p>
          <div className="money-modal-actions">
            <Button disabled={busy || submitting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={busy || submitting}
            >
              {busy || submitting
                ? "Saving…"
                : record
                  ? "Save changes"
                  : "Save transaction"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function CategoryManager({
  categories,
  busy,
  onClose,
  onSave,
}: {
  categories: MoneyCategory[];
  busy: boolean;
  onClose: () => void;
  onSave: Props["onCategory"];
}) {
  const [editing, setEditing] = useState<MoneyCategory | null>(null),
    [error, setError] = useState("");
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form),
      name = String(fd.get("name") || "").trim();
    if (!name || name.length > 60) {
      setError("Use a category name of 1–60 characters.");
      return;
    }
    const type = String(fd.get("type")) as StudioPayment["type"];
    if (
      categories.some(
        (c) =>
          c.id !== editing?.id &&
          c.type === type &&
          c.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("A category with that name already exists.");
      return;
    }
    const record = {
      id: editing?.id || uid(),
      name,
      type,
      color: String(fd.get("color")),
      active: editing?.active ?? true,
    };
    if (await onSave(record)) {
      form.reset();
      setEditing(null);
    } else
      setError("Category not saved. Check the workspace message and retry.");
  };
  return (
    <Modal
      title="Manage categories"
      subtitle="Rename categories without losing their transaction history."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="money-category-manager">
        {categories.map((c) => (
          <div key={c.id}>
            <i style={{ background: c.color }} />
            <div>
              <b>{c.name}</b>
              <small>
                {c.type === "Received" ? "Income" : "Expense"}
                {c.active ? "" : " · Archived"}
              </small>
            </div>
            <Button
              disabled={busy}
              onClick={() => {
                setEditing(c);
                setError("");
              }}
            >
              Edit
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!(await onSave({ ...c, active: !c.active })))
                  setError("Category not saved. Retry when connected.");
              }}
            >
              {c.active ? "Archive" : "Restore"}
            </Button>
          </div>
        ))}
      </div>
      <form
        className="studio-form money-category-form"
        key={editing?.id || "new"}
        onSubmit={save}
      >
        <h3>{editing ? "Edit category" : "Add a category"}</h3>
        <div className="form-grid">
          <Field
            label="Category name"
            name="name"
            value={editing?.name}
            required
          />
          <Field label="Used for" name="type" value={editing?.type || "Spent"}>
            {(editing ? [editing.type] : ["Spent", "Received"]).map((t) => (
              <option key={t} value={t}>
                {t === "Spent" ? "Expenses" : "Income"}
              </option>
            ))}
          </Field>
          <Field
            label="Colour"
            name="color"
            value={editing?.color || categoryColors[0]}
          >
            {categoryColors.map((c, i) => (
              <option key={c} value={c}>
                {
                  [
                    "Indigo",
                    "Red",
                    "Amber",
                    "Green",
                    "Blue",
                    "Purple",
                    "Pink",
                    "Slate",
                  ][i]
                }
              </option>
            ))}
          </Field>
        </div>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <div className="money-modal-actions">
          {editing && (
            <Button onClick={() => setEditing(null)}>Cancel edit</Button>
          )}
          <Button disabled={busy} variant="primary" type="submit">
            {busy ? "Saving…" : editing ? "Save category" : "Add category"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function OpeningEditor({
  data,
  projectId,
  busy,
  onClose,
  onSave,
}: {
  data: StudioData;
  projectId: string;
  busy: boolean;
  onClose: () => void;
  onSave: Props["onOpening"];
}) {
  const [selected, setSelected] = useState(
      projectId || data.projects[0]?.id || "",
    ),
    [error, setError] = useState("");
  const opening = data.balanceOpenings?.find((o) => o.projectId === selected);
  const firstTransactionDate = data.payments
    .filter((p) => p.projectId === selected)
    .map((p) => p.date)
    .sort()[0];
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      if (
        await onSave({
          id: selected,
          projectId: selected,
          amount: validAmount(String(fd.get("amount")), true),
          date: validDate(String(fd.get("date"))),
        })
      )
        onClose();
      else
        setError(
          "Opening balance not saved. Check the workspace message and retry.",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Set opening balance"
      subtitle="Total across cash, bank and UPI before transactions on the starting date."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="studio-form" onSubmit={save}>
        <label className="field">
          <span>Project</span>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setError("");
            }}
          >
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid" key={selected}>
          <Field
            label="Opening balance (₹)"
            name="amount"
            type="number"
            min={0}
            step="0.01"
            value={opening?.amount ?? 0}
            required
          />
          <Field
            label="Starting date"
            name="date"
            type="date"
            value={
              opening?.date ||
              firstTransactionDate ||
              data.projects.find((p) => p.id === selected)?.start ||
              today()
            }
            required
          />
        </div>
        <p className="form-hint">
          Include your starting balance across every payment method. All
          receipts add to this balance and all expenses reduce it, including
          cash, bank, UPI, cheque and unspecified methods. Before you set an
          opening balance, the app calculates from recorded transactions with a
          zero opening.
        </p>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <div className="money-modal-actions">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} type="submit">
            Save opening balance
          </Button>
        </div>
      </form>
    </Modal>
  );
}
