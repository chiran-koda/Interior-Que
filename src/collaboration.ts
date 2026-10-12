import { today } from "./model";
import {
  canAccessProject,
  type StudioData,
  type StudioMember,
  type StudioTask,
  type Approval,
  type SiteUpdate,
} from "./studio-model";
import type { Snag } from "./project-operations";

export const listCategories = {
  rooms: "Rooms / areas",
  materials: "Materials",
  suppliers: "Suppliers",
  units: "Units",
  finishes: "Finishes / choices",
  brands: "Brands",
  workCategories: "Work categories",
  taskNames: "Common tasks",
} as const;
export type ListCategory = keyof typeof listCategories;
export interface ListValue {
  id: string;
  category: ListCategory;
  value: string;
  active: boolean;
}
export interface ChatMessage {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  clientVisible: boolean;
  replyTo: string;
  mentions: string[];
  photoIds: string[];
}
export type ChatActionKind = "task" | "snag" | "approval";
export interface ChatAction {
  id: string;
  messageId: string;
  projectId: string;
  kind: ChatActionKind;
  recordId: string;
  authorId: string;
  clientVisible: boolean;
  createdAt?: number;
}
export interface MentionNotice {
  id: string;
  projectId: string;
  messageId: string;
  recipientId: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  clientVisible: boolean;
  read: boolean;
}
export interface InboxRead {
  id: string;
  userId: string;
  keys: string[];
}
export type CollaborationCollection =
  | "listValues"
  | "chatMessages"
  | "chatActions"
  | "notifications"
  | "inboxReads";
