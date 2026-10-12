import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, RotateCcw, Upload, X } from "lucide-react";
import { Badge, Button, Modal } from "./components";
import { asset } from "./assets";
import { uid, today } from "./model";
import type { StudioFile, StudioProject } from "./studio-model";
import {
  bytesLabel,
  compressPhoto,
  getPhotoUrl,
  getStorage,
  photoServiceUrl,
  uploadPhoto,
  type CompressedPhoto,
  type PhotoStorage,
} from "./photos";
interface Entry {
  id: string;
  file: File;
  preview: string;
  prepared?: CompressedPhoto;
  status: "Waiting" | "Resizing" | "Uploading" | "Uploaded" | "Failed";
  progress: number;
  error?: string;
}
export function PhotoUploader({
  company,
  projects,
  initialProject,
  authorId,
  demo,
  onDemoSave,
  onClose,
  onUploaded,
  embedded = false,
  initialRoom = "",
  initialShared = false,
  onPhotoSaved,
  onBusyChange,
  onPendingChange,
  maxPhotos = 20,
}: {
  company: string;
  projects: StudioProject[];
  initialProject: string;
  authorId: string;
  demo: boolean;
  onDemoSave: (photo: StudioFile) => Promise<void>;
  onClose: () => void;
  onUploaded: () => void;
  embedded?: boolean;
  initialRoom?: string;
  initialShared?: boolean;
  onPhotoSaved?: (id: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onPendingChange?: (count: number) => void;
  maxPhotos?: number;
}) {
  const [project, setProject] = useState(
    initialProject || projects[0]?.id || "",
  );
  const [room, setRoom] = useState(""),
    [caption, setCaption] = useState(""),
    [shared, setShared] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [started, setStarted] = useState(false),
    [error, setError] = useState("");
  const list = useRef(entries);
  list.current = entries;
  const locked = useRef(false);
  useEffect(
    () =>
      onPendingChange?.(entries.filter((e) => e.status !== "Uploaded").length),
    [entries, onPendingChange],
  );
  useEffect(
    () => () => {
      for (const entry of list.current) URL.revokeObjectURL(entry.preview);
    },
    [],
  );
  const patch = (id: string, changes: Partial<Entry>) =>
    setEntries((current) =>
      current.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    );
  const add = (files: File[]) => {
    setError("");
    if (entries.length + files.length > maxPhotos) {
      setError(`Choose up to ${maxPhotos} photos per batch.`);
      return;
    }
    setEntries((current) => [
      ...current,
      ...files.map((file) => ({
        id: uid(),
        file,
        preview: URL.createObjectURL(file),
        status: "Waiting" as const,
        progress: 0,
      })),
    ]);
  };
  const run = async (retryId?: string) => {
    if (locked.current) return;
    const uploadRoom = embedded ? initialRoom || "Site" : room;
    const uploadShared = embedded ? initialShared : shared;
    if (!project || !uploadRoom.trim() || !entries.length) {
      setError("Choose a project, room or area, and at least one photo.");
      return;
    }
    locked.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setStarted(true);
    setError("");
    try {
      // Two concurrent uploads keep phone memory and network usage manageable.
      const queue = entries.filter((e) =>
        retryId ? e.id === retryId : e.status !== "Uploaded",
      );
      let at = 0;
      const work = async () => {
        while (at < queue.length) {
          const entry = queue[at++];
          try {
            patch(entry.id, {
              status: "Resizing",
              error: undefined,
              progress: 0,
            });
            const prepared =
              entry.prepared || (await compressPhoto(entry.file));
            entry.prepared = prepared;
            patch(entry.id, { prepared, status: "Uploading" });
            if (demo) {
              const url = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () =>
                  reject(new Error("Could not save the demo photo."));
                reader.readAsDataURL(prepared.blob);
              });
              await onDemoSave({
                id: entry.id,
                projectId: project,
                name: prepared.name,
                url,
                kind: "photo",
                room: uploadRoom.trim(),
                caption: caption.trim(),
                clientVisible: uploadShared,
                authorId,
                date: today(),
                sizeBytes: prepared.blob.size,
                width: prepared.width,
                height: prepared.height,
                mime: prepared.blob.type,
              });
            } else
              await uploadPhoto(
                company,
                project,
                entry.id,
                prepared,
                {
                  room: uploadRoom.trim(),
                  caption: caption.trim(),
                  clientVisible: uploadShared,
                },
                (progress) => patch(entry.id, { progress }),
              );
            patch(entry.id, { status: "Uploaded", progress: 100 });
            onUploaded();
            onPhotoSaved?.(entry.id);
          } catch (e) {
            patch(entry.id, { status: "Failed", error: (e as Error).message });
          }
        }
      };
      await Promise.all([work(), work()]);
    } finally {
      locked.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const configured = demo || !!photoServiceUrl();
  const close = () => {
    if (!locked.current) onClose();
  };
  const content = (
    <div className="photo-upload-body">
      {demo && (
        <div className="studio-info">
          Demo photos are saved on this device only.
        </div>
      )}
      {!configured && (
        <p className="studio-error" role="alert">
          Company photo storage is awaiting setup. Your owner needs to connect
          the photo service once. You won’t need a storage account.
        </p>
      )}
      {!embedded && (
        <>
          <div className="form-grid">
            <label className="field">
              <span>Project *</span>
              <select
                value={project}
                disabled={started}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Room / area *</span>
              <input
                value={room}
                disabled={started}
                maxLength={120}
                placeholder="e.g. Kitchen, first floor"
                onChange={(e) => setRoom(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>
              What changed? <small>Optional</small>
            </span>
            <input
              value={caption}
              disabled={started}
              maxLength={2000}
              placeholder="e.g. Ceiling framework completed today"
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={shared}
              disabled={started}
              onChange={(e) => setShared(e.target.checked)}
            />
            Share these photos with the client
          </label>
        </>
      )}
      {!started && (
        <label className="photo-drop">
          <ImagePlus size={32} />
          <b>Choose photos from your phone or computer</b>
          <span>JPEG, PNG or WebP · up to {maxPhotos} at a time</span>
          <input
            aria-label="Choose project photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={!configured}
            onChange={(e) => {
              add([...(e.target.files || [])]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <div className="photo-upload-list" aria-live="polite">
        {entries.map((entry) => (
          <article key={entry.id}>
            <img src={entry.preview} alt={entry.file.name} />
            <div>
              <b>{entry.file.name}</b>
              <small>
                {entry.prepared
                  ? `${bytesLabel(entry.prepared.blob.size)} · ${entry.prepared.width} × ${entry.prepared.height}`
                  : bytesLabel(entry.file.size)}
              </small>
              <span>
                {entry.status === "Uploaded" ? (
                  <>
                    <Check size={14} />
                    Saved to project
                  </>
                ) : (
                  entry.status
                )}
              </span>
              {entry.status === "Uploading" && (
                <progress
                  aria-label={`Upload progress for ${entry.file.name}`}
                  value={entry.progress}
                  max={100}
                />
              )}
              {entry.error && <p className="studio-error">{entry.error}</p>}
            </div>
            {entry.status === "Failed" && (
              <Button disabled={busy} onClick={() => run(entry.id)}>
                <RotateCcw size={15} />
                Retry
              </Button>
            )}
            {(!started || entry.status === "Failed") && !busy && (
              <button
                className="icon-btn"
                aria-label={`Remove ${entry.file.name}`}
                onClick={() => {
                  URL.revokeObjectURL(entry.preview);
                  setEntries((current) =>
                    current.filter((e) => e.id !== entry.id),
                  );
                }}
              >
                <X size={18} />
              </button>
            )}
          </article>
        ))}
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <p className="photo-help">
        Photos are resized to a 2,000 pixel long edge. Location metadata is
        removed. Team-only photos stay private.
      </p>
      <div className="photo-upload-actions">
        {!embedded && (
          <Button disabled={busy} onClick={close}>
            {started ? "Done" : "Cancel"}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={
            busy || !configured || !entries.some((e) => e.status !== "Uploaded")
          }
          onClick={() => run()}
        >
          <Upload size={17} />
          {busy
            ? "Uploading…"
            : started
              ? "Retry remaining photos"
              : `Upload ${entries.length || ""} photo${entries.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Modal
      title="Upload project photos"
      subtitle="Choose photos. We’ll resize them and keep them beside the project."
      onClose={close}
      wide
      closeDisabled={busy}
    >
      {content}
    </Modal>
  );
}
export function PhotoCard({
  photo,
  company,
  project,
  demo,
}: {
  photo: StudioFile;
  company: string;
  project: string;
  demo: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [view, setView] = useState(false),
    [busy, setBusy] = useState(false);
  const card = useRef<HTMLElement>(null);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      if (photo.url.startsWith("/images/")) setUrl(asset(photo.url));
      else if (demo && /^data:image\/(webp|jpeg);base64,/.test(photo.url))
        setUrl(photo.url);
      else setUrl((await getPhotoUrl(company, photo.projectId, photo.id)).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let disposed = false;
    const observer = new IntersectionObserver((items) => {
      if (!disposed && items.some((i) => i.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    if (card.current) observer.observe(card.current);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [company, photo.id]);
  const open = async () => {
    await load();
    setView(true);
  };
  return (
    <article className="studio-file photo-card" ref={card}>
      <button
        className="photo-preview"
        aria-label={`View ${photo.name}`}
        onClick={open}
      >
        {url ? (
          <img
            src={url}
            alt={photo.caption || photo.room}
            loading="lazy"
            onError={() => {
              setUrl("");
              setError("Photo link expired. Tap View photo to refresh.");
            }}
          />
        ) : (
          <Camera size={36} />
        )}
      </button>
      <div>
        <h3>{photo.room || photo.name}</h3>
        <p>
          {project} · {photo.date}
        </p>
        <small>{photo.caption}</small>
        <Badge>
          {photo.clientVisible ? "Shared with client" : "Team only"}
        </Badge>
        {error && <p className="studio-error">{error}</p>}
        <Button disabled={busy} onClick={open}>
          {busy ? "Opening…" : "View photo"}
        </Button>
      </div>
      {view && (
        <Modal
          title={photo.room || photo.name}
          subtitle={photo.caption || photo.name}
          onClose={() => setView(false)}
          wide
        >
          {url ? (
            <img
              className="photo-lightbox"
              src={url}
              alt={photo.caption || photo.name}
            />
          ) : (
            <p className="studio-error">{error}</p>
          )}
          <div className="photo-upload-actions">
            <Button onClick={load}>Refresh photo</Button>
            <Button onClick={() => setView(false)}>Close</Button>
          </div>
        </Modal>
      )}
    </article>
  );
}
export function StorageMeter({
  company,
  demo,
  photos,
  refresh,
}: {
  company: string;
  demo: boolean;
  photos: StudioFile[];
  refresh: number;
}) {
  const [data, setData] = useState<PhotoStorage | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (demo) {
      setData({
        usedBytes: photos.reduce((s, p) => s + (p.sizeBytes || 0), 0),
        reservedBytes: 0,
        quotaBytes: 1_000_000_000,
      });
      return;
    }
    if (!photoServiceUrl()) return;
    getStorage(company)
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [company, demo, photos.length, refresh]);
  return (
    <div className="photo-storage">
      <Camera size={20} />
      <div>
        <b>Company photo storage</b>
        {data ? (
          <>
            <span>
              {bytesLabel(data.usedBytes)} used of {bytesLabel(data.quotaBytes)}
              {data.reservedBytes > 0
                ? ` · ${bytesLabel(data.reservedBytes)} uploading`
                : ""}
            </span>
            <progress
              aria-label="Company photo storage used"
              value={data.usedBytes + data.reservedBytes}
              max={data.quotaBytes}
            />
          </>
        ) : (
          <span>{error || "Storage will appear after setup."}</span>
        )}
      </div>
    </div>
  );
}
