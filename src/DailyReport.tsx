import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Modal } from "./components";
import { PhotoUploader } from "./ProjectPhotos";
import { SmartField } from "./SmartField";
import { today, uid } from "./model";
import { validDate } from "./money";
import type {
  SiteUpdate,
  StudioData,
  StudioMember,
  StudioFile,
} from "./studio-model";
import "./project-tools.css";

export function DailyReport({
  data,
  member,
  projectId,
  demo,
  busy,
  onSave,
  onDemoPhoto,
  onUploaded,
  onClose,
}: {
  data: StudioData;
  member: StudioMember;
  projectId: string;
  demo: boolean;
  busy: boolean;
  onSave: (r: SiteUpdate) => Promise<boolean>;
  onDemoPhoto: (r: StudioFile) => Promise<void>;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const draftKey = `iq-daily-report-${data.id}-${member.id}`;
  const initial = useRef<Record<string, any>>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(draftKey) || "{}");
      } catch {
        return {};
      }
    })(),
  );
  const [draft, setDraft] = useState({
    projectId: data.projects.some((p) => p.id === initial.current.projectId)
      ? initial.current.projectId
      : projectId || data.projects[0]?.id || "",
    room: initial.current.room || "",
    date: initial.current.date || today(),
    summary: initial.current.summary || "",
    tomorrow: initial.current.tomorrow || "",
    shortages: initial.current.shortages || "",
    blocker: initial.current.blocker || "",
    workers: initial.current.workers || "",
    clientVisible: initial.current.clientVisible === true,
  });
  const [photoIds, setPhotoIds] = useState<string[]>(
      Array.isArray(initial.current.photoIds)
        ? initial.current.photoIds
            .filter((id: unknown) => typeof id === "string")
            .slice(0, 4)
        : [],
    ),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const [id] = useState(() =>
    typeof initial.current.draftId === "string"
      ? initial.current.draftId
      : uid(),
  );
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const lock = useRef(false);
  const change = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  useEffect(() => {
    localStorage.setItem(
      draftKey,
      JSON.stringify({ ...draft, photoIds, draftId: id }),
    );
  }, [draft, draftKey, photoIds, id]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lock.current || uploading || busy || pendingPhotos) return;
    setError("");
    try {
      const workers = draft.workers === "" ? 0 : Number(draft.workers);
      if (!Number.isInteger(workers) || workers < 0 || workers > 10000)
        throw new Error("Enter a valid number of workers.");
      if (!draft.room.trim() || !draft.summary.trim())
        throw new Error("Add the room or area and the work completed.");
      const date = validDate(draft.date);
      if (date > today())
        throw new Error("A daily report cannot be dated in the future.");
      lock.current = true;
      if (
        await onSave({
          id,
          projectId: draft.projectId,
          authorId: member.id,
          authorName: member.name,
          date,
          room: draft.room.trim(),
          summary: draft.summary.trim(),
          tomorrow: draft.tomorrow.trim(),
          shortages: draft.shortages.trim(),
          blocker: draft.blocker.trim(),
          workers,
          photoIds,
          clientVisible: draft.clientVisible,
        })
      ) {
        localStorage.removeItem(draftKey);
        onClose();
      } else
        setError(
          "Report not posted. Your draft is kept on this device; try again.",
        );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      lock.current = false;
    }
  };
  const attached = data.files.filter(
    (f) =>
      f.projectId === draft.projectId &&
      (!draft.clientVisible || f.clientVisible),
  );
  return (
    <Modal
      title="Post today’s site report"
      subtitle="Work, photos and tomorrow’s plan in one place. Drafts stay on this device."
      wide
      onClose={() => {
        if (!uploading && !busy && !lock.current) onClose();
      }}
      closeDisabled={uploading || busy}
    >
      <div className="daily-report-layout">
        <form className="studio-form" onSubmit={submit}>
          <fieldset disabled={busy || uploading}>
            <div className="form-grid">
              <label className="field">
                <span>Project *</span>
                <select
                  required
                  value={draft.projectId}
                  disabled={photoIds.length > 0 || pendingPhotos > 0}
                  onChange={(e) => change("projectId", e.target.value)}
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Report date *</span>
                <input
                  type="date"
                  required
                  max={today()}
                  value={draft.date}
                  onChange={(e) => change("date", e.target.value)}
                />
              </label>
              <SmartField
                label="Room / area"
                name="room"
                category="rooms"
                value={draft.room}
                onChange={(v) => change("room", v)}
                required
              />
              <label className="field">
                <span>Workers on site</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={draft.workers}
                  onChange={(e) => change("workers", e.target.value)}
                />
              </label>
            </div>
            {[
              ["summary", "Work completed *", 4000],
              ["tomorrow", "Tomorrow’s plan", 2000],
              ["shortages", "Materials needed or short", 1000],
              ["blocker", "What is blocking work?", 1000],
            ].map(([key, label, max]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <textarea
                  required={key === "summary"}
                  maxLength={Number(max)}
                  rows={key === "summary" ? 3 : 2}
                  value={draft[key as keyof typeof draft] as string}
                  onChange={(e) => change(String(key), e.target.value)}
                />
              </label>
            ))}
            <label className="share-client">
              <input
                type="checkbox"
                checked={draft.clientVisible}
                disabled={photoIds.length > 0}
                onChange={(e) => change("clientVisible", e.target.checked)}
              />
              <span>
                Share this report and its photos with the client
                <small>
                  Choose visibility before uploading or attaching photos.
                </small>
              </span>
            </label>
            {attached.length > 0 && (
              <details className="ops-details">
                <summary>
                  Attach existing project photos · {photoIds.length}/4 selected
                </summary>
                {attached.map((f) => (
                  <label className="ops-check" key={f.id}>
                    <input
                      type="checkbox"
                      checked={photoIds.includes(f.id)}
                      disabled={
                        !photoIds.includes(f.id) &&
                        photoIds.length + pendingPhotos >= 4
                      }
                      onChange={(e) =>
                        setPhotoIds((ids) =>
                          e.target.checked
                            ? [...ids, f.id]
                            : ids.filter((id) => id !== f.id),
                        )
                      }
                    />
                    {f.room} · {f.name}
                  </label>
                ))}
              </details>
            )}
            {error && (
              <p className="studio-error" role="alert">
                {error}
              </p>
            )}
            {photoIds.length > 0 && (
              <Button onClick={() => setPhotoIds([])}>
                Clear photo attachments
              </Button>
            )}
            {pendingPhotos > 0 && (
              <p className="ops-help">
                Upload or remove the remaining photos before posting.
              </p>
            )}
            <div className="studio-form-actions">
              <Button onClick={onClose} disabled={busy || uploading}>
                Keep draft & close
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || uploading || pendingPhotos > 0}
              >
                {busy ? "Posting…" : "Post report"}
              </Button>
            </div>
          </fieldset>
        </form>
        <aside className="report-photos">
          <h3>Photos for this report</h3>
          <p>
            Optional · attach up to four photos. Upload them before posting.
          </p>
          <PhotoUploader
            key={draft.projectId}
            embedded
            company={data.id}
            projects={data.projects.filter((p) => p.id === draft.projectId)}
            initialProject={draft.projectId}
            initialRoom={draft.room}
            initialShared={draft.clientVisible}
            maxPhotos={Math.max(0, 4 - photoIds.length)}
            authorId={member.id}
            demo={demo}
            onDemoSave={onDemoPhoto}
            onUploaded={onUploaded}
            onPhotoSaved={(id) =>
              setPhotoIds((ids) =>
                ids.includes(id) ? ids : [...ids, id].slice(0, 4),
              )
            }
            onBusyChange={setUploading}
            onPendingChange={setPendingPhotos}
            onClose={() => {}}
          />
        </aside>
      </div>
    </Modal>
  );
}
