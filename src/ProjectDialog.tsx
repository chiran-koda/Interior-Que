import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Layers,
  ListChecks,
} from "lucide-react";
import { Button, Busy, Modal } from "./components";
import { today } from "./model";
import { type StudioProject } from "./studio-model";
import { projectTemplates } from "./project-operations";
import "./project-dialog.css";

export function ProjectDialog({
  record,
  busy,
  workspaceError,
  onClose,
  onSubmit,
}: {
  record?: StudioProject;
  busy: boolean;
  workspaceError: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => Promise<boolean>;
}) {
  const [start, setStart] = useState(record?.start || today());
  const [end, setEnd] = useState(record?.end || "");
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("basic");
  const template = projectTemplates.find((t) => t.id === templateId)!;
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const disabled = busy || saving;
  const close = useCallback(() => {
    if (!lock.current && !busy) onClose();
  }, [busy, onClose]);
  const duration =
    start && end
      ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000)
      : null;
  const dateError = duration !== null && duration < 0;
  const quickTarget = (days: number) => {
    if (!start) return;
    const target = new Date(`${start}T12:00:00Z`);
    target.setUTCDate(target.getUTCDate() + days);
    setEnd(target.toISOString().slice(0, 10));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    for (const name of ["name", "clientName", "location"]) {
      const input = form.elements.namedItem(name) as HTMLInputElement;
      if (!input.value.trim()) {
        setError("Please fill in the project name, client and site location.");
        input.focus();
        return;
      }
    }
    if (String(values.get("end")) < String(values.get("start"))) {
      setError("Choose a handover date on or after the start date.");
      (form.elements.namedItem("end") as HTMLInputElement).focus();
      return;
    }
    setError("");
    lock.current = true;
    setSaving(true);
    try {
      const saved = await onSubmit(values);
      if (!saved)
        setError(
          "Your project was not saved. Check the message below and try again.",
        );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal
      title={record ? "Edit project" : "Start a project"}
      subtitle={
        record
          ? "Update the details your team works from."
          : "A few details to give your team a clear starting point."
      }
      className="project-dialog"
      initialFocus="[name=name]"
      onClose={close}
      closeDisabled={disabled}
    >
      <form className="project-form" onSubmit={submit} aria-busy={disabled}>
        <div className="project-form-scroll">
          <fieldset disabled={disabled} className="project-form-layout">
            <div className="project-form-main">
              {!record && (
                <label className="project-field">
                  <span>Start from a template</span>
                  <select
                    name="templateId"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {projectTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.tasks.length} tasks
                      </option>
                    ))}
                  </select>
                  <small>{template.description}</small>
                </label>
              )}
              <section
                className="project-form-section"
                aria-labelledby="project-details-title"
              >
                <div className="project-section-heading">
                  <span>
                    <Layers size={18} />
                  </span>
                  <div>
                    <h3 id="project-details-title">Project details</h3>
                    <p>Required fields are marked with *</p>
                  </div>
                </div>
                <label className="project-field">
                  <span>
                    Project name <i>*</i>
                  </span>
                  <input
                    name="name"
                    defaultValue={record?.name}
                    required
                    maxLength={160}
                    placeholder="e.g. Meera’s 3BHK home"
                    autoComplete="off"
                  />
                </label>
                <div className="project-field-grid">
                  <label className="project-field">
                    <span>
                      Client name <i>*</i>
                    </span>
                    <input
                      name="clientName"
                      defaultValue={record?.clientName}
                      required
                      maxLength={120}
                      placeholder="e.g. Meera Shah"
                      autoComplete="off"
                    />
                  </label>
                  <label className="project-field">
                    <span>
                      Site location <i>*</i>
                    </span>
                    <input
                      name="location"
                      defaultValue={record?.location}
                      required
                      maxLength={300}
                      placeholder="Area, city or site address"
                      autoComplete="off"
                    />
                  </label>
                </div>
              </section>
              <section
                className="project-form-section"
                aria-labelledby="project-schedule-title"
              >
                <div className="project-section-heading">
                  <span>
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <h3 id="project-schedule-title">Schedule & status</h3>
                    <p>You can adjust these as the work progresses.</p>
                  </div>
                </div>
                <div className="project-field-grid">
                  <label className="project-field">
                    <span>
                      Start date <i>*</i>
                    </span>
                    <input
                      name="start"
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      onBlur={(e) => setStart(e.target.value)}
                      required
                    />
                  </label>
                  <label className="project-field">
                    <span>
                      Handover target <i>*</i>
                    </span>
                    <input
                      name="end"
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      onBlur={(e) => setEnd(e.target.value)}
                      required
                      min={start || undefined}
                      aria-invalid={dateError || undefined}
                      aria-describedby="project-date-help"
                    />
                  </label>
                </div>
                <div className="project-date-tools">
                  <span>Set target from start:</span>
                  {[30, 60, 90].map((days) => (
                    <button
                      type="button"
                      key={days}
                      disabled={!start || disabled}
                      onClick={() => quickTarget(days)}
                      aria-label={`Set handover ${days} days after start`}
                    >
                      +{days} days
                    </button>
                  ))}
                </div>
                <p
                  id="project-date-help"
                  className={`project-date-help ${dateError ? "invalid" : ""}`}
                  aria-live="polite"
                >
                  {dateError
                    ? "Handover must be on or after the start date."
                    : duration === null
                      ? "Choose an estimated completion date."
                      : duration === 0
                        ? "Start and handover are on the same day."
                        : `${duration} days planned from start to handover.`}
                </p>
                <label className="project-field project-status-field">
                  <span>Current status</span>
                  <select
                    name="status"
                    defaultValue={record?.status || "Planning"}
                  >
                    <option>Planning</option>
                    <option>In progress</option>
                    <option>Delayed</option>
                    <option>Completed</option>
                  </select>
                </label>
              </section>
              <details
                className="project-brief"
                open={record?.brief ? true : undefined}
              >
                <summary>
                  Project brief <span>Optional</span>
                </summary>
                <label className="project-field">
                  <span>What are we creating?</span>
                  <textarea
                    name="brief"
                    defaultValue={record?.brief}
                    maxLength={4000}
                    rows={3}
                    placeholder="Rooms, style, scope or anything your team should know…"
                  />
                </label>
              </details>
            </div>
            <aside
              className="project-start-guide"
              aria-label={
                record ? "Project links" : "Included with your project"
              }
            >
              <span className="project-guide-icon">
                <ListChecks size={22} />
              </span>
              <h3>
                {record ? "Everything stays connected" : "Ready for your team"}
              </h3>
              <p>
                {record
                  ? "Your existing tasks, photos and team access stay linked to this project."
                  : "We’ll create a starter checklist so you don’t begin with a blank page."}
              </p>
              {!record && (
                <ol>
                  {[...new Set(template.tasks.map((t) => t[1]))].map(
                    (stage) => (
                      <li key={stage}>
                        <Check size={14} />
                        {stage}
                      </li>
                    ),
                  )}
                </ol>
              )}
              <div className="project-guide-next">
                <b>
                  {record ? "Need to manage access?" : "After you create it"}
                </b>
                <p>
                  {record
                    ? "Use Team to manage who can see this project."
                    : "Suggested task dates follow your start and handover dates. Open Team to assign people and adjust the plan."}
                </p>
              </div>
            </aside>
          </fieldset>
        </div>
        <footer className="project-form-footer">
          {(workspaceError || error) && (
            <p role="alert" className="project-submit-error">
              {workspaceError || error}
            </p>
          )}
          <div>
            <span>
              {record
                ? "Changes update this project."
                : `${template.tasks.length} starter tasks included`}
            </span>
            <div className="project-form-buttons">
              <Button onClick={close} disabled={disabled}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={disabled}>
                {disabled ? (
                  <Busy text={record ? "Saving…" : "Creating…"} />
                ) : record ? (
                  "Save changes"
                ) : (
                  "Create project"
                )}
                {!disabled && <ArrowRight size={16} />}
              </Button>
            </div>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
