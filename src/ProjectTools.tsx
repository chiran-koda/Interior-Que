import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Empty, Field, Modal } from "./components";
import { PhotoCard } from "./ProjectPhotos";
import { dateLabel, today, uid } from "./model";
import { formatMoney as money } from "./money";
import {
  canAccessProject,
  type StudioData,
  type StudioMember,
  type StudioProject,
} from "./studio-model";
import {
  budgetSummary,
  outstanding,
  orderStatus,
  drawingGroup,
  safeDrawingLink,
  handoverItems,
  canFinishHandover,
  validateOperation,
  type OperationCollection,
  type OperationRecord,
  type Selection,
  type ChangeOrder,
  type Snag,
  type Handover,
} from "./project-operations";
import "./project-tools.css";

export type OperationSave = (
  key: OperationCollection,
  record: OperationRecord,
) => Promise<boolean>;
type Props = {
  data: StudioData;
  member: StudioMember;
  project: StudioProject;
  demo: boolean;
  busy: boolean;
  onSave: OperationSave;
  initialTab?: string;
};
type EditorState = {
  collection: OperationCollection;
  record?: any;
  action?: "receive" | "repair";
};

function AttachedPhoto({
  id,
  ...props
}: {
  id: string;
  data: StudioData;
  project: StudioProject;
  demo: boolean;
}) {
  const photo = props.data.files.find(
    (f) => f.id === id && f.projectId === props.project.id,
  );
  return photo ? (
    <div className="ops-photo">
      <PhotoCard
        photo={photo}
        company={props.data.id}
        project={props.project.name}
        demo={props.demo}
      />
    </div>
  ) : null;
}
function DecisionCard({
  record,
  collection,
  data,
  member,
  project,
  demo,
  busy,
  onSave,
}: {
  record: Selection | ChangeOrder;
  collection: "selections" | "changeOrders";
} & Props) {
  const [response, setResponse] = useState(""),
    [rejecting, setRejecting] = useState(false),
    [error, setError] = useState("");
  const canDecide =
    record.reviewerId === member.id && record.status === "Awaiting decision";
  const decide = async (status: Selection["status"]) => {
    if (status === "Changes requested" && !response.trim()) {
      setError("Tell the team what needs to change.");
      return;
    }
    setError("");
    if (
      !(await onSave(collection, {
        ...record,
        status,
        response: response.trim(),
      }))
    )
      setError("Decision not saved. Try again.");
  };
  return (
    <article className="ops-card">
      <div className="ops-card-heading">
        <div>
          <small>
            {project.name}
            {"room" in record ? ` · ${record.room}` : " · Extra work"}
          </small>
          <h3>{record.title}</h3>
        </div>
        <Badge>{record.status}</Badge>
      </div>
      <p>
        {"specification" in record ? record.specification : record.description}
      </p>
      {"amount" in record && (
        <div className="ops-cost">
          <strong>{money(record.amount)}</strong>
          <span>{record.extraDays} additional days</span>
        </div>
      )}
      {"photoId" in record && (
        <AttachedPhoto
          id={record.photoId}
          data={data}
          project={project}
          demo={demo}
        />
      )}
      <small>Decision due · {dateLabel(record.due)}</small>
      {record.response && (
        <div className="ops-note">
          <b>Reviewer’s response</b>
          <p>{record.response}</p>
        </div>
      )}
      {canDecide && (
        <>
          <div className="ops-actions">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => decide("Approved")}
            >
              Approve
            </Button>
            <Button disabled={busy} onClick={() => setRejecting(!rejecting)}>
              Request changes
            </Button>
          </div>
          {rejecting && (
            <label className="field">
              <span>What needs changing?</span>
              <textarea
                value={response}
                maxLength={2000}
                onChange={(e) => setResponse(e.target.value)}
              />
              <Button
                disabled={busy}
                onClick={() => decide("Changes requested")}
              >
                Send changes
              </Button>
            </label>
          )}
        </>
      )}
      {!canDecide && record.status === "Awaiting decision" && (
        <small>Waiting for the assigned reviewer.</small>
      )}
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
    </article>
  );
}

