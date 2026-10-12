import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowRight, Copy } from "lucide-react";
import { Button, Empty, Field } from "./components";
import { SmartField } from "./SmartField";
import { projectHelper } from "./collaboration";
import {
  canAccessProject,
  lifecycle,
  type SiteUpdate,
  type StudioData,
  type StudioMember,
  type StudioTask,
} from "./studio-model";
import { today, uid, dateLabel } from "./model";
import { validDate } from "./money";
import * as cloud from "./studio-cloud";
import "./collaboration.css";
type Proposal = {
  kind: "task" | "update";
  title?: string;
  summary?: string;
  room?: string;
  due?: string;
  stage?: string;
  tomorrow?: string;
  blocker?: string;
};
export function assistantServiceUrl() {
  const raw = String(import.meta.env.VITE_ASSISTANT_API_URL || "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}
async function askAI(companyId: string, projectId: string, prompt: string) {
  const url = assistantServiceUrl(),
    user = cloud.currentUser();
  if (!url || !user)
    throw new Error("The shared AI connection is awaiting setup.");
  const response = await fetch(`${url}/ask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ companyId, projectId, prompt }),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "The assistant could not respond. Try again.",
    );
  return result as { answer: string; proposal?: Proposal };
}
export function AssistantWorkspace({
  data,
  member,
  demo,
  busy,
  projectId,
  onProject,
  onOpen,
  onTask,
  onReport,
}: {
  data: StudioData;
  member: StudioMember;
  demo: boolean;
  busy: boolean;
  projectId: string;
  onProject: (id: string) => void;
  onOpen: (
    page: "Tasks" | "Approvals" | "Projects",
    id: string,
    tool?: string,
  ) => void;
  onTask: (task: StudioTask) => Promise<boolean>;
  onReport: (report: SiteUpdate) => Promise<boolean>;
}) {
  const selected = data.projects.some((p) => p.id === projectId)
      ? projectId
      : data.projects[0]?.id || "",
    [prompt, setPrompt] = useState(""),
    [answer, setAnswer] = useState(""),
    [answerScope, setAnswerScope] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [asking, setAsking] = useState(false),
    [copied, setCopied] = useState(false),
    [shared, setShared] = useState(false),
    request = useRef(0),
    recordId = useRef(uid()),
    lock = useRef(false);
  const scope = `${data.id}_${selected}_${member.id}_${member.role}`;
  useEffect(() => {
    request.current++;
    setAnswer("");
    setProposal(null);
    setError("");
    setPrompt("");
    setAsking(false);
    setShared(false);
    recordId.current = uid();
    return () => {
      request.current++;
    };
  }, [data.id, selected, member.id, member.role]);
  if (!selected)
    return (
      <Empty
        title="Choose a project first"
        text="The assistant works with projects you can access."
      />
    );
  const helper = projectHelper(data, member, selected),
    client = member.role === "client",
    connected = !!assistantServiceUrl() && !demo;
  const ask = async () => {
    if (asking || !prompt.trim()) return;
    setError("");
    setAsking(true);
    const revision = ++request.current;
    try {
      const result = await askAI(data.id, selected, prompt.trim());
      if (revision !== request.current) return;
      setAnswer(result.answer);
      setAnswerScope(scope);
      setProposal(client ? null : result.proposal || null);
      recordId.current = uid();
    } catch (e) {
      if (revision === request.current) setError((e as Error).message);
    } finally {
      if (revision === request.current) setAsking(false);
    }
  };
  const save = async (form: HTMLFormElement) => {
    if (
      lock.current ||
      busy ||
      answerScope !== scope ||
      member.role === "client"
    )
      return;
    lock.current = true;
    setError("");
    try {
      const fd = new FormData(form),
        f = (key: string) => String(fd.get(key) || "").trim();
      let ok = false;
      if (proposal?.kind === "task") {
        if (!f("title") || f("title").length > 300)
          throw new Error("Use a title of 1–300 characters.");
        ok = await onTask({
          id: recordId.current,
          projectId: selected,
          title: f("title"),
          assigneeId: f("assigneeId"),
          due: validDate(f("due")),
          stage: f("stage"),
          priority: "Normal",
          status: "To do",
        });
      }
      if (proposal?.kind === "update") {
        if (!f("summary") || f("summary").length > 4000)
          throw new Error("Add a report of up to 4,000 characters.");
        ok = await onReport({
          id: recordId.current,
          projectId: selected,
          authorId: member.id,
          authorName: member.name,
          date: today(),
          room: f("room"),
          summary: f("summary"),
          tomorrow: f("tomorrow"),
          blocker: f("blocker"),
          clientVisible: shared,
        });
      }
      if (ok) setProposal(null);
      else
        setError(
          "The draft was not saved. Check the workspace message and retry.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
    }
  };
  return (
    <section className="studio-panel">
      <div className="studio-section-heading">
        <div>
          <h2>
            <Sparkles size={18} /> Project assistant
          </h2>
          <p>A clear view of your project, with reviewed actions.</p>
        </div>
      </div>
      <label className="field">
        <span>Project</span>
        <select value={selected} onChange={(e) => onProject(e.target.value)}>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="assistant-status studio-info">
        {connected
          ? "Your question and the project information you can access are sent to the app’s AI provider. Review every proposed change before saving."
          : "The shared AI connection will be activated once the service key is configured. The project helper below works now without AI."}
      </div>
      <div className="assistant-query">
        <label className="field">
          <span>Ask about this project</span>
          <textarea
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. What is blocking handover? Or draft a task for tomorrow’s kitchen inspection."
          />
        </label>
        <div className="assistant-prompt-actions">
          {[
            "What needs attention today?",
            "Summarise the latest site reports",
            "Find the latest approved drawing",
            ...(!client
              ? [
                  "Draft a client progress update",
                  "Draft a task for the next site inspection",
                ]
              : []),
          ].map((p) => (
            <Button key={p} disabled={asking} onClick={() => setPrompt(p)}>
              {p}
            </Button>
          ))}
        </div>
        <Button
          variant="primary"
          disabled={!connected || asking || !prompt.trim()}
          onClick={ask}
        >
          {asking ? "Thinking…" : "Ask AI"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      {answer && answerScope === scope && (
        <div className="assistant-answer" aria-live="polite">
          {answer}
        </div>
      )}
      {proposal && answerScope === scope && !client && (
        <form
          className="assistant-preview"
          onSubmit={(e) => {
            e.preventDefault();
            save(e.currentTarget);
          }}
        >
          <fieldset disabled={busy}>
            <h3>
              Review the proposed{" "}
              {proposal.kind === "task" ? "task" : "site report"}
            </h3>
            <p>Check names, dates and facts before saving.</p>
            {proposal.kind === "task" ? (
              <>
                <SmartField
                  key={recordId.current}
                  label="Task title"
                  name="title"
                  category="taskNames"
                  value={proposal.title || "Site inspection"}
                  maxLength={300}
                  required
                />
                <Field label="Assigned to" name="assigneeId" value={member.id}>
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
                  value={proposal.due || today()}
                  required
                />
                <Field
                  label="Project stage"
                  name="stage"
                  value={
                    lifecycle.includes(proposal.stage || "")
                      ? proposal.stage
                      : "Execution"
                  }
                >
                  {lifecycle.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Field>
              </>
            ) : (
              <>
                <SmartField
                  key={recordId.current}
                  label="Room / area"
                  name="room"
                  category="rooms"
                  value={proposal.room || "Site"}
                  required
                />
                <Field
                  label="Work completed"
                  name="summary"
                  type="textarea"
                  value={proposal.summary}
                  required
                />
                <Field
                  label="Tomorrow’s plan"
                  name="tomorrow"
                  type="textarea"
                  value={proposal.tomorrow}
                />
                <Field
                  label="Blockers"
                  name="blocker"
                  type="textarea"
                  value={proposal.blocker}
                />
                <label className="share-client">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => setShared(e.target.checked)}
                  />
                  <span>Share this reviewed report with the client</span>
                </label>
              </>
            )}
            <div className="ops-actions">
              <Button onClick={() => setProposal(null)}>Discard draft</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Save reviewed {proposal.kind}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="assistant-results">
        <article>
          <h3>Project overview</h3>
          <p>{helper.summary}</p>
          <div className="assistant-result-links">
            {!client && (
              <Button onClick={() => onOpen("Tasks", selected)}>
                Open tasks
                <ArrowRight size={14} />
              </Button>
            )}
            <Button onClick={() => onOpen("Approvals", selected)}>
              Open decisions
              <ArrowRight size={14} />
            </Button>
            <Button onClick={() => onOpen("Projects", selected, "Snags")}>
              Open snags
              <ArrowRight size={14} />
            </Button>
          </div>
        </article>
        <article>
          <h3>Latest approved drawings</h3>
          {helper.drawings.length ? (
            <ul className="assistant-result-list">
              {helper.drawings.map((d) => (
                <li key={d.id}>
                  {d.room}: {d.title} · version {d.version}
                </li>
              ))}
            </ul>
          ) : (
            <p>No approved drawing recorded for your view.</p>
          )}
          <Button onClick={() => onOpen("Projects", selected, "Drawings")}>
            Open drawing versions
          </Button>
        </article>
        {!client && (
          <article>
            <h3>Client progress draft</h3>
            <p>{helper.clientDraft}</p>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(helper.clientDraft);
                  setCopied(true);
                } catch {
                  setError("Select and copy the draft text on your device.");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy draft"}
            </Button>
            <small>
              Uses shared reports only. Nothing is sent automatically.
            </small>
          </article>
        )}
      </div>
    </section>
  );
}