export type ChatWorkRecord = StudioTask | Approval | Snag;
export const defaultLists: Record<ListCategory, string[]> = {
  rooms: [
    "Living room",
    "Kitchen",
    "Master bedroom",
    "Bedroom 2",
    "Bedroom 3",
    "Dining room",
    "Bathroom",
    "Balcony",
    "Office",
    "Site",
  ],
  materials: [
    "Plywood",
    "Laminate",
    "Hardware",
    "Paint",
    "Tiles",
    "Lights",
    "Electrical cable",
    "Gypsum board",
  ],
  suppliers: [],
  units: [
    "Sheets",
    "Sq.ft",
    "Sq.m",
    "Pieces",
    "Sets",
    "Litres",
    "Kg",
    "Metres",
    "Boxes",
  ],
  finishes: [
    "Matte laminate",
    "Gloss laminate",
    "Wood veneer",
    "Wall paint",
    "Floor tile",
    "Countertop stone",
  ],
  brands: [],
  workCategories: [
    "Electrical",
    "Carpentry",
    "Civil work",
    "Painting",
    "Ceiling",
    "Plumbing",
    "Installation",
    "Cleaning",
  ],
  taskNames: [
    "Confirm site measurements",
    "Review working drawing",
    "Approve material selection",
    "Follow up supplier delivery",
    "Inspect completed work",
    "Resolve snag",
    "Client walkthrough",
  ],
};
export const normalise = (value: string) => value.trim().replace(/\s+/g, " ");
export function listId(category: ListCategory, value: string) {
  return btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(
        JSON.stringify([category, normalise(value).toLowerCase()]),
      ),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
export function listOptions(
  data: StudioData,
  category: ListCategory,
): string[] {
  const retired = new Set(
    (data.listValues || [])
      .filter((v) => v.category === category && !v.active)
      .map((v) => normalise(v.value).toLowerCase()),
  );
  const historic =
    category === "rooms"
      ? [
          ...data.files.map((r) => r.room),
          ...data.updates.map((r) => r.room),
          ...(data.selections || []).map((r) => r.room),
          ...(data.snags || []).map((r) => r.room),
          ...(data.drawings || []).map((r) => r.room),
        ]
      : category === "materials"
        ? data.materials.map((m) => m.name)
        : category === "suppliers"
          ? (data.purchaseOrders || []).map((o) => o.supplier)
          : category === "units"
            ? [
                ...data.materials.map((m) => m.unit),
                ...(data.purchaseOrders || []).map((o) => o.unit),
              ]
            : category === "finishes"
              ? (data.selections || []).map((s) => s.title)
              : category === "taskNames"
                ? data.tasks.map((t) => t.title)
                : [];
  const values = [
    ...defaultLists[category],
    ...(data.listValues || [])
      .filter((v) => v.category === category && v.active)
      .map((v) => v.value),
    ...historic,
  ];
  const unique = new Map<string, string>();
  for (const raw of values) {
    const value = normalise(raw),
      key = value.toLowerCase();
    if (value && !retired.has(key) && !unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}
export function canSeeMessage(member: StudioMember, message: ChatMessage) {
  return (
    canAccessProject(member, message.projectId) &&
    (member.role !== "client" || message.clientVisible)
  );
}
export function validateChat(
  data: StudioData,
  member: StudioMember,
  message: ChatMessage,
) {
  if (
    !canSeeMessage(member, message) ||
    member.active === false ||
    message.authorId !== member.id
  )
    throw new Error("You cannot send to this conversation.");
  if (!message.body.trim() && message.photoIds.length === 0)
    throw new Error("Write a message or attach a project photo.");
  if (
    message.body.length > 4000 ||
    message.photoIds.length > 2 ||
    message.mentions.length > 5 ||
    new Set(message.mentions).size !== message.mentions.length
  )
    throw new Error(
      "Use up to 4,000 characters, two photos and five mentions.",
    );
  if (
    message.replyTo &&
    !data.chatMessages?.some(
      (m) =>
        m.id === message.replyTo &&
        m.projectId === message.projectId &&
        m.clientVisible === message.clientVisible,
    )
  )
    throw new Error("Reply to a message in this conversation.");
  for (const id of message.photoIds)
    if (
      !data.files.some(
        (f) =>
          f.id === id &&
          f.projectId === message.projectId &&
          (!message.clientVisible || f.clientVisible),
      )
    )
      throw new Error("Choose a photo available in this conversation.");
  for (const id of message.mentions)
    if (
      !data.members.some(
        (m) =>
          m.id === id &&
          m.active !== false &&
          canAccessProject(m, message.projectId) &&
          (m.role !== "client" || message.clientVisible),
      )
    )
      throw new Error("Mention someone with access to this conversation.");
}
export function addDemoMessage(
  data: StudioData,
  member: StudioMember,
  message: ChatMessage,
): StudioData {
  validateChat(data, member, message);
  if (data.chatMessages?.some((m) => m.id === message.id)) return data;
  const notices = message.mentions
    .filter((id) => id !== member.id)
    .map((recipientId) => ({
      id: `${message.id}_${recipientId}`,
      messageId: message.id,
      projectId: message.projectId,
      recipientId,
      authorId: member.id,
      authorName: member.name,
      createdAt: message.createdAt,
      clientVisible: message.clientVisible,
      read: false,
    }));
  return {
    ...data,
    chatMessages: [message, ...(data.chatMessages || [])],
    notifications: [...notices, ...(data.notifications || [])],
  };
}
export function chatActionId(messageId: string, kind: ChatActionKind) {
  return `${messageId}_${kind}`;
}
export function addDemoChatAction(
  data: StudioData,
  member: StudioMember,
  message: ChatMessage,
  kind: ChatActionKind,
  record: ChatWorkRecord,
): StudioData {
  if (member.role === "client" || !canSeeMessage(member, message))
    throw new Error(
      "Only the assigned team can create work from this message.",
    );
  const id = chatActionId(message.id, kind);
  if (data.chatActions?.some((a) => a.id === id))
    throw new Error("This message already has that linked item.");
  if (record.projectId !== message.projectId || record.id !== id)
    throw new Error("The linked item must stay in this project.");
  const key =
    kind === "task" ? "tasks" : kind === "snag" ? "snags" : "approvals";
  return {
    ...data,
    [key]: [record, ...(data[key] || [])],
    chatActions: [
      {
        id,
        messageId: message.id,
        projectId: message.projectId,
        kind,
        recordId: record.id,
        authorId: member.id,
        clientVisible: message.clientVisible,
        createdAt: Date.now(),
      },
      ...(data.chatActions || []),
    ],
  };
}
export interface Notice {
  key: string;
  projectId: string;
  title: string;
  detail: string;
  page: "Tasks" | "Approvals" | "Site updates" | "Projects" | "Chat";
  tool?: string;
  mentionId?: string;
  messageId?: string;
  read: boolean;
}
export function inboxItems(data: StudioData, member: StudioMember): Notice[] {
  const reads = new Set(
      data.inboxReads?.find((r) => r.userId === member.id)?.keys || [],
    ),
    items: Omit<Notice, "read">[] = [],
    client = member.role === "client",
    owner = member.role === "owner";
  if (!client)
    for (const task of data.tasks.filter(
      (t) => t.status !== "Done" && (owner || t.assigneeId === member.id),
    ))
      items.push({
        key: `task:${task.id}:${task.due}:${task.assigneeId}`,
        projectId: task.projectId,
        title: task.due < today() ? "Overdue task" : "Assigned work",
        detail: task.title,
        page: "Tasks",
      });
  for (const r of [
    ...data.approvals,
    ...(data.selections || []),
    ...(data.changeOrders || []),
  ].filter(
    (r) => r.status === "Awaiting decision" && r.reviewerId === member.id,
  ))
    items.push({
      key: `review:${r.id}`,
      projectId: r.projectId,
      title: "Decision needed",
      detail: r.title,
      page: "Approvals",
    });
  if (!client)
    for (const r of data.updates
      .filter((r) => r.blocker)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10))
      items.push({
        key: `blocker:${r.id}`,
        projectId: r.projectId,
        title: "Site needs attention",
        detail: r.blocker,
        page: "Site updates",
      });
  for (const s of data.snags || [])
    if (
      s.status !== "Resolved" &&
      (s.assigneeId === member.id ||
        owner ||
        (client && s.authorId === member.id))
    )
      items.push({
        key: `snag:${s.id}:${s.status}`,
        projectId: s.projectId,
        title:
          s.status === "Ready for check"
            ? "Repair ready for verification"
            : "Snag to resolve",
        detail: s.title,
        page: "Projects",
        tool: "Snags",
      });
  if (!client)
    for (const o of (data.purchaseOrders || []).filter(
      (o) => o.receivedQuantity < o.quantity && o.due <= today(),
    ))
      items.push({
        key: `delivery:${o.id}:${o.due}`,
        projectId: o.projectId,
        title: "Delivery due",
        detail: `${o.title} · ${o.supplier}`,
        page: "Projects",
        tool: "Orders",
      });
  if (owner || client)
    for (const s of (data.paymentSchedules || []).filter(
      (s) => s.received < s.amount && s.due <= today(),
    ))
      items.push({
        key: `collection:${s.id}:${s.due}`,
        projectId: s.projectId,
        title: "Payment milestone due",
        detail: s.title,
        page: "Projects",
        tool: client ? "Payments" : "Budget",
      });
  const result = items.map((i) => ({ ...i, read: reads.has(i.key) }));
  for (const n of [...(data.notifications || [])].reverse())
    if (n.recipientId === member.id)
      result.unshift({
        key: `mention:${n.id}`,
        projectId: n.projectId,
        title: `${n.authorName} mentioned you`,
        detail: n.clientVisible ? "Client conversation" : "Team conversation",
        page: "Chat",
        mentionId: n.id,
        messageId: n.messageId,
        tool: n.clientVisible ? "client" : "team",
        read: n.read,
      });
  return result.filter((i) => canAccessProject(member, i.projectId));
}
export function projectHelper(
  data: StudioData,
  member: StudioMember,
  projectId: string,
) {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project || !canAccessProject(member, projectId))
    throw new Error("Choose an available project.");
  const tasks = data.tasks.filter(
      (t) => t.projectId === projectId && t.status !== "Done",
    ),
    decisions = [
      ...data.approvals,
      ...(data.selections || []),
      ...(data.changeOrders || []),
    ].filter(
      (r) => r.projectId === projectId && r.status === "Awaiting decision",
    ),
    updates = data.updates
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    snags = (data.snags || []).filter(
      (r) => r.projectId === projectId && r.status !== "Resolved",
    ),
    drawings = (data.drawings || []).filter(
      (d) => d.projectId === projectId && d.status === "Approved",
    );
  return {
    project,
    tasks,
    decisions,
    updates,
    snags,
    drawings,
    summary: `${project.name}: ${project.progress}% recorded progress. ${member.role === "client" ? "" : `${tasks.length} open team tasks, `}${decisions.length} pending decisions and ${snags.length} unresolved ${member.role === "client" ? "shared " : ""}snags.${updates[0] ? ` Latest ${member.role === "client" ? "shared " : ""}site report (${updates[0].date}): ${updates[0].summary}` : " No site report recorded yet."}`,
    clientDraft: `${project.name} — progress update\nRecorded progress: ${project.progress}%\n${updates.filter((u) => u.clientVisible)[0]?.summary || "The team will share the next site update shortly."}\n${decisions.filter((d) => d.clientVisible).length} shared decision(s) awaiting review.`,
  };
}
