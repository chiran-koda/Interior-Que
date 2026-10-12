import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MessageSquare,
  Reply,
  AtSign,
  X,
  ArrowRight,
  Check,
} from "lucide-react";
import { Avatar, Badge, Button, Busy, Empty, Field, Modal } from "./components";
import { PhotoCard } from "./ProjectPhotos";
import { SmartField } from "./SmartField";
import { uid, today, dateLabel } from "./model";
import {
  canAccessProject,
  lifecycle,
  type StudioData,
  type StudioMember,
  type StudioTask,
  type Approval,
} from "./studio-model";
import {
  chatActionId,
  canSeeMessage,
  inboxItems,
  type ChatMessage,
  type ChatAction,
  type ChatActionKind,
  type ChatWorkRecord,
  type Notice,
} from "./collaboration";
import type { Snag } from "./project-operations";
import * as cloud from "./studio-cloud";
import { validDate } from "./money";
import "./collaboration.css";

type Props = {
  data: StudioData;
  member: StudioMember;
  demo: boolean;
  busy: boolean;
  projectId: string;
  channel?: string;
  focusMessage?: string;
  onProject: (id: string) => void;
  onSend: (message: ChatMessage) => Promise<boolean>;
  onAction: (
    message: ChatMessage,
    kind: ChatActionKind,
    record: ChatWorkRecord,
  ) => Promise<boolean>;
  onOpen: (
    page: "Tasks" | "Approvals" | "Projects",
    id: string,
    tool?: string,
  ) => void;
  onUpload: () => void;
};
export function ChatWorkspace(props: Props) {
  const { data, member, demo, projectId, onProject } = props,
    selected = data.projects.some((p) => p.id === projectId)
      ? projectId
      : data.projects[0]?.id || "";
  const [audienceShared, setShared] = useState(
      member.role === "client" || props.channel === "client",
    ),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [actions, setActions] = useState<ChatAction[]>([]),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState(""),
    [older, setOlder] = useState<ChatMessage[]>([]),
    [mentioned, setMentioned] = useState<ChatMessage | null>(null),
    [fetching, setFetching] = useState(false),
    [hasOlder, setHasOlder] = useState(false),
    [loadedScope, setLoadedScope] = useState("");
  const shared = member.role === "client" || audienceShared,
    scope = `${data.id}_${selected}_${shared}_${member.id}_${member.role}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [action, setAction] = useState<{
      message: ChatMessage;
      kind: ChatActionKind;
      companyId: string;
    } | null>(null),
    [search, setSearch] = useState("");
  useEffect(
    () => setShared(member.role === "client" || props.channel === "client"),
    [props.channel, member.id, member.role, data.id],
  );
  useEffect(() => {
    setOlder([]);
    setMentioned(null);
    setError("");
    if (demo) {
      setLoadedScope(scope);
      setMessages(
        (data.chatMessages || [])
          .filter((m) => m.projectId === selected && m.clientVisible === shared)
          .sort((a, b) => a.createdAt - b.createdAt),
      );
      setActions(
        (data.chatActions || []).filter(
          (a) => a.projectId === selected && a.clientVisible === shared,
        ),
      );
      setLoading(false);
      setHasOlder(false);
      return;
    }
    setMessages([]);
    setActions([]);
    setLoading(true);
    if (!selected) {
      setLoading(false);
      return;
    }
    return cloud.watchConversation(
      data.id,
      selected,
      shared,
      (records, links) => {
        if (currentScope.current !== scope) return;
        setLoadedScope(scope);
        setMessages(records);
        setActions(links);
        setHasOlder(records.length >= 50);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [
    demo,
    data.id,
    selected,
    shared,
    member.id,
    member.role,
    demo ? data.chatMessages : undefined,
    demo ? data.chatActions : undefined,
  ]);
  useEffect(() => {
    if (demo || !props.focusMessage) return;
    let cancelled = false;
    cloud
      .mentionedMessage(data.id, props.focusMessage)
      .then((message) => {
        if (
          !cancelled &&
          currentScope.current === scope &&
          message &&
          message.projectId === selected &&
          message.clientVisible === shared &&
          canSeeMessage(member, message)
        )
          setMentioned(message);
      })
      .catch(() => {
        if (!cancelled && currentScope.current === scope)
          setError(
            "The mentioned message is no longer available with your current access.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [demo, props.focusMessage, scope]);
  const all = [
    ...new Map(
      (loadedScope === scope
        ? [...older, ...messages, ...(mentioned ? [mentioned] : [])]
        : []
      )
        .filter(
          (m) =>
            m.projectId === selected &&
            m.clientVisible === shared &&
            canSeeMessage(member, m),
        )
        .map((m) => [m.id, m]),
    ).values(),
  ].sort((a, b) => a.createdAt - b.createdAt);
  const loadOlder = async () => {
    if (fetching || !all.length) return;
    setFetching(true);
    try {
      const records = await cloud.olderConversation(
        data.id,
        selected,
        shared,
        [...older, ...messages].sort((a, b) => a.createdAt - b.createdAt)[0],
      );
      if (currentScope.current !== scope) return;
      setOlder((v) => [...records, ...v]);
      setHasOlder(records.length === 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetching(false);
    }
  };
  useEffect(() => {
    if (props.focusMessage && all.some((m) => m.id === props.focusMessage))
      document
        .getElementById(`chat-${props.focusMessage}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [props.focusMessage, messages, mentioned]);
  if (!data.projects.length)
    return (
      <Empty
        title="Start with a project"
        text="Project conversations become available once you have project access."
      />
    );
  return (
    <section className="studio-panel chat-workspace">
      <div className="chat-toolbar">
        <label className="field">
          <span>Project conversation</span>
          <select value={selected} onChange={(e) => onProject(e.target.value)}>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="chat-channels"
          role="group"
          aria-label="Conversation audience"
        >
          {member.role !== "client" && (
            <Button
              onClick={() => setShared(false)}
              variant={!shared ? "primary" : "secondary"}
            >
              Team only
            </Button>
          )}
          <Button
            onClick={() => setShared(true)}
            variant={shared ? "primary" : "secondary"}
          >
            With client
          </Button>
        </div>
      </div>
      <div className="studio-info">
        <MessageSquare size={18} />
        {shared
          ? "Everyone assigned to this project, including the client, can see this conversation."
          : "Only the assigned team can see this conversation."}
      </div>
      <label className="field">
        <span>Search loaded messages</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this conversation"
        />
      </label>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <Busy text="Opening the conversation…" />
      ) : (
        <>
          <div className="chat-messages" aria-label="Project messages">
            {hasOlder && (
              <Button disabled={fetching} onClick={loadOlder}>
                {fetching ? "Loading…" : "Load older messages"}
              </Button>
            )}
            {all
              .filter(
                (m) =>
                  !search ||
                  `${m.body} ${m.authorName}`
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
              )
              .map((message) => {
                const reply = all.find((m) => m.id === message.replyTo),
                  links = actions.filter((a) => a.messageId === message.id);
                return (
                  <article
                    id={`chat-${message.id}`}
                    key={message.id}
                    className={`chat-message ${message.authorId === member.id ? "mine" : ""} ${props.focusMessage === message.id ? "highlight" : ""}`}
                  >
                    <header>
                      <Avatar name={message.authorName} />
                      <div>
                        <b>{message.authorName}</b>
                        <small>
                          {new Date(message.createdAt).toLocaleString(
                            undefined,
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                        </small>
                      </div>
                    </header>
                    {message.replyTo && (
                      <blockquote>
                        {reply
                          ? `${reply.authorName}: ${reply.body.slice(0, 160)}`
                          : "Reply to an earlier message"}
                      </blockquote>
                    )}
                    <p>{message.body}</p>
                    {message.mentions.length > 0 && (
                      <small className="chat-mentioned">
                        <AtSign size={12} />
                        {message.mentions
                          .map(
                            (id) =>
                              data.members.find((m) => m.id === id)?.name ||
                              all.find((m) => m.authorId === id)?.authorName ||
                              "Project member",
                          )
                          .join(", ")}
                      </small>
                    )}
                    {message.photoIds.map((id) => {
                      const f = data.files.find(
                        (f) => f.id === id && f.projectId === selected,
                      );
                      return f ? (
                        <PhotoCard
                          key={id}
                          photo={f}
                          company={data.id}
                          project={
                            data.projects.find((p) => p.id === selected)
                              ?.name || "Project"
                          }
                          demo={demo}
                        />
                      ) : null;
                    })}
                    <div className="chat-links">
                      {links.map((link) =>
                        member.role === "client" && link.kind === "task" ? (
                          <Badge key={link.id}>Team task created</Badge>
                        ) : (
                          <Button
                            key={link.id}
                            onClick={() => {
                              if (
                                member.role === "client" &&
                                link.kind === "task"
                              )
                                return;
                              props.onOpen(
                                link.kind === "task"
                                  ? "Tasks"
                                  : link.kind === "approval"
                                    ? "Approvals"
                                    : "Projects",
                                selected,
                                link.kind === "snag" ? "Snags" : undefined,
                              );
                            }}
                          >
                            <Check size={14} />
                            {member.role === "client" && link.kind === "task"
                              ? "Team task created"
                              : `Open linked ${link.kind}`}
                            <ArrowRight size={14} />
                          </Button>
                        ),
                      )}
                    </div>
                    <div className="chat-message-actions">
                      <Button
                        onClick={() =>
                          document.dispatchEvent(
                            new CustomEvent("iq-chat-reply", {
                              detail: {
                                id: message.id,
                                body: message.body,
                                name: message.authorName,
                              },
                            }),
                          )
                        }
                      >
                        <Reply size={14} />
                        Reply
                      </Button>
                      {member.role !== "client" &&
                        (["task", "snag", "approval"] as const).map((kind) => (
                          <Button
                            key={kind}
                            disabled={
                              props.busy || links.some((l) => l.kind === kind)
                            }
                            onClick={() =>
                              setAction({ message, kind, companyId: data.id })
                            }
                          >
                            {kind === "task"
                              ? "Create task"
                              : kind === "snag"
                                ? "Report snag"
                                : "Request approval"}
                          </Button>
                        ))}
                    </div>
                  </article>
                );
              })}
            {!all.length && (
              <Empty
                title="Start the conversation"
                text="Discuss work here, then turn a message into a task, snag or approval request."
              />
            )}
          </div>
          <ChatComposer
            key={`${data.id}_${selected}_${shared}_${member.id}_${member.role}`}
            {...props}
            projectId={selected}
            shared={shared}
            messages={all}
          />
        </>
      )}
      {action &&
        action.companyId === data.id &&
        member.role !== "client" &&
        canSeeMessage(member, action.message) && (
          <ChatActionDialog
            {...props}
            {...action}
            onClose={() => setAction(null)}
          />
        )}
    </section>
  );
}
function ChatComposer({
  data,
  member,
  projectId,
  shared,
  messages,
  busy,
  onSend,
  onUpload,
}: Props & { shared: boolean; messages: ChatMessage[] }) {
  const draftKey = `iq-chat-${data.id}-${member.id}-${member.role}-${projectId}-${shared}`,
    [body, setBody] = useState(() => localStorage.getItem(draftKey) || ""),
    [mentions, setMentions] = useState<string[]>([]),
    [photos, setPhotos] = useState<string[]>([]),
    [reply, setReply] = useState<{
      id: string;
      body: string;
      name: string;
    } | null>(null),
    [error, setError] = useState("");
  const pending = useRef(false),
    messageId = useRef(uid());
  useEffect(() => {
    localStorage.setItem(draftKey, body);
  }, [body, draftKey]);
  useEffect(() => {
    const handler = (event: Event) => {
      setReply((event as CustomEvent).detail);
      document.getElementById(`chat-compose-${projectId}`)?.focus();
    };
    document.addEventListener("iq-chat-reply", handler);
    return () => document.removeEventListener("iq-chat-reply", handler);
  }, [projectId]);
  const members = data.members.filter(
    (m) =>
      m.active !== false &&
      m.id !== member.id &&
      canAccessProject(m, projectId) &&
      (shared || m.role !== "client"),
  );
  const people = [
    ...new Map(
      [
        ...members.map((m) => ({ id: m.id, name: m.name })),
        ...(shared
          ? messages
              .filter((m) => m.authorId !== member.id)
              .map((m) => ({ id: m.authorId, name: m.authorName }))
          : []),
      ].map((m) => [m.id, m]),
    ).values(),
  ];
  const availablePhotos = data.files.filter(
    (f) => f.projectId === projectId && (!shared || f.clientVisible),
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending.current || busy) return;
    setError("");
    if (!body.trim() && !photos.length) {
      setError("Write a message or attach a project photo.");
      return;
    }
    pending.current = true;
    try {
      if (
        await onSend({
          id: messageId.current,
          projectId,
          authorId: member.id,
          authorName: member.name,
          body: body.trim(),
          createdAt: Date.now(),
          clientVisible: shared,
          replyTo: reply?.id || "",
          mentions,
          photoIds: photos,
        })
      ) {
        setBody("");
        setMentions([]);
        setPhotos([]);
        setReply(null);
        messageId.current = uid();
        localStorage.removeItem(draftKey);
      } else setError("Message not sent. Your text is kept on this device.");
    } finally {
      pending.current = false;
    }
  };
  return (
    <form className="chat-composer" onSubmit={submit}>
      <fieldset disabled={busy}>
        {reply && (
          <div className="chat-reply-preview">
            <span>
              Replying to {reply.name}
              <small>{reply.body.slice(0, 100)}</small>
            </span>
            <Button onClick={() => setReply(null)}>
              <X size={16} />
              Cancel reply
            </Button>
          </div>
        )}
        <label className="field">
          <span>
            {shared
              ? "Message the project team and client"
              : "Message your team"}
          </span>
          <textarea
            id={`chat-compose-${projectId}`}
            maxLength={4000}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write an update or ask a question…"
          />
        </label>
        <div className="chat-compose-options">
          {people.length > 0 && (
            <details>
              <summary>Mention someone · {mentions.length}/5</summary>
              {people.map((p) => (
                <label className="ops-check" key={p.id}>
                  <input
                    type="checkbox"
                    checked={mentions.includes(p.id)}
                    disabled={!mentions.includes(p.id) && mentions.length >= 5}
                    onChange={(e) =>
                      setMentions((v) =>
                        e.target.checked
                          ? [...v, p.id]
                          : v.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </details>
          )}
          <details>
            <summary>Attach project photos · {photos.length}/2</summary>
            {availablePhotos.map((f) => (
              <label className="ops-check" key={f.id}>
                <input
                  type="checkbox"
                  checked={photos.includes(f.id)}
                  disabled={!photos.includes(f.id) && photos.length >= 2}
                  onChange={(e) =>
                    setPhotos((v) =>
                      e.target.checked
                        ? [...v, f.id]
                        : v.filter((id) => id !== f.id),
                    )
                  }
                />
                {f.room} · {f.name}
              </label>
            ))}
            {!availablePhotos.length && (
              <p>No photos available for this audience.</p>
            )}
            {member.role !== "client" && (
              <Button onClick={onUpload}>Upload project photos</Button>
            )}
          </details>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (!body.trim() && !photos.length)}
          >
            {busy ? "Sending…" : "Send message"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
function ChatActionDialog({
  message,
  kind,
  data,
  member,
  busy,
  onAction,
  onClose,
}: Props & {
  message: ChatMessage;
  kind: ChatActionKind;
  onClose: () => void;
}) {
  const [error, setError] = useState(""),
    [shared, setShared] = useState(message.clientVisible),
    lock = useRef(false),
    id = chatActionId(message.id, kind);
  const members = data.members.filter(
      (m) => m.active !== false && canAccessProject(m, message.projectId),
    ),
    staff = members.filter((m) => m.role !== "client");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lock.current || busy) return;
    setError("");
    const fd = new FormData(e.currentTarget),
      f = (key: string) => String(fd.get(key) || "").trim();
    try {
      let record: ChatWorkRecord;
      validDate(f("due"));
      if (kind === "task")
        record = {
          id,
          projectId: message.projectId,
          title: f("title"),
          assigneeId: f("assigneeId"),
          due: f("due"),
          stage: f("stage"),
          priority: f("priority") as StudioTask["priority"],
          status: "To do",
        };
      else if (kind === "approval") {
        const reviewer = members.find((m) => m.id === f("reviewerId"));
        if (!reviewer || (reviewer.role === "client" && !shared))
          throw new Error("Choose a reviewer who can see this request.");
        record = {
          id,
          projectId: message.projectId,
          title: f("title"),
          description: message.body,
          authorId: member.id,
          reviewerId: reviewer.id,
          due: f("due"),
          status: "Awaiting decision",
          response: "",
          clientVisible: shared,
        };
      } else
        record = {
          id,
          projectId: message.projectId,
          title: f("title"),
          room: f("room"),
          description: message.body,
          photoId: f("photoId"),
          authorId: member.id,
          assigneeId: f("assigneeId"),
          due: f("due"),
          status: "Open",
          resolution: "",
          completionPhotoId: "",
          clientVisible: shared,
        };
      if (!f("title") || f("title").length > 300)
        throw new Error("Use a title of 1–300 characters.");
      lock.current = true;
      if (await onAction(message, kind, record)) onClose();
      else
        setError("The linked item was not saved. Check the workspace message.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
    }
  };
  return (
    <Modal
      title={
        kind === "task"
          ? "Create task from message"
          : kind === "snag"
            ? "Report snag from message"
            : "Request approval from message"
      }
      subtitle={data.projects.find((p) => p.id === message.projectId)?.name}
      onClose={() => {
        if (!busy && !lock.current) onClose();
      }}
      closeDisabled={busy}
    >
      <form className="studio-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <blockquote className="chat-source">
            {message.authorName}: {message.body || "Project photo"}
          </blockquote>
          <SmartField
            label="Title"
            name="title"
            category={kind === "task" ? "taskNames" : "workCategories"}
            value={message.body.slice(0, 100) || "Review project photo"}
            required
            maxLength={300}
          />
          {kind === "snag" && (
            <>
              <SmartField
                label="Room / area"
                name="room"
                category="rooms"
                required
              />
              <Field
                label="Project photo"
                name="photoId"
                value={message.photoIds[0] || ""}
              >
                <option value="">No photo</option>
                {data.files
                  .filter(
                    (f) =>
                      f.projectId === message.projectId &&
                      (!shared || f.clientVisible),
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.room} · {f.name}
                    </option>
                  ))}
              </Field>
            </>
          )}
          {kind === "approval" ? (
            <Field
              label="Reviewer"
              name="reviewerId"
              value={
                shared
                  ? members.find((m) => m.role === "client")?.id || member.id
                  : member.id
              }
              required
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Field>
          ) : (
            <Field label="Assigned to" name="assigneeId" value={member.id}>
              <option value="">Unassigned</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Field>
          )}
          <Field
            label="Due date"
            name="due"
            type="date"
            value={today()}
            required
          />
          {kind === "task" && (
            <div className="form-grid">
              <Field label="Project stage" name="stage" value="Execution">
                {lifecycle.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Field>
              <Field label="Priority" name="priority" value="Normal">
                <option>Normal</option>
                <option>High</option>
              </Field>
            </div>
          )}
          {kind !== "task" && (
            <label className="share-client">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              <span>
                Share this {kind} with the client
                <small>Review the copied message before sharing it.</small>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="studio-error">
              {error}
            </p>
          )}
          <div className="studio-form-actions">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              Create linked {kind}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function NotificationInbox({
  data,
  member,
  busy,
  onRead,
  onOpen,
}: {
  data: StudioData;
  member: StudioMember;
  busy: boolean;
  onRead: (notice: Notice) => Promise<boolean>;
  onOpen: (notice: Notice) => void;
}) {
  const [filter, setFilter] = useState("Unread"),
    items = inboxItems(data, member),
    shown = items.filter((i) => filter === "All" || !i.read);
  return (
    <section className="studio-panel">
      <div className="studio-section-heading">
        <div>
          <h2>Your notification inbox</h2>
          <p>Assignments, mentions, decisions and site follow-ups.</p>
        </div>
        <div className="ops-actions">
          {["Unread", "All"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "secondary"}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === "Unread"
                ? ` (${items.filter((i) => !i.read).length})`
                : ""}
            </Button>
          ))}
        </div>
      </div>
      {shown.map((item) => (
        <article
          className={`inbox-row ${item.read ? "read" : "unread"}`}
          key={item.key}
        >
          <div>
            <Badge>{item.title}</Badge>
            <h3>{item.detail}</h3>
            <small>
              {data.projects.find((p) => p.id === item.projectId)?.name}
            </small>
          </div>
          <div className="ops-actions">
            <Button onClick={() => onOpen(item)}>
              Open
              <ArrowRight size={15} />
            </Button>
            {!item.read && (
              <Button disabled={busy} onClick={() => onRead(item)}>
                Mark read
              </Button>
            )}
          </div>
        </article>
      ))}
      {!shown.length && (
        <Empty
          title={
            filter === "Unread" ? "You’re caught up" : "No notifications yet"
          }
          text="New mentions and work needing your attention will appear here."
        />
      )}
    </section>
  );
}