export function DecisionInbox({
  data,
  member,
  demo,
  busy,
  onSave,
  onlyMine = false,
}: Omit<Props, "project"> & { onlyMine?: boolean }) {
  const selections = (data.selections || []).filter(
    (r) =>
      r.status === "Awaiting decision" &&
      (!onlyMine || r.reviewerId === member.id),
  );
  const extras = (data.changeOrders || []).filter(
    (r) =>
      r.status === "Awaiting decision" &&
      (!onlyMine || r.reviewerId === member.id),
  );
  if (!selections.length && !extras.length) return null;
  return (
    <section className="ops-inbox">
      <h2>Selections & extra-work decisions</h2>
      <div className="ops-grid">
        {[
          ...selections.map((r) => ({ r, key: "selections" as const })),
          ...extras.map((r) => ({ r, key: "changeOrders" as const })),
        ].map(({ r, key }) => {
          const project = data.projects.find((p) => p.id === r.projectId);
          return project ? (
            <DecisionCard
              key={r.id}
              record={r}
              collection={key}
              data={data}
              member={member}
              project={project}
              demo={demo}
              busy={busy}
              onSave={onSave}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}

export function ProjectTools(props: Props) {
  const { data, member, project, busy, onSave } = props;
  const owner = member.role === "owner",
    client = member.role === "client";
  const tabs = client
    ? ["Payments", "Selections", "Extras", "Drawings", "Snags", "Handover"]
    : owner
      ? [
          "Budget",
          "Selections",
          "Extras",
          "Drawings",
          "Orders",
          "Snags",
          "Handover",
        ]
      : ["Selections", "Drawings", "Orders", "Snags", "Handover"];
  const [tab, setTab] = useState(
      props.initialTab && tabs.includes(props.initialTab)
        ? props.initialTab
        : tabs[0],
    ),
    [editor, setEditor] = useState<EditorState | null>(null),
    [room, setRoom] = useState("");
  const list = <T extends { projectId: string }>(records: T[] | undefined) =>
    (records || []).filter((r) => r.projectId === project.id);
  const selections = list(data.selections),
    extras = list(data.changeOrders),
    drawings = list(data.drawings),
    orders = list(data.purchaseOrders),
    snags = list(data.snags),
    schedule = list(data.paymentSchedules);
  const budget = budgetSummary(data, project.id),
    savedBudget = list(data.projectBudgets)[0];
  const pendingSnags = snags.filter((s) => s.status !== "Resolved");
  return (
    <section className="studio-panel project-tools">
      <div className="studio-section-heading">
        <div>
          <h2>Project workspace</h2>
          <p>Plan, approve, order and hand over.</p>
        </div>
      </div>
      <nav className="ops-tabs" aria-label="Project workspace tools">
        {tabs.map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setRoom("");
            }}
          >
            {t}
            {t === "Snags" && pendingSnags.length > 0 ? (
              <span>{pendingSnags.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {(tab === "Budget" || tab === "Payments") && (
        <>
          {owner && (
            <>
              <div className="ops-section-heading">
                <h3>Budget & collections</h3>
                <Button
                  disabled={busy}
                  onClick={() =>
                    setEditor({
                      collection: "projectBudgets",
                      record: savedBudget,
                    })
                  }
                >
                  {savedBudget ? "Edit budget" : "Set project budget"}
                </Button>
              </div>
              {!budget.configured ? (
                <div className="studio-info">
                  Add the agreed contract value and expected cost. Existing
                  transactions remain unchanged.
                </div>
              ) : (
                <div className="ops-metrics">
                  {[
                    ["Agreed value + approved extras", budget.contract],
                    ["Client payments received", budget.received],
                    ["Expenses paid", budget.spent],
                    ["Still to collect", budget.remaining],
                    ["Forecast margin", budget.forecastMargin!],
                    ["Spending over budget", budget.overBudget!],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{money(Number(value))}</strong>
                    </div>
                  ))}
                </div>
              )}
              {savedBudget && (
                <p className="ops-help">
                  Expected cost: {money(savedBudget.costBudget)} · Approved
                  extra work: {money(budget.extras)}. Forecast margin uses your
                  expected cost, not a promise of final profit.
                </p>
              )}
              {savedBudget?.quotationRef && (
                <p className="ops-help">
                  Quotation reference: {savedBudget.quotationRef}
                </p>
              )}
            </>
          )}
          <div className="ops-section-heading">
            <h3>Payment schedule</h3>
            {owner && (
              <Button
                disabled={busy}
                onClick={() => setEditor({ collection: "paymentSchedules" })}
              >
                Add payment milestone
              </Button>
            )}
          </div>
          <p className="ops-help">
            {owner
              ? "Link income records to a milestone in Money. Received totals update with those records; adding a milestone does not create a transaction."
              : "Your team’s payment plan and recorded collections."}
          </p>
          {schedule.length ? (
            <div className="ops-list">
              {schedule
                .sort((a, b) => a.due.localeCompare(b.due))
                .map((s) => (
                  <article className="ops-list-row" key={s.id}>
                    <div>
                      <b>{s.title}</b>
                      <small>
                        {dateLabel(s.due)} ·{" "}
                        {outstanding(s) > 0 && s.due < today()
                          ? "Overdue"
                          : outstanding(s) === 0
                            ? "Collected"
                            : "Upcoming"}
                      </small>
                    </div>
                    <div>
                      <strong>{money(s.amount)}</strong>
                      <small>
                        Received {money(s.received)} · Due{" "}
                        {money(outstanding(s))}
                      </small>
                    </div>
                    {owner && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            collection: "paymentSchedules",
                            record: s,
                          })
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </article>
                ))}
            </div>
          ) : (
            <Empty
              title="No payment schedule yet"
              text="Add the advance, progress payments and final payment agreed for this project."
            />
          )}
        </>
      )}
      {tab === "Selections" && (
        <>
          <div className="ops-section-heading">
            <h3>Room selections</h3>
            {!client && (
              <Button
                disabled={busy}
                onClick={() => setEditor({ collection: "selections" })}
              >
                Add a selection
              </Button>
            )}
          </div>
          <label className="ops-filter">
            Room
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">All rooms</option>
              {[...new Set(selections.map((s) => s.room))].sort().map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="ops-grid">
            {selections
              .filter((s) => !room || s.room === room)
              .map((s) => (
                <DecisionCard
                  {...props}
                  key={s.id}
                  record={s}
                  collection="selections"
                />
              ))}
          </div>
          {!selections.length && (
            <Empty
              title="A place for room-by-room choices"
              text="Record finish specifications, attach a project photo and ask for a decision."
            />
          )}
        </>
      )}
      {tab === "Extras" && (
        <>
          <div className="ops-section-heading">
            <h3>Extra-work approvals</h3>
            {owner && (
              <Button
                disabled={busy}
                onClick={() => setEditor({ collection: "changeOrders" })}
              >
                Request extra-work approval
              </Button>
            )}
          </div>
          <p className="ops-help">
            Approved extras increase the budget’s agreed value. They do not
            create income records or automatically change project dates; update
            the schedule after approval.
          </p>
          <div className="ops-grid">
            {extras.map((r) => (
              <DecisionCard
                {...props}
                key={r.id}
                record={r}
                collection="changeOrders"
              />
            ))}
          </div>
          {!extras.length && (
            <Empty
              title="Record extra work before it starts"
              text="Capture the additional cost, time and the client’s decision."
            />
          )}
        </>
      )}
      {tab === "Drawings" && (
        <>
          <div className="ops-section-heading">
            <h3>Drawing versions</h3>
            {!client && (
              <Button
                disabled={busy}
                onClick={() => setEditor({ collection: "drawings" })}
              >
                Add drawing version
              </Button>
            )}
          </div>
          <p className="ops-help">
            Link a drawing hosted by your firm. The owner approves a version;
            earlier approved versions are marked superseded. This does not
            change the host’s file-sharing permissions.
          </p>
          <div className="ops-grid">
            {drawings
              .sort((a, b) => b.version - a.version)
              .map((d) => (
                <article className="ops-card" key={d.id}>
                  <div className="ops-card-heading">
                    <div>
                      <small>
                        {d.room} · Version {d.version}
                      </small>
                      <h3>{d.title}</h3>
                    </div>
                    <Badge>{d.status}</Badge>
                  </div>
                  <small>
                    Added {dateLabel(d.date)}
                    {d.clientVisible ? " · Shared with client" : " · Team only"}
                  </small>
                  <div className="ops-actions">
                    {safeDrawingLink(d.url) && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn secondary"
                      >
                        Open{" "}
                        {d.status === "Superseded" ? "old version" : "drawing"}
                      </a>
                    )}
                    {!client && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            collection: "drawings",
                            record: { title: d.title, room: d.room },
                          })
                        }
                      >
                        Add next version
                      </Button>
                    )}
                    {owner && d.status === "Draft" && (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          onSave("drawings", {
                            ...d,
                            status: "Approved",
                            clientVisible: true,
                          })
                        }
                      >
                        Approve & share version
                      </Button>
                    )}
                  </div>
                  {d.status === "Superseded" && (
                    <p className="ops-note">
                      Superseded—use the current approved version for site work.
                    </p>
                  )}
                </article>
              ))}
          </div>
          {!drawings.length && (
            <Empty
              title="Keep the latest drawing clear"
              text="Add a drawing link with a title and room; future versions use that same title and room."
            />
          )}
        </>
      )}
      {tab === "Orders" && (
        <>
          <div className="ops-section-heading">
            <h3>Supplier orders & deliveries</h3>
            {member.role !== "supervisor" && (
              <Button
                disabled={busy}
                onClick={() => setEditor({ collection: "purchaseOrders" })}
              >
                Create purchase order
              </Button>
            )}
          </div>
          <p className="ops-help">
            Orders track commitments and deliveries. Record actual supplier
            payments separately in Money.
          </p>
          <div className="ops-grid">
            {orders.map((o) => (
              <article className="ops-card" key={o.id}>
                <div className="ops-card-heading">
                  <h3>{o.title}</h3>
                  <Badge>{orderStatus(o)}</Badge>
                </div>
                <p>{o.supplier}</p>
                <strong>
                  {o.quantity} {o.unit} ·{" "}
                  {money(Math.round(o.quantity * o.unitRate * 100) / 100)}
                </strong>
                <small>
                  Expected {dateLabel(o.due)} · Received {o.receivedQuantity} /{" "}
                  {o.quantity} {o.unit}
                </small>
                {o.notes && <p>{o.notes}</p>}
                <Button
                  disabled={busy}
                  onClick={() =>
                    setEditor({
                      collection: "purchaseOrders",
                      record: o,
                      action: "receive",
                    })
                  }
                >
                  Record delivery
                </Button>
              </article>
            ))}
          </div>
          {!orders.length && (
            <Empty
              title="No supplier orders yet"
              text="Add quantities, rates, suppliers and delivery dates. Link an order to a planned material."
            />
          )}
        </>
      )}
      {tab === "Snags" && (
        <>
          <div className="ops-section-heading">
            <h3>Snags & repairs</h3>
            <Button
              disabled={busy}
              onClick={() => setEditor({ collection: "snags" })}
            >
              Report a snag
            </Button>
          </div>
          <div className="ops-grid">
            {snags.map((s) => (
              <article className="ops-card" key={s.id}>
                <div className="ops-card-heading">
                  <div>
                    <small>
                      {s.room} · {dateLabel(s.due)}
                    </small>
                    <h3>{s.title}</h3>
                  </div>
                  <Badge>{s.status}</Badge>
                </div>
                <p>{s.description}</p>
                <small>
                  Assigned to{" "}
                  {data.members.find((m) => m.id === s.assigneeId)?.name ||
                    (!s.assigneeId ? "Not assigned" : "Project team")}
                </small>
                <AttachedPhoto
                  id={s.photoId}
                  data={data}
                  project={project}
                  demo={props.demo}
                />
                {s.resolution && (
                  <div className="ops-note">
                    <b>Repair report</b>
                    <p>{s.resolution}</p>
                  </div>
                )}
                <AttachedPhoto
                  id={s.completionPhotoId}
                  data={data}
                  project={project}
                  demo={props.demo}
                />
                <div className="ops-actions">
                  {s.status === "Open" &&
                    (owner || s.authorId === member.id) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditor({ collection: "snags", record: s })
                        }
                      >
                        Edit / assign
                      </Button>
                    )}
                  {!client && s.status === "Open" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        setEditor({
                          collection: "snags",
                          record: s,
                          action: "repair",
                        })
                      }
                    >
                      Mark repair ready
                    </Button>
                  )}
                  {s.status === "Ready for check" &&
                    (owner || (client && s.authorId === member.id)) && (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          onSave("snags", { ...s, status: "Resolved" })
                        }
                      >
                        Verify & resolve
                      </Button>
                    )}
                </div>
              </article>
            ))}
          </div>
          {!snags.length && (
            <Empty
              title="A clear path to finishing"
              text="Capture defects, assign repairs and verify them before handover."
            />
          )}
        </>
      )}
      {tab === "Handover" && <HandoverPane {...props} snags={snags} />}
      {editor && (
        <OperationEditor
          {...props}
          {...editor}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}

function HandoverPane({
  data,
  member,
  project,
  busy,
  onSave,
  snags,
}: Props & { snags: Snag[] }) {
  const saved = (data.handovers || []).find((h) => h.projectId === project.id);
  const [checks, setChecks] = useState<boolean[]>(
      saved?.checks || handoverItems.map(() => false),
    ),
    [date, setDate] = useState(saved?.date || today()),
    [notes, setNotes] = useState(saved?.notes || ""),
    [error, setError] = useState("");
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) {
      setChecks(saved?.checks || handoverItems.map(() => false));
      setDate(saved?.date || today());
      setNotes(saved?.notes || "");
    }
  }, [JSON.stringify(saved)]);
  const owner = member.role === "owner",
    ready = canFinishHandover(snags, checks),
    open = snags.filter((s) => s.status !== "Resolved").length;
  const save = async (completed: boolean) => {
    setError("");
    if (completed && !ready) {
      setError("Complete the checklist and resolve all snags first.");
      return;
    }
    const r: Handover = {
      id: project.id,
      projectId: project.id,
      checks,
      date,
      notes: notes.trim(),
      completed,
      clientVisible: true,
    };
    if (!(await onSave("handovers", r)))
      setError("Handover not saved. Try again.");
    else dirty.current = false;
  };
  return (
    <div className="handover-pane">
      <div className="ops-section-heading">
        <h3>Handover checklist</h3>
        <Badge>{saved?.completed ? "Completed" : "In progress"}</Badge>
      </div>
      <p>
        {open
          ? `${open} snag${open === 1 ? "" : "s"} still need verification.`
          : "No unresolved snags recorded."}
      </p>
      {handoverItems.map((item, i) => (
        <label className="ops-check" key={item}>
          <input
            type="checkbox"
            checked={checks[i] || false}
            disabled={!owner || busy || saved?.completed}
            onChange={(e) => {
              dirty.current = true;
              setChecks((c) =>
                c.map((v, n) => (n === i ? e.target.checked : v)),
              );
            }}
          />
          {item}
        </label>
      ))}
      {owner && !saved?.completed && (
        <>
          <label className="field">
            <span>Handover date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                dirty.current = true;
                setDate(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>Handover notes</span>
            <textarea
              maxLength={2000}
              value={notes}
              onChange={(e) => {
                dirty.current = true;
                setNotes(e.target.value);
              }}
            />
          </label>
          <div className="ops-actions">
            <Button disabled={busy} onClick={() => save(false)}>
              Save checklist
            </Button>
            <Button
              variant="primary"
              disabled={busy || !ready}
              onClick={() => save(true)}
            >
              Complete handover
            </Button>
          </div>
        </>
      )}
      {saved?.completed && (
        <div className="studio-success">
          Handover recorded for {dateLabel(saved.date)}.<p>{saved.notes}</p>
        </div>
      )}
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FinanceOverview({
  data,
  onOpen,
}: {
  data: StudioData;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="studio-panel">
      <div className="studio-section-heading">
        <h2>Project budgets & collections</h2>
      </div>
      <div className="ops-list">
        {data.projects.map((project) => {
          const total = budgetSummary(data, project.id),
            due = (data.paymentSchedules || [])
              .filter((s) => s.projectId === project.id && outstanding(s) > 0)
              .sort((a, b) => a.due.localeCompare(b.due))[0];
          return (
            <button
              className="ops-list-row"
              key={project.id}
              onClick={() => onOpen(project.id)}
            >
              <div>
                <b>{project.name}</b>
                <small>
                  {total.configured
                    ? `To collect ${money(total.remaining)}`
                    : "Budget not set"}
                </small>
              </div>
              <div>
                <strong>
                  {total.configured ? money(total.contract) : "Set budget"}
                </strong>
                <small>
                  {due
                    ? `Next due ${dateLabel(due.due)} · ${money(outstanding(due))}`
                    : "No outstanding milestone"}
                </small>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OperationEditor(props: Props & EditorState & { onClose: () => void }) {
  return <OperationForm {...props} />;
}
function OperationForm({
  collection,
  record,
  action,
  data,
  member,
  project,
  busy,
  onSave,
  onClose,
}: Props &
  Omit<EditorState, "collection"> & {
    collection: OperationCollection;
    onClose: () => void;
  }) {
  const [error, setError] = useState(""),
    [material, setMaterial] = useState(record?.materialId || ""),
    [shared, setShared] = useState(record?.clientVisible ?? true);
  const lock = useRef(false),
    id = useRef(record?.id || uid());
  const owner = member.role === "owner",
    client = member.role === "client";
  const materialRecord = data.materials.find(
    (m) => m.id === material && m.projectId === project.id,
  );
  const reviewers = data.members.filter(
    (m) =>
      m.active !== false &&
      canAccessProject(m, project.id) &&
      (collection !== "changeOrders" ||
        m.role === "owner" ||
        m.role === "client"),
  );
  const staff = reviewers.filter((m) => m.role !== "client");
  const photos = data.files.filter(
    (f) => f.projectId === project.id && (!shared || f.clientVisible),
  );
  const titles: Partial<Record<OperationCollection, string>> = {
    projectBudgets: "Set project budget",
    paymentSchedules: record
      ? "Edit payment milestone"
      : "Add payment milestone",
    selections: "Add a room selection",
    changeOrders: "Request extra-work approval",
    drawings: "Add a drawing version",
    purchaseOrders: action
      ? "Record supplier delivery"
      : "Create purchase order",
    snags: action
      ? "Record completed repair"
      : record
        ? "Edit snag"
        : "Report a snag",
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lock.current || busy) return;
    setError("");
    const fd = new FormData(e.currentTarget),
      f = (key: string) => String(fd.get(key) || "").trim(),
      n = (key: string) => Number(f(key) || 0);
    try {
      let r: any = { id: id.current, projectId: project.id };
      if (collection === "projectBudgets")
        r = {
          id: project.id,
          projectId: project.id,
          contractValue: n("contractValue"),
          costBudget: n("costBudget"),
          quotationRef: f("quotationRef"),
        };
      if (collection === "paymentSchedules")
        r = {
          ...r,
          title: f("title"),
          amount: n("amount"),
          received: record?.received || 0,
          due: f("due"),
          clientVisible: shared,
        };
      if (collection === "selections" || collection === "changeOrders") {
        const reviewer = reviewers.find((m) => m.id === f("reviewerId"));
        if (!reviewer)
          throw new Error(
            "Choose an active reviewer assigned to this project.",
          );
        if (reviewer.role === "client" && !shared)
          throw new Error("Share the request with the client reviewer.");
        r = {
          ...r,
          title: f("title"),
          authorId: member.id,
          reviewerId: reviewer.id,
          due: f("due"),
          clientVisible: shared,
          status: "Awaiting decision",
          response: "",
        };
        r =
          collection === "selections"
            ? {
                ...r,
                room: f("room"),
                specification: f("specification"),
                photoId: f("photoId"),
              }
            : {
                ...r,
                description: f("description"),
                amount: n("amount"),
                extraDays: n("extraDays"),
              };
      }
      if (collection === "drawings")
        r = {
          ...r,
          title: f("title"),
          room: f("room"),
          groupId: drawingGroup(f("room"), f("title")),
          url: f("url"),
          version: 0,
          authorId: member.id,
          date: today(),
          status: "Draft",
          clientVisible: false,
        };
      if (collection === "purchaseOrders")
        r = action
          ? { ...record, receivedQuantity: n("receivedQuantity") }
          : {
              ...r,
              title: f("title"),
              materialId: material,
              supplier: f("supplier"),
              quantity: n("quantity"),
              receivedQuantity: 0,
              unit: f("unit"),
              unitRate: n("unitRate"),
              due: f("due"),
              notes: f("notes"),
              authorId: member.id,
            };
      if (collection === "snags")
        r = action
          ? {
              ...record,
              status: "Ready for check",
              resolution: f("resolution"),
              completionPhotoId: f("completionPhotoId"),
            }
          : {
              ...r,
              room: f("room"),
              title: f("title"),
              description: f("description"),
              photoId: f("photoId"),
              authorId: record?.authorId || member.id,
              assigneeId: owner ? f("assigneeId") : record?.assigneeId || "",
              due: f("due"),
              status: "Open",
              resolution: "",
              completionPhotoId: "",
              clientVisible: client || shared,
            };
      validateOperation(collection, r);
      if (action === "repair" && !r.resolution)
        throw new Error("Describe the completed repair for verification.");
      lock.current = true;
      if (await onSave(collection, r)) onClose();
      else setError("Not saved. Check the workspace message and try again.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      lock.current = false;
    }
  };
  const field = (
    label: string,
    name: string,
    type = "text",
    value = record?.[name],
    required = true,
  ) => (
    <Field
      key={name}
      label={label}
      name={name}
      type={type}
      value={value}
      required={required}
      min={type === "number" ? 0 : undefined}
      step={type === "number" ? "0.01" : undefined}
    />
  );
  const photoField = (label = "Project photo", name = "photoId") => (
    <Field label={label} name={name} value={record?.[name] || ""}>
      <option value="">No photo</option>
      {photos.map((f) => (
        <option key={f.id} value={f.id}>
          {f.room} · {f.name}
        </option>
      ))}
    </Field>
  );
  return (
    <Modal
      title={titles[collection] || "Project details"}
      subtitle={project.name}
      onClose={() => {
        if (!busy && !lock.current) onClose();
      }}
      closeDisabled={busy}
    >
      <form className="studio-form ops-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          {collection === "projectBudgets" && (
            <>
              {field("Agreed contract value (₹)", "contractValue", "number")}
              {field("Expected total cost (₹)", "costBudget", "number")}
              {field(
                "Quotation reference",
                "quotationRef",
                "text",
                record?.quotationRef,
                false,
              )}
              <p className="ops-help">
                Budget and margin are visible only to the owner. Add your
                quotation number as a reference to the agreed scope.
              </p>
            </>
          )}
          {collection === "paymentSchedules" && (
            <>
              {field("Payment / milestone", "title")}
              {field("Amount (₹)", "amount", "number")}
              {field("Due date", "due", "date", record?.due || project.end)}
            </>
          )}
          {(collection === "selections" || collection === "changeOrders") && (
            <>
              {collection === "selections" && field("Room / area", "room")}
              {field(
                collection === "selections"
                  ? "Material or finish choice"
                  : "Extra work",
                "title",
              )}
              {field(
                collection === "selections"
                  ? "Specification and details"
                  : "Scope and reason",
                collection === "selections" ? "specification" : "description",
                "textarea",
                undefined,
                false,
              )}
              {collection === "selections" ? (
                photoField()
              ) : (
                <>
                  {field("Additional cost (₹)", "amount", "number", 0)}
                  {field("Additional days", "extraDays", "number", 0)}
                </>
              )}
              <Field
                label="Reviewer"
                name="reviewerId"
                value={
                  reviewers.find((m) => m.role === "client")?.id || member.id
                }
                required
              >
                {reviewers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.role === "client" ? "Client" : "Team"}
                  </option>
                ))}
              </Field>
              {field("Decision due", "due", "date", today())}
            </>
          )}
          {collection === "drawings" && (
            <>
              {field(
                "Drawing title (keep the same for future versions)",
                "title",
              )}
              {field("Room / area", "room")}
              {field("HTTPS drawing link", "url", "url", "")}
              <p className="ops-help">
                Use a link your firm already controls. Drafts are team-only
                until the owner approves and shares them.
              </p>
            </>
          )}
          {collection === "purchaseOrders" &&
            (action ? (
              <>
                {field(
                  "Total received to date",
                  "receivedQuantity",
                  "number",
                  record.receivedQuantity,
                )}
                <p className="ops-help">
                  Ordered {record.quantity} {record.unit}. Enter the cumulative
                  quantity, including earlier deliveries.
                </p>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Link to planned material</span>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                  >
                    <option value="">Unlinked order</option>
                    {data.materials
                      .filter((m) => m.projectId === project.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div key={material}>
                  {field(
                    "Material / order",
                    "title",
                    "text",
                    materialRecord?.name || "",
                  )}
                  {field(
                    "Quantity ordered",
                    "quantity",
                    "number",
                    materialRecord?.quantity || 1,
                  )}
                  {field(
                    "Unit",
                    "unit",
                    "text",
                    materialRecord?.unit || "Sheets",
                  )}
                </div>
                {field("Supplier", "supplier")}
                {field("Unit rate (₹)", "unitRate", "number", 0)}
                {field("Expected delivery", "due", "date", today())}
                {field("Order notes", "notes", "textarea", "", false)}
              </>
            ))}
          {collection === "snags" &&
            (action ? (
              <>
                {field(
                  "Repair completed / verification notes",
                  "resolution",
                  "textarea",
                  "",
                )}
                {photoField("Repair photo", "completionPhotoId")}
              </>
            ) : (
              <>
                {field("Room / area", "room")}
                {field("Defect / snag", "title")}
                {field(
                  "Details",
                  "description",
                  "textarea",
                  record?.description,
                  false,
                )}
                {photoField()}
                {owner && (
                  <Field
                    label="Assigned to"
                    name="assigneeId"
                    value={record?.assigneeId || ""}
                  >
                    <option value="">Not assigned</option>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Field>
                )}
                {field(
                  "Target repair date",
                  "due",
                  "date",
                  record?.due || today(),
                )}
              </>
            ))}
          {["paymentSchedules", "selections", "changeOrders", "snags"].includes(
            collection,
          ) &&
            !action &&
            !client && (
              <label className="share-client">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                />
                <span>
                  Share with client
                  <small>
                    Only shared project records appear in the client view.
                  </small>
                </span>
              </label>
            )}
          {error && (
            <p role="alert" className="studio-error">
              {error}
            </p>
          )}
          <div className="studio-form-actions">
            <Button disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy
                ? "Saving…"
                : action === "receive"
                  ? "Save delivery"
                  : "Save"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
