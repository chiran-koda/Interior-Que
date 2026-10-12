import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import {
  Home,
  Layers,
  ListChecks,
  CheckCircle2,
  HardHat,
  FolderOpen,
  Users,
  Wallet,
  Settings,
  Plus,
  ArrowRight,
  ArrowLeft,
  Search,
  Menu,
  X,
  Clock,
  TriangleAlert,
  Cloud,
  LogOut,
  Package,
  Check,
  Send,
  Copy,
  Paintbrush,
  Building2,
  Camera,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  Avatar,
  Badge,
  Button,
  Busy,
  Empty,
  Field,
  Modal,
  Progress,
} from "./components";
import { Brand } from "./Brand";
import { loadDemoStudio, saveDemoStudio } from "./studio-store";
import * as cloud from "./studio-cloud";
import { PhotoCard, PhotoUploader, StorageMeter } from "./ProjectPhotos";
import { asset } from "./assets";
import { uid, today, dateLabel, money } from "./model";
import {
  canAccessProject,
  isOverdue,
  lifecycle,
  newStudio,
  projectStarter,
  roleNames,
  scopedStudio,
  taskProgress,
  type Approval,
  type StudioData,
  type StudioMember,
  type StudioRole,
  type StudioTask,
} from "./studio-model";

const MoneyWorkspace = lazy(() =>
  import("./MoneyWorkspace").then((module) => ({
    default: module.MoneyWorkspace,
  })),
);

type StudioPage =
  | "Today"
  | "Projects"
  | "Tasks"
  | "Approvals"
  | "Site updates"
  | "Materials"
  | "Photos"
  | "Money"
  | "Team"
  | "Settings";
type DialogKind =
  | "project"
  | "task"
  | "update"
  | "approval"
  | "file"
  | "payment"
  | "invite"
  | "member"
  | "material";
type CollectionKey =
  | "projects"
  | "tasks"
  | "updates"
  | "approvals"
  | "files"
  | "payments"
  | "invites"
  | "members"
  | "materials"
  | "moneyCategories"
  | "cashOpenings";
const pageIcons = {
  Today: Home,
  Projects: Layers,
  Tasks: ListChecks,
  Approvals: CheckCircle2,
  "Site updates": HardHat,
  Materials: Package,
  Photos: FolderOpen,
  Money: Wallet,
  Team: Users,
  Settings,
};
const roleCopy = {
  owner: {
    title: "A clear view of your studio.",
    description: "See what needs attention. Help your team move forward.",
  },
  designer: {
    title: "Make room for good design.",
    description: "Your tasks, design decisions and approvals, in one place.",
  },
  supervisor: {
    title: "Keep the site moving.",
    description: "Record today’s work. Flag a blocker. Close the next task.",
  },
  client: {
    title: "Your project, without the guesswork.",
    description:
      "Follow the progress and review the choices that need your decision.",
  },
};
export function StudioWorkspace({
  demoRole = "owner",
  changeDemoRole,
  onLeave,
  cloudData,
  cloudMember,
}: {
  demoRole?: StudioRole;
  changeDemoRole?: (role: StudioRole) => void;
  onLeave: () => void;
  cloudData?: StudioData;
  cloudMember?: StudioMember;
}) {
  const demo = !cloudData;
  const [local, setLocal] = useState<StudioData | null>(null);
  const localRef = useRef(local);
  const persistQueue = useRef(Promise.resolve());
  localRef.current = local;
  const [page, setPage] = useState<StudioPage>("Today");
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("My tasks");
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: DialogKind;
    record?: any;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [photoRefresh, setPhotoRefresh] = useState(0);
  const {
    needRefresh: [needsUpdate],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (demo)
      loadDemoStudio()
        .then(setLocal)
        .catch(() =>
          setError(
            "Demo storage could not open. Enable browser storage and reload.",
          ),
        );
  }, [demo]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    setPage("Today");
    setProjectId("");
    setQuery("");
    setDialog(null);
    setMessage("");
    setError("");
  }, [demoRole, cloudMember?.role]);
  useEffect(() => {
    if (!drawer) return;
    const original = document.activeElement as HTMLElement | null;
    const node = document.querySelector<HTMLElement>(".studio-sidebar");
    node?.querySelector<HTMLElement>(".studio-close-menu")?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") {
        const elements = [
          ...(node?.querySelectorAll<HTMLElement>("button,a[href],select") ||
            []),
        ].filter((n) => n.getClientRects().length);
        if (e.shiftKey && document.activeElement === elements[0]) {
          e.preventDefault();
          elements.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === elements.at(-1)) {
          e.preventDefault();
          elements[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      original?.focus();
    };
  }, [drawer]);
  const source = cloudData || local || newStudio("demo", "Interior Que");
  const member = cloudMember ||
    source.members.find((m) => m.role === demoRole) || {
      id: demoRole,
      name: roleNames[demoRole],
      email: "",
      role: demoRole,
      projectIds: [],
    };
  const data = scopedStudio(source, member);
  const owner = member.role === "owner",
    client = member.role === "client";
  const navigate = (next: StudioPage, id = "") => {
    setPage(next);
    setProjectId(id);
    setQuery("");
    setDrawer(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const run = useCallback(
    async (action: () => Promise<void>, success = "Saved.") => {
      if (lock.current) return false;
      if (!demo && !navigator.onLine) {
        setError("Reconnect to the internet to save team changes.");
        return false;
      }
      lock.current = true;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await action();
        setMessage(success);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
        lock.current = false;
      }
    },
    [demo],
  );
  const persist = async (fn: (s: StudioData) => StudioData) => {
    const saving = persistQueue.current.then(async () => {
      const current = localRef.current;
      if (!current) throw new Error("The demo is still opening.");
      const next = fn(current);
      await saveDemoStudio(next);
      localRef.current = next;
      setLocal(next);
    });
    persistQueue.current = saving.catch(() => {});
    await saving;
  };
  const save = async (key: CollectionKey, record: any) => {
    if (demo)
      await persist((s) => ({
        ...s,
        [key]: [record, ...(s[key] || []).filter((r) => r.id !== record.id)],
      }));
    else await cloud.saveRecord(data.id, key, record);
  };
  const patch = async (
    key: CollectionKey,
    id: string,
    changes: Record<string, unknown>,
  ) => {
    if (demo)
      await persist((s) => ({
        ...s,
        [key]: (s[key] || []).map((r) =>
          r.id === id ? { ...r, ...changes } : r,
        ),
      }));
    else await cloud.patchRecord(data.id, key, id, changes);
  };
  const setTaskStatus = (task: StudioTask, status: StudioTask["status"]) =>
    run(
      async () => {
        if (!demo) {
          await cloud.setTaskStatus(data.id, task, status);
          return;
        }
        await patch("tasks", task.id, { status });
        const tasks = data.tasks
          .filter((t) => t.projectId === task.projectId)
          .map((t) => (t.id === task.id ? { ...t, status } : t));
        const progress = taskProgress(tasks);
        await patch("projects", task.projectId, {
          progress,
          status: progress === 100 ? "Completed" : "In progress",
        });
      },
      status === "Done"
        ? "Task completed. Project progress updated."
        : "Task status updated.",
    );
  const decide = (
    approval: Approval,
    status: "Approved" | "Changes requested",
    response: string,
  ) =>
    run(async () => {
      if (
        approval.reviewerId !== member.id ||
        approval.status !== "Awaiting decision"
      )
        throw new Error("This item is not awaiting your decision.");
      if (demo) await patch("approvals", approval.id, { status, response });
      else
        await cloud.decideApproval(
          data.id,
          approval.id,
          status,
          response,
          member.id,
        );
    }, "Your decision has been recorded.");
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name || "Project";
  const matches = (text: string) =>
    text.toLowerCase().includes(query.toLowerCase());
  const currentProject = data.projects.find((p) => p.id === projectId);
  const projectRecords = <T extends { projectId: string }>(items: T[]) =>
    items.filter((r) => !projectId || r.projectId === projectId);
  const myTasks = data.tasks.filter(
    (t) => (owner || t.assigneeId === member.id) && t.status !== "Done",
  );
  const urgent = data.tasks.filter((t) => isOverdue(t));
  const waiting = data.approvals.filter(
    (a) => a.status === "Awaiting decision",
  );
  const myDecisions = waiting.filter((a) => a.reviewerId === member.id);
  const blockers = data.updates
    .filter((u) => u.blocker)
    .sort((a, b) => b.date.localeCompare(a.date));
  const pages: StudioPage[] = client
    ? ["Today", "Projects", "Approvals", "Site updates", "Photos", "Settings"]
    : [
        "Today",
        "Projects",
        "Tasks",
        "Approvals",
        "Site updates",
        "Materials",
        "Photos",
        ...(owner ? (["Money", "Team"] as StudioPage[]) : []),
        "Settings",
      ];
  const open = (kind: DialogKind, record?: any) => {
    setError("");
    setDialog({
      kind,
      record: record || (kind === "file" ? { id: uid() } : undefined),
    });
  };
  const taskRows = (tasks: StudioTask[], limit = 100) =>
    tasks.slice(0, limit).map((task) => (
      <div
        className={`studio-task-row ${task.status === "Done" ? "done" : ""}`}
        key={task.id}
      >
        <button
          className="task-check"
          aria-label={`${task.status === "Done" ? "Reopen" : "Complete"} ${task.title}`}
          disabled={busy}
          onClick={() =>
            setTaskStatus(task, task.status === "Done" ? "To do" : "Done")
          }
        >
          {task.status === "Done" ? <Check size={16} /> : null}
        </button>
        <div>
          <b>
            {task.title}
            {task.priority === "High" && (
              <span className="task-priority">High priority</span>
            )}
          </b>
          <small>
            {projectName(task.projectId)} ·{" "}
            {data.members.find((m) => m.id === task.assigneeId)?.name ||
              "Unassigned"}{" "}
            · {task.stage}
          </small>
        </div>
        <span className={isOverdue(task) ? "due-date overdue" : "due-date"}>
          {isOverdue(task) && <TriangleAlert size={13} />} {dateLabel(task.due)}
        </span>
        <select
          aria-label={`Status for ${task.title}`}
          value={task.status}
          disabled={busy}
          onChange={(e) =>
            setTaskStatus(task, e.target.value as StudioTask["status"])
          }
        >
          {["To do", "Doing", "Done"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {owner && (
          <button
            className="studio-task-edit"
            aria-label={`Edit ${task.title}`}
            onClick={() => open("task", task)}
          >
            Edit
          </button>
        )}
      </div>
    ));
  const approvalCards = (approvals: Approval[]) =>
    approvals.map((approval) => (
      <ApprovalCard
        key={approval.id}
        approval={approval}
        project={projectName(approval.projectId)}
        canDecide={approval.reviewerId === member.id}
        busy={busy}
        onDecide={(status, response) => decide(approval, status, response)}
      />
    ));
  const projectCards = data.projects
    .filter((p) => matches(`${p.name} ${p.clientName} ${p.location}`))
    .map((p) => (
      <button
        className="studio-project-card"
        key={p.id}
        onClick={() => navigate("Projects", p.id)}
      >
        <div className="project-photo">
          <img src={asset(p.image || "/images/living.jpg")} alt="" />
          <Badge>{p.status}</Badge>
        </div>
        <div className="project-card-body">
          <div>
            <h3>{p.name}</h3>
            <ArrowRight size={18} />
          </div>
          <p>
            {p.clientName} · {p.location}
          </p>
          <Progress value={p.progress} />
          <small>Handover target · {dateLabel(p.end)}</small>
        </div>
      </button>
    ));
  const updateCards = (updates: StudioData["updates"]) =>
    updates
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((u) => (
        <article className="studio-update" key={u.id}>
          <div className="update-heading">
            <Avatar name={u.authorName} />
            <div>
              <b>{u.authorName}</b>
              <small>
                {projectName(u.projectId)} · {u.room} · {dateLabel(u.date)}
              </small>
            </div>
            <Badge>
              {u.clientVisible ? "Shared with client" : "Team only"}
            </Badge>
          </div>
          <p>{u.summary}</p>
          {u.blocker && (
            <div className="blocker-note">
              <TriangleAlert size={16} />
              <span>
                <b>Needs attention</b>
                {u.blocker}
              </span>
            </div>
          )}
        </article>
      ));
  const fileCards = projectRecords(data.files)
    .filter((f) =>
      matches([projectName(f.projectId), f.name, f.room, f.caption].join(" ")),
    )
    .map((photo) => (
      <PhotoCard
        key={photo.id}
        photo={photo}
        company={data.id}
        project={projectName(photo.projectId)}
        demo={demo}
      />
    ));
  const actions = (
    <div className="studio-quick-actions">
      {!client && (
        <Button
          variant={member.role === "supervisor" ? "primary" : "secondary"}
          onClick={() => open("file")}
        >
          <Camera size={17} />
          Upload photos
        </Button>
      )}
      {owner && (
        <Button variant="primary" onClick={() => open("project")}>
          <Plus size={17} />
          New project
        </Button>
      )}
      {!client && (
        <Button onClick={() => open("task")}>
          <ListChecks size={17} />
          Add task
        </Button>
      )}
      {!client && (
        <Button
          variant={member.role === "supervisor" ? "primary" : "secondary"}
          onClick={() => open("update")}
        >
          <HardHat size={17} />
          Post site update
        </Button>
      )}
      {!client && (
        <Button onClick={() => open("approval")}>
          <Send size={17} />
          Request approval
        </Button>
      )}
      {client && (
        <Button variant="primary" onClick={() => navigate("Approvals")}>
          <CheckCircle2 size={17} />
          Review decisions
        </Button>
      )}
    </div>
  );
  const primary: Partial<
    Record<StudioPage, { label: string; kind: DialogKind }>
  > = owner
    ? {
        Projects: { label: "New project", kind: "project" },
        Tasks: { label: "Add task", kind: "task" },
        Approvals: { label: "Request approval", kind: "approval" },
        "Site updates": { label: "Post site update", kind: "update" },
        Materials: { label: "Add material", kind: "material" },
        Photos: { label: "Upload photos", kind: "file" },
        Team: { label: "Invite someone", kind: "invite" },
      }
    : client
      ? {}
      : {
          Tasks: { label: "Add task", kind: "task" },
          Approvals: { label: "Request approval", kind: "approval" },
          "Site updates": { label: "Post site update", kind: "update" },
          Materials: { label: "Add material", kind: "material" },
          Photos: { label: "Upload photos", kind: "file" },
        };
  if ((!demo && !cloudData) || (demo && !local))
    return (
      <div className="studio-loading">
        <Busy text="Opening your workspace…" />
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="studio-app">
      <a className="skip-link" href="#studio-main">
        Skip to workspace
      </a>
      <div
        className={`studio-scrim ${drawer ? "visible" : ""}`}
        onClick={() => setDrawer(false)}
      />
      <aside className={`studio-sidebar ${drawer ? "open" : ""}`}>
        <Brand />
        <button
          className="studio-close-menu"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X />
        </button>
        <div className="studio-company">
          <Building2 size={18} />
          <span>
            {data.name}
            <small>{roleNames[member.role]}</small>
          </span>
        </div>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Studio navigation">
          {pages.map((p) => {
            const Icon = pageIcons[p];
            return (
              <button
                key={p}
                aria-current={page === p ? "page" : undefined}
                className={page === p ? "active" : ""}
                onClick={() => navigate(p)}
              >
                <Icon size={19} />
                <span>
                  {p === "Tasks" ? (owner ? "Team tasks" : "My tasks") : p}
                </span>
                {p === "Approvals" && myDecisions.length > 0 && (
                  <b>{myDecisions.length}</b>
                )}
              </button>
            );
          })}
        </nav>
        <div className="studio-sidebar-bottom">
          {demo && (
            <label className="demo-role-label">
              Explore another role
              <select
                aria-label="Demo role"
                value={demoRole}
                onChange={(e) => changeDemoRole?.(e.target.value as StudioRole)}
              >
                {Object.entries(roleNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="studio-person">
            <Avatar name={member.name} />
            <span>
              <b>{member.name}</b>
              <small>{demo ? "Demo workspace" : "Company workspace"}</small>
            </span>
          </div>
          <button
            onClick={() => {
              onLeave();
            }}
          >
            <LogOut size={17} />
            {demo ? "Back to welcome" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="studio-content">
        <header className="studio-topbar">
          <button
            className="icon-btn studio-open-menu"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <span>
            <Home size={16} />
            {data.name}
            <span>/</span>
            <b>{page}</b>
          </span>
          <label>
            <Search size={17} />
            <input
              aria-label="Search current page"
              placeholder="Search this page…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className={`studio-connection ${online ? "" : "offline"}`}>
            <i />
            {demo ? "Device demo" : online ? "Team connected" : "Offline view"}
          </span>
        </header>
        <main id="studio-main">
          {!demo && (
            <div className="studio-development-note">
              <Cloud size={16} />
              Development workspace · use this studio for testing.
            </div>
          )}
          {demo && (
            <div className="studio-demo-note">
              <span>DEMO</span>Explore the{" "}
              {roleNames[member.role].toLowerCase()} workflow. Changes are saved
              on this device.
              <button
                onClick={() => {
                  onLeave();
                }}
              >
                Company sign-in
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {!online && !demo && (
            <div className="studio-info">
              You are offline. Reconnect to save team changes.
            </div>
          )}
          {needsUpdate && (
            <div className="studio-info">
              An updated Interior Que is ready.
              <Button onClick={() => updateServiceWorker(true)}>
                Update app
              </Button>
            </div>
          )}
          <div className="studio-page-heading">
            <div>
              <span className="eyebrow">
                {page === "Today"
                  ? roleNames[member.role].toUpperCase()
                  : "INTERIOR QUE WORKSPACE"}
              </span>
              <h1>
                {page === "Today"
                  ? `Hello, ${member.name.replace(/^(Mr\.?|Mrs\.?|Dr\.?)\s*/, "").split(" ")[0]}.`
                  : currentProject
                    ? currentProject.name
                    : page === "Tasks"
                      ? owner
                        ? "Team tasks"
                        : "My tasks"
                      : page === "Approvals"
                        ? "Decisions, made clear."
                        : page}
              </h1>
              <p>
                {page === "Today"
                  ? roleCopy[member.role].description
                  : currentProject
                    ? `${currentProject.clientName} · ${currentProject.location}`
                    : page === "Tasks"
                      ? "Know what to do, who owns it and when it is due."
                      : page === "Approvals"
                        ? "A clear record of what was approved and what needs to change."
                        : "Everything you need, in one place."}
              </p>
            </div>
            {primary[page] && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => open(primary[page]!.kind)}
              >
                <Plus size={17} />
                {primary[page]!.label}
              </Button>
            )}
          </div>
          {error && (
            <div className="studio-error" role="alert">
              <TriangleAlert size={17} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="studio-success" role="status">
              <CheckCircle2 size={17} />
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Today" && (
            <>
              <div className="studio-summary">
                {[
                  {
                    label: client ? "Your projects" : "Projects in motion",
                    value: data.projects.filter((p) => p.status !== "Completed")
                      .length,
                    text: "Open your project overview",
                    target: "Projects",
                  },
                  {
                    label: client
                      ? "Decisions for you"
                      : owner
                        ? "Team open tasks"
                        : "My open tasks",
                    value: client ? myDecisions.length : myTasks.length,
                    text: client
                      ? "Review and respond"
                      : "Pick up your next task",
                    target: client ? "Approvals" : "Tasks",
                  },
                  {
                    label: client ? "Shared site updates" : "Overdue tasks",
                    value: client ? data.updates.length : urgent.length,
                    text: client
                      ? "See the latest progress"
                      : "Help the team catch up",
                    target: client ? "Site updates" : "Tasks",
                  },
                  {
                    label: client ? "Shared photos" : "Awaiting approval",
                    value: client ? data.files.length : waiting.length,
                    text: client
                      ? "View photos shared by your team"
                      : "See what needs a decision",
                    target: client ? "Photos" : "Approvals",
                  },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      navigate(s.target as StudioPage);
                      if (s.label === "Overdue tasks") setTaskFilter("Overdue");
                      if (s.label === "Team open tasks")
                        setTaskFilter("Team tasks");
                    }}
                  >
                    <span>
                      {s.label}
                      <ArrowRight size={17} />
                    </span>
                    <b>{s.value}</b>
                    <small>{s.text}</small>
                  </button>
                ))}
              </div>
              <div className="studio-today-intro">
                <div>
                  <span className="eyebrow">TODAY, MADE SIMPLE</span>
                  <h2>{roleCopy[member.role].title}</h2>
                  <p>
                    {client
                      ? "Your team shares the work here. You can review decisions as they come in."
                      : "Start with one clear action. The rest of your team can follow the progress."}
                  </p>
                </div>
                {actions}
              </div>
              <div className="studio-two-columns">
                <section className="studio-panel">
                  <div className="studio-section-heading">
                    <h2>
                      {client
                        ? "Your decisions"
                        : owner
                          ? "Next tasks across your team"
                          : "Your next tasks"}
                    </h2>
                    <button
                      onClick={() => navigate(client ? "Approvals" : "Tasks")}
                    >
                      View all
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {client ? (
                    myDecisions.length ? (
                      approvalCards(myDecisions)
                    ) : (
                      <Empty
                        title="No decisions waiting"
                        text="Your team will request your review when a design choice is ready."
                      />
                    )
                  ) : myTasks.length ? (
                    taskRows(
                      [...myTasks].sort((a, b) => a.due.localeCompare(b.due)),
                      5,
                    )
                  ) : (
                    <Empty
                      title="Your task list is clear"
                      text="Pick up a team task or ask your owner to assign your next piece of work."
                      action={
                        <Button
                          onClick={() => {
                            setTaskFilter("Team tasks");
                            navigate("Tasks");
                          }}
                        >
                          View team tasks
                        </Button>
                      }
                    />
                  )}
                </section>
                <section className="studio-panel">
                  <div className="studio-section-heading">
                    <h2>
                      {client
                        ? "Latest from your site"
                        : "What needs attention"}
                    </h2>
                    <button onClick={() => navigate("Site updates")}>
                      View updates
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {client ? (
                    updateCards(data.updates.slice(0, 2))
                  ) : blockers.length ? (
                    blockers.slice(0, 3).map((u) => (
                      <button
                        className="attention-row"
                        key={u.id}
                        onClick={() => navigate("Site updates", u.projectId)}
                      >
                        <span>
                          <TriangleAlert size={18} />
                        </span>
                        <div>
                          <b>{u.blocker}</b>
                          <small>
                            {projectName(u.projectId)} · {dateLabel(u.date)}
                          </small>
                        </div>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  ) : (
                    <Empty
                      title="No blockers reported"
                      text="Site updates will bring problems to everyone’s attention."
                    />
                  )}
                  {!client && waiting.length > 0 && (
                    <button
                      className="attention-row"
                      onClick={() => navigate("Approvals")}
                    >
                      <span>
                        <Clock size={18} />
                      </span>
                      <div>
                        <b>
                          {waiting.length} decision
                          {waiting.length === 1 ? "" : "s"} awaiting review
                        </b>
                        <small>
                          Keep material orders and site work moving.
                        </small>
                      </div>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </section>
              </div>
              <section className="studio-project-section">
                <div className="studio-section-heading">
                  <h2>
                    {client ? "Your project" : "A closer look at your projects"}
                  </h2>
                  <button onClick={() => navigate("Projects")}>
                    All projects
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="studio-project-grid">
                  {projectCards.slice(0, 3)}
                </div>
                {!data.projects.length && (
                  <Empty
                    title={
                      owner
                        ? "Let’s start your first project."
                        : "No projects assigned yet"
                    }
                    text={
                      owner
                        ? "Add a client name and handover date. We’ll create a simple checklist to get the team started."
                        : "Your owner will assign the projects you need to work on."
                    }
                    action={
                      owner ? (
                        <Button
                          variant="primary"
                          onClick={() => open("project")}
                        >
                          Create project
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </section>
            </>
          )}
          {page === "Projects" &&
            (currentProject ? (
              <>
                <button
                  className="studio-back"
                  onClick={() => navigate("Projects")}
                >
                  <ArrowLeft size={16} />
                  All projects
                </button>
                <div className="studio-project-overview">
                  <img
                    src={asset(currentProject.image)}
                    alt="Project design reference"
                  />
                  <div>
                    <Badge>{currentProject.status}</Badge>
                    <h2>{currentProject.name}</h2>
                    <p>{currentProject.brief}</p>
                    <span>
                      Handover target · {dateLabel(currentProject.end)}
                    </span>
                    <Progress value={currentProject.progress} />
                    <div className="studio-quick-actions">
                      {!client && (
                        <Button onClick={() => open("task")}>
                          <Plus size={16} />
                          Add task
                        </Button>
                      )}
                      {!client && (
                        <Button
                          variant="primary"
                          onClick={() => open("update")}
                        >
                          <HardHat size={16} />
                          Post update
                        </Button>
                      )}
                      <Button
                        onClick={() => navigate("Approvals", currentProject.id)}
                      >
                        View approvals
                        <ArrowRight size={16} />
                      </Button>
                      {owner && (
                        <Button onClick={() => open("project", currentProject)}>
                          Edit project
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="studio-two-columns">
                  <section className="studio-panel">
                    <div className="studio-section-heading">
                      <h2>
                        {client ? "Project decisions" : "Project checklist"}
                      </h2>
                    </div>
                    {client
                      ? approvalCards(projectRecords(data.approvals))
                      : taskRows(projectRecords(data.tasks))}
                  </section>
                  <section className="studio-panel">
                    <div className="studio-section-heading">
                      <h2>Latest site updates</h2>
                    </div>
                    {updateCards(projectRecords(data.updates).slice(0, 3))}
                    {!projectRecords(data.updates).length && (
                      <Empty
                        title="No site updates yet"
                        text="Progress will appear here as your team records the work."
                      />
                    )}
                  </section>
                </div>
                <section className="studio-panel">
                  <div className="studio-section-heading">
                    <h2>Project photos</h2>
                    <button
                      onClick={() => navigate("Photos", currentProject.id)}
                    >
                      View all photos
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="studio-file-grid">{fileCards}</div>
                </section>
              </>
            ) : (
              <div className="studio-project-grid">
                {projectCards}
                {!projectCards.length && (
                  <Empty
                    title="No projects found"
                    text={
                      query
                        ? "Try a different search."
                        : "Create a project or ask your company owner for project access."
                    }
                  />
                )}
              </div>
            ))}
          {page === "Tasks" && !client && (
            <section className="studio-panel">
              <div className="studio-filters">
                {["My tasks", "Team tasks", "Overdue", "Completed"].map(
                  (filter) => (
                    <button
                      key={filter}
                      aria-pressed={taskFilter === filter}
                      onClick={() => setTaskFilter(filter)}
                    >
                      {filter}
                    </button>
                  ),
                )}
              </div>
              {(() => {
                const tasks = projectRecords(data.tasks)
                  .filter(
                    (t) =>
                      matches(t.title) &&
                      (taskFilter === "My tasks"
                        ? t.assigneeId === member.id && t.status !== "Done"
                        : taskFilter === "Overdue"
                          ? isOverdue(t)
                          : taskFilter === "Completed"
                            ? t.status === "Done"
                            : t.status !== "Done"),
                  )
                  .sort((a, b) => a.due.localeCompare(b.due));
                return tasks.length ? (
                  taskRows(tasks)
                ) : (
                  <Empty
                    title="Nothing on this list"
                    text="Try Team tasks, or add a task with a clear assignee and due date."
                  />
                );
              })()}
            </section>
          )}
          {page === "Approvals" && (
            <>
              <div className="studio-info">
                <CheckCircle2 size={18} />
                {myDecisions.length} decision
                {myDecisions.length === 1 ? "" : "s"} awaiting your review.
                Approvals stay with the project.
              </div>
              <div className="studio-approval-grid">
                {approvalCards(
                  projectRecords(data.approvals)
                    .filter((a) => matches(`${a.title} ${a.description}`))
                    .sort((a, b) => a.status.localeCompare(b.status)),
                )}
              </div>
              {!data.approvals.length && (
                <Empty
                  title="No approval requests yet"
                  text={
                    client
                      ? "Your team will share decisions when they are ready."
                      : "Send a drawing or material decision to the person who needs to review it."
                  }
                />
              )}
            </>
          )}
          {page === "Site updates" && (
            <div className="studio-update-list">
              {updateCards(
                projectRecords(data.updates).filter((u) =>
                  matches(`${u.summary} ${u.room} ${u.blocker}`),
                ),
              )}
              {!data.updates.length && (
                <Empty
                  title="No site updates yet"
                  text="A short daily update keeps everyone on the same page."
                />
              )}
            </div>
          )}
          {page === "Materials" && !client && (
            <section className="studio-panel">
              <div className="studio-info">
                Plan what the project needs. Move each item from “To order” to
                “On site” when it arrives.
              </div>
              {projectRecords(data.materials)
                .filter((m) => matches(m.name))
                .map((m) => (
                  <div className="studio-task-row" key={m.id}>
                    <Package size={21} />
                    <div>
                      <b>{m.name}</b>
                      <small>
                        {projectName(m.projectId)} · {m.quantity} {m.unit} ·{" "}
                        {m.notes}
                      </small>
                    </div>
                    <select
                      aria-label={`Delivery status for ${m.name}`}
                      value={m.status}
                      disabled={busy}
                      onChange={(e) =>
                        run(
                          () =>
                            patch("materials", m.id, {
                              status: e.target.value,
                            }),
                          "Material delivery status updated.",
                        )
                      }
                    >
                      {["To order", "Ordered", "On site"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))}
              {!data.materials.length && (
                <Empty
                  title="Start a material list"
                  text="Keep the quantities and delivery status beside the project."
                />
              )}
            </section>
          )}
          {page === "Photos" && (
            <>
              <div className="studio-info">
                <Cloud size={18} />
                {client
                  ? "View the project photos your team has shared with you."
                  : "Choose photos, upload, and follow the progress. Photos are private unless shared with the client."}
              </div>
              {!client && (
                <StorageMeter
                  company={data.id}
                  demo={demo}
                  photos={data.files}
                  refresh={photoRefresh}
                />
              )}
              <div className="studio-file-grid">{fileCards}</div>
              {!data.files.length && (
                <Empty
                  title="A place for your project photos"
                  text="Upload site photos and design references to the project."
                />
              )}
            </>
          )}
          {page === "Money" && owner && (
            <Suspense fallback={<Busy text="Opening your money workspace…" />}>
              <MoneyWorkspace
                data={data}
                query={query}
                busy={busy}
                onSave={(record) =>
                  run(() => save("payments", record), "Transaction saved.")
                }
                onCategory={(record) =>
                  run(() => save("moneyCategories", record), "Category saved.")
                }
                onOpening={(record) =>
                  run(() => save("cashOpenings", record), "Opening cash saved.")
                }
              />
            </Suspense>
          )}
          {page === "Team" && owner && (
            <>
              <div className="studio-info">
                Invite by email and choose project access. An invitation does
                not send an email; copy the join link and share it with that
                person.
              </div>
              <div className="studio-team-grid">
                {data.members.map((m) => (
                  <article className="studio-person-card" key={m.id}>
                    <Avatar name={m.name} size={48} />
                    <h3>{m.name}</h3>
                    <p>{m.email}</p>
                    <Badge>
                      {m.active === false ? "Access paused" : roleNames[m.role]}
                    </Badge>
                    <small>
                      {m.role === "owner"
                        ? "All projects"
                        : m.projectIds.map(projectName).join(", ") ||
                          "No assigned projects"}
                    </small>
                    {m.role !== "owner" && (
                      <Button onClick={() => open("member", m)}>
                        Manage access
                      </Button>
                    )}
                  </article>
                ))}
              </div>
              <section className="studio-panel">
                <div className="studio-section-heading">
                  <h2>Invitations</h2>
                  <button
                    onClick={() =>
                      run(async () => {
                        await navigator.clipboard.writeText(
                          `${location.origin}${import.meta.env.BASE_URL}?studio=${data.id}`,
                        );
                      }, "Join link copied. Share it with the invited person.")
                    }
                  >
                    <Copy size={16} />
                    Copy join link
                  </button>
                </div>
                {data.invites.map((invite) => (
                  <div className="studio-task-row" key={invite.id}>
                    <Users size={19} />
                    <div>
                      <b>{invite.name}</b>
                      <small>
                        {invite.email} · {roleNames[invite.role]} ·{" "}
                        {invite.projectIds.length} projects
                      </small>
                    </div>
                    <Badge>{invite.status}</Badge>
                  </div>
                ))}
                {!data.invites.length && (
                  <Empty
                    title="Bring your people together"
                    text="Invite your designers, supervisors and clients with the access they need."
                  />
                )}
              </section>
            </>
          )}
          {page === "Settings" && (
            <div className="studio-two-columns">
              <section className="studio-panel">
                <h2>Your workspace</h2>
                <p>{data.name}</p>
                <Badge>{roleNames[member.role]}</Badge>
                <p>
                  You can access{" "}
                  {owner
                    ? "all company projects"
                    : `${data.projects.length} assigned project${data.projects.length === 1 ? "" : "s"}`}
                  .
                </p>
                {owner && !demo && (
                  <p>
                    Company code: <code>{data.id}</code>
                  </p>
                )}
                {demo && (
                  <p>
                    This is a demonstration on this device. Role switching is
                    available only in the demo.
                  </p>
                )}
              </section>
              <section className="studio-panel">
                <h2>Project photo storage</h2>
                <p>
                  {client
                    ? "Your team shares project photos here for you to view."
                    : "Upload from a phone or computer. Photos stay private to the project team unless you share them with the client."}
                </p>
                {!client && (
                  <StorageMeter
                    company={data.id}
                    demo={demo}
                    photos={data.files}
                    refresh={photoRefresh}
                  />
                )}
                <div className="studio-info">
                  Interior Que is in development. DesignQuote production
                  accounts, records and subscriptions are not changed by this
                  workspace.
                </div>
              </section>
            </div>
          )}
          <footer className="studio-footer">
            Interior Que · One clear next step.
          </footer>
        </main>
        <nav
          className="studio-mobile-nav"
          aria-label="Mobile workspace navigation"
        >
          {(["Today", "Projects", "Approvals"] as StudioPage[]).map((p) => {
            const Icon = pageIcons[p];
            return (
              <button
                key={p}
                aria-current={page === p ? "page" : undefined}
                onClick={() => navigate(p)}
              >
                <Icon size={20} />
                <span>{p}</span>
              </button>
            );
          })}
          <button
            aria-label="More pages"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
      {dialog?.kind === "file" && !client && (
        <PhotoUploader
          company={data.id}
          projects={data.projects}
          initialProject={projectId}
          authorId={member.id}
          demo={demo}
          onDemoSave={(photo) => save("files", photo)}
          onClose={() => setDialog(null)}
          onUploaded={() => setPhotoRefresh((n) => n + 1)}
        />
      )}
      {dialog && dialog.kind !== "file" && (
        <StudioDialog
          kind={dialog.kind}
          record={dialog.record}
          data={data}
          member={member}
          projectId={projectId}
          busy={busy}
          workspaceError={error}
          onClose={() => setDialog(null)}
          onSubmit={async (fd) => {
            const f = (key: string) => String(fd.get(key) || "").trim(),
              id = dialog.record?.id || uid(),
              project = f("projectId");
            const kind = dialog.kind;
            const ok = await run(
              async () => {
                if (
                  !["project", "member", "invite"].includes(kind) &&
                  !canAccessProject(member, project)
                )
                  throw new Error("Choose a project you can access.");
                if (kind === "project") {
                  if (!owner)
                    throw new Error(
                      "Only the owner can create or edit projects.",
                    );
                  if (f("end") < f("start"))
                    throw new Error(
                      "The handover date must be after the start date.",
                    );
                  const p = {
                    id,
                    name: f("name"),
                    clientName: f("clientName"),
                    location: f("location"),
                    start: f("start"),
                    end: f("end"),
                    progress: dialog.record?.progress || 0,
                    status: f("status") || dialog.record?.status || "Planning",
                    brief: f("brief"),
                    image: dialog.record?.image || "/images/living.jpg",
                  };
                  if (dialog.record) await save("projects", p);
                  else {
                    const tasks = projectStarter(id, member.id, p.end);
                    if (demo)
                      await persist((s) => ({
                        ...s,
                        projects: [p, ...s.projects],
                        tasks: [...tasks, ...s.tasks],
                      }));
                    else await cloud.createProject(data.id, p, tasks);
                  }
                }
                if (kind === "task") {
                  const task: StudioTask = {
                    id,
                    projectId: project,
                    title: f("title"),
                    assigneeId: f("assigneeId"),
                    due: f("due"),
                    stage: f("stage"),
                    priority: f("priority") as StudioTask["priority"],
                    status: dialog.record?.status || "To do",
                  };
                  if (demo) {
                    await save("tasks", task);
                    const tasks = [
                      ...data.tasks.filter(
                        (t) => t.projectId === project && t.id !== id,
                      ),
                      task,
                    ];
                    const progress = taskProgress(tasks);
                    await patch("projects", project, {
                      progress,
                      status:
                        progress === 100
                          ? "Completed"
                          : progress > 0
                            ? "In progress"
                            : "Planning",
                    });
                  } else await cloud.saveTask(data.id, task);
                }
                if (kind === "update")
                  await save("updates", {
                    id,
                    projectId: project,
                    authorId: member.id,
                    authorName: member.name,
                    date: today(),
                    room: f("room"),
                    summary: f("summary"),
                    blocker: f("blocker"),
                    clientVisible: fd.has("clientVisible"),
                  });
                if (kind === "material") {
                  const quantity = Number(f("quantity"));
                  if (!(quantity > 0))
                    throw new Error("Enter a quantity greater than zero.");
                  await save("materials", {
                    id,
                    projectId: project,
                    name: f("name"),
                    quantity,
                    unit: f("unit"),
                    status: "To order",
                    notes: f("notes"),
                  });
                }
                if (kind === "approval") {
                  const reviewer = data.members.find(
                    (m) => m.id === f("reviewerId"),
                  );
                  if (
                    !reviewer ||
                    reviewer.active === false ||
                    !canAccessProject(reviewer, project)
                  )
                    throw new Error(
                      "The reviewer needs access to this project.",
                    );
                  if (reviewer.role === "client" && !fd.has("clientVisible"))
                    throw new Error(
                      "Enable Share with client for a client decision.",
                    );
                  await save("approvals", {
                    id,
                    projectId: project,
                    title: f("title"),
                    description: f("description"),
                    reviewerId: f("reviewerId"),
                    authorId: member.id,
                    due: f("due"),
                    status: "Awaiting decision",
                    response: "",
                    clientVisible: fd.has("clientVisible"),
                  });
                }
                if (kind === "payment") {
                  const amount = Number(f("amount"));
                  if (!owner || !(amount > 0))
                    throw new Error("Enter an amount greater than zero.");
                  await save("payments", {
                    id,
                    projectId: project,
                    description: f("description"),
                    amount,
                    type: f("type"),
                    date: f("date"),
                  });
                }
                if (kind === "invite" || kind === "member") {
                  if (!owner)
                    throw new Error("Only the owner can manage access.");
                  const projectIds = fd.getAll("projectIds").map(String);
                  if (projectIds.length > 25)
                    throw new Error("Choose up to 25 projects per person.");
                  const role = f("role") as StudioRole;
                  if (!["designer", "supervisor", "client"].includes(role))
                    throw new Error("Choose a valid role.");
                  const record = {
                    id: kind === "invite" ? f("email").toLowerCase() : id,
                    name: f("name"),
                    email:
                      kind === "invite"
                        ? f("email").toLowerCase()
                        : dialog.record.email,
                    role,
                    projectIds,
                    ...(kind === "invite"
                      ? { status: "Pending" }
                      : { active: fd.has("active") }),
                  };
                  await save(kind === "invite" ? "invites" : "members", record);
                }
              },
              dialog.kind === "invite"
                ? "Invitation saved. Copy the join link from Team and share it with this person."
                : "Saved to the project.",
            );
            if (ok) setDialog(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function ApprovalCard({
  approval,
  project,
  canDecide,
  busy,
  onDecide,
}: {
  approval: Approval;
  project: string;
  canDecide: boolean;
  busy: boolean;
  onDecide: (
    status: "Approved" | "Changes requested",
    response: string,
  ) => Promise<boolean>;
}) {
  const [response, setResponse] = useState("");
  const [validation, setValidation] = useState("");
  return (
    <article className="studio-approval">
      <div>
        <span>{project}</span>
        <Badge>{approval.status}</Badge>
      </div>
      <h3>{approval.title}</h3>
      <p>{approval.description}</p>
      <small>
        Review by {dateLabel(approval.due)} ·{" "}
        {approval.clientVisible ? "Shared with client" : "Team only"}
      </small>
      {approval.response && (
        <div className="approval-response">
          <b>Review notes</b>
          <p>{approval.response}</p>
        </div>
      )}
      {canDecide && approval.status === "Awaiting decision" && (
        <>
          <label>
            Review notes
            <textarea
              aria-label={`Review notes for ${approval.title}`}
              placeholder="Add a note, or tell the team what should change…"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              maxLength={2000}
            />
          </label>
          {validation && (
            <p className="studio-error" role="alert">
              {validation}
            </p>
          )}
          <div className="approval-buttons">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setValidation("");
                onDecide("Approved", response);
              }}
            >
              <Check size={16} />
              Approve
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (!response.trim()) {
                  setValidation("Tell the team what needs to change first.");
                  return;
                }
                setValidation("");
                onDecide("Changes requested", response);
              }}
            >
              Request changes
            </Button>
          </div>
        </>
      )}
      {!canDecide && approval.status === "Awaiting decision" && (
        <p className="approval-waiting">
          <Clock size={15} />
          Waiting for the assigned reviewer
        </p>
      )}
    </article>
  );
}
function StudioDialog({
  kind,
  record,
  data,
  member,
  projectId,
  busy,
  workspaceError,
  onClose,
  onSubmit,
}: {
  kind: DialogKind;
  record?: any;
  data: StudioData;
  member: StudioMember;
  projectId: string;
  busy: boolean;
  workspaceError: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(
    record?.projectId || projectId || data.projects[0]?.id || "",
  );
  const [error, setError] = useState("");
  const titles: Record<DialogKind, string> = {
    project: record ? "Edit project" : "Start a project",
    task: record ? "Edit task" : "Add a clear next task",
    update: "A quick update from the site",
    approval: "Request a decision",
    file: "Upload project photos",
    payment: "Record a transaction",
    invite: "Invite someone to your studio",
    member: "Manage project access",
    material: "Plan a project material",
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    try {
      const ok = await onSubmit(new FormData(e.currentTarget));
      if (!ok)
        setError(
          "The change was not saved. Check the workspace message and try again.",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={titles[kind]}
      subtitle="Keep it simple. You can add more detail as work progresses."
      onClose={busy ? () => {} : onClose}
    >
      <form className="studio-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          {!["project", "invite", "member"].includes(kind) && (
            <label className="field">
              <span>Project *</span>
              <select
                name="projectId"
                aria-readonly={kind === "task" && !!record}
                value={selected}
                onChange={(e) => {
                  if (kind !== "task" || !record) setSelected(e.target.value);
                }}
                required
              >
                <option value="">Choose a project</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "project" && (
            <>
              <Field
                label="Project name"
                name="name"
                value={record?.name}
                required
                placeholder="e.g. Meera’s 3BHK home"
              />
              <div className="form-grid">
                <Field
                  label="Client name"
                  name="clientName"
                  value={record?.clientName}
                  required
                />
                <Field
                  label="Site location"
                  name="location"
                  value={record?.location}
                  required
                />
                <Field
                  label="Start date"
                  name="start"
                  type="date"
                  value={record?.start || today()}
                  required
                />
                <Field
                  label="Handover target"
                  name="end"
                  type="date"
                  value={record?.end || today()}
                  required
                />
              </div>
              <Field
                label="Project status"
                name="status"
                value={record?.status || "Planning"}
              >
                <option>Planning</option>
                <option>In progress</option>
                <option>Delayed</option>
                <option>Completed</option>
              </Field>
              <Field
                label="Project brief"
                name="brief"
                type="textarea"
                value={record?.brief}
                placeholder="What are we creating?"
              />
              <div className="studio-info">
                <ListChecks size={18} />
                {record
                  ? "Project tasks and access remain linked to this project."
                  : "We’ll add a five-step checklist: design, materials, execution, finishing and handover. Assign people from Team."}
              </div>
            </>
          )}
          {kind === "task" && (
            <>
              <Field
                label="What needs to be done?"
                name="title"
                value={record?.title}
                required
                placeholder="e.g. Confirm kitchen electrical points"
              />
              <div className="form-grid">
                <Field
                  label="Assigned to"
                  name="assigneeId"
                  value={record?.assigneeId || member.id}
                >
                  <option value="">Unassigned</option>
                  {data.members
                    .filter(
                      (m) =>
                        m.role !== "client" &&
                        m.active !== false &&
                        canAccessProject(m, selected),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </Field>
                <Field
                  label="Due date"
                  name="due"
                  type="date"
                  value={record?.due || today()}
                  required
                />
                <Field
                  label="Project stage"
                  name="stage"
                  value={record?.stage || "Execution"}
                >
                  {lifecycle.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Field>
                <Field
                  label="Priority"
                  name="priority"
                  value={record?.priority || "Normal"}
                >
                  <option>Normal</option>
                  <option>High</option>
                </Field>
              </div>
            </>
          )}
          {kind === "update" && (
            <>
              <Field
                label="Room / area"
                name="room"
                required
                placeholder="e.g. Living room"
              />
              <Field
                label="What was completed or worked on?"
                name="summary"
                type="textarea"
                required
                placeholder="A short, useful update for the team…"
              />
              <Field
                label="Anything blocking the work? (optional)"
                name="blocker"
                type="textarea"
                placeholder="e.g. Waiting for laminate approval"
              />
              <ShareWithClient />
              <p className="form-hint">
                Add progress photos from Photos after posting the update.
              </p>
            </>
          )}
          {kind === "material" && (
            <>
              <Field label="Material name" name="name" required />
              <div className="form-grid">
                <Field
                  label="Quantity"
                  name="quantity"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                />
                <Field label="Unit" name="unit" value="Nos">
                  <option>Nos</option>
                  <option>Sheet</option>
                  <option>Sq.ft</option>
                  <option>Set</option>
                  <option>Litre</option>
                  <option>Kg</option>
                </Field>
              </div>
              <Field
                label="Delivery notes"
                name="notes"
                type="textarea"
                placeholder="Supplier, needed-by date or specification"
              />
            </>
          )}
          {kind === "approval" && (
            <>
              <Field
                label="Decision title"
                name="title"
                required
                placeholder="e.g. Approve the kitchen laminate"
              />
              <Field
                label="What should the reviewer check?"
                name="description"
                type="textarea"
                required
              />
              <div className="form-grid">
                <Field label="Who should review it?" name="reviewerId" required>
                  <option value="">Choose a reviewer</option>
                  {data.members
                    .filter(
                      (m) =>
                        m.active !== false && canAccessProject(m, selected),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {roleNames[m.role]}
                      </option>
                    ))}
                </Field>
                <Field
                  label="Review by"
                  name="due"
                  type="date"
                  value={record?.due || today()}
                  required
                />
              </div>
              <ShareWithClient />
              <p className="form-hint">
                Add the drawing or reference to this project’s Photos. The
                reviewer can find it beside the decision.
              </p>
            </>
          )}
          {kind === "payment" && (
            <>
              <div className="form-grid">
                <Field label="Transaction" name="type" value="Received">
                  <option>Received</option>
                  <option>Spent</option>
                </Field>
                <Field
                  label="Amount (₹)"
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                />
                <Field
                  label="Date"
                  name="date"
                  type="date"
                  value={today()}
                  required
                />
              </div>
              <Field
                label="Description"
                name="description"
                required
                placeholder="e.g. Client installment or carpentry labour"
              />
              <p className="form-hint">
                Visible to the owner. This records a transaction and does not
                transfer money.
              </p>
            </>
          )}
          {(kind === "invite" || kind === "member") && (
            <>
              <Field
                label="Full name"
                name="name"
                value={record?.name}
                required
              />
              {kind === "invite" ? (
                <Field
                  label="Google account email"
                  name="email"
                  type="email"
                  required
                />
              ) : (
                <p>{record?.email}</p>
              )}
              <Field
                label="Workspace role"
                name="role"
                value={record?.role || "designer"}
              >
                <option value="designer">Designer</option>
                <option value="supervisor">Site supervisor</option>
                <option value="client">Client</option>
              </Field>
              <div className="access-projects">
                <span>Choose projects they can access</span>
                {data.projects.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      name="projectIds"
                      value={p.id}
                      defaultChecked={record?.projectIds?.includes(p.id)}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
                {!data.projects.length && (
                  <p>Create a project first to assign access.</p>
                )}
              </div>
              {kind === "member" && (
                <label className="share-client">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={record.active !== false}
                  />
                  <span>
                    Access is active
                    <small>
                      Uncheck to pause this person’s company access.
                    </small>
                  </span>
                </label>
              )}
              <div className="studio-info">
                Clients see only their assigned projects, published updates,
                shared photos and decisions. Internal tasks, materials and
                expenses stay with the team.
              </div>
            </>
          )}
          {(workspaceError || error) && (
            <p role="alert" className="studio-error">
              {workspaceError || error}
            </p>
          )}
          <div className="studio-form-actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              {busy ? (
                <Busy text="Saving…" />
              ) : kind === "invite" ? (
                "Save invitation"
              ) : kind === "approval" ? (
                "Send for review"
              ) : kind === "update" ? (
                "Post update"
              ) : (
                "Save"
              )}
              <ArrowRight size={16} />
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function ShareWithClient() {
  return (
    <label className="share-client">
      <input type="checkbox" name="clientVisible" />
      <span>
        Share with the client<small>Leave off for internal team work.</small>
      </span>
    </label>
  );
}
