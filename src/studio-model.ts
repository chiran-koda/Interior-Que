import { seed, today, uid } from "./model";
import type {
  ListValue,
  ChatMessage,
  ChatAction,
  MentionNotice,
  InboxRead,
} from "./collaboration";
import type {
  ProjectBudget,
  PaymentSchedule,
  Selection,
  ChangeOrder,
  Drawing,
  DrawingHead,
  PurchaseOrder,
  Snag,
  Handover,
} from "./project-operations";

export type StudioRole = "owner" | "designer" | "supervisor" | "client";
export const roleNames: Record<StudioRole, string> = {
  owner: "Company owner",
  designer: "Designer",
  supervisor: "Site supervisor",
  client: "Client",
};
export interface StudioMember {
  id: string;
  email: string;
  name: string;
  role: StudioRole;
  projectIds: string[];
  active?: boolean;
}
export interface StudioProject {
  id: string;
  name: string;
  clientName: string;
  location: string;
  start: string;
  end: string;
  progress: number;
  status: string;
  brief: string;
  image: string;
}
export interface StudioTask {
  id: string;
  projectId: string;
  title: string;
  assigneeId: string;
  due: string;
  stage: string;
  priority: "Normal" | "High";
  status: "To do" | "Doing" | "Done";
}
export interface SiteUpdate {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  date: string;
  room: string;
  summary: string;
  blocker: string;
  clientVisible: boolean;
  tomorrow?: string;
  shortages?: string;
  workers?: number;
  photoIds?: string[];
}
export interface Approval {
  id: string;
  projectId: string;
  title: string;
  description: string;
  reviewerId: string;
  authorId: string;
  due: string;
  status: "Awaiting decision" | "Approved" | "Changes requested";
  response: string;
  clientVisible: boolean;
}
export interface StudioFile {
  id: string;
  projectId: string;
  name: string;
  url: string;
  room: string;
  caption: string;
  authorId: string;
  clientVisible: boolean;
  date: string;
  kind?: "photo";
  objectKey?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  mime?: string;
}
export interface StudioPayment {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  type: "Received" | "Spent";
  date: string;
  categoryId?: string;
  milestoneId?: string;
  mode?: "Cash" | "Bank transfer" | "UPI" | "Cheque" | "Other" | "Unspecified";
}
export interface MoneyCategory {
  id: string;
  name: string;
  type: StudioPayment["type"];
  color: string;
  active: boolean;
}
export interface CashOpening {
  id: string;
  projectId: string;
  amount: number;
  date: string;
}
export interface StudioMaterial {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  status: "To order" | "Ordered" | "On site";
  notes: string;
  brand?: string;
  category?: string;
}
export interface StudioInvite {
  id: string;
  email: string;
  name: string;
  role: Exclude<StudioRole, "owner">;
  projectIds: string[];
  status: "Pending" | "Accepted";
}
export interface StudioData {
  id: string;
  name: string;
  projects: StudioProject[];
  members: StudioMember[];
  tasks: StudioTask[];
  updates: SiteUpdate[];
  approvals: Approval[];
  files: StudioFile[];
  payments: StudioPayment[];
  materials: StudioMaterial[];
  invites: StudioInvite[];
  moneyCategories?: MoneyCategory[];
  cashOpenings?: CashOpening[];
  balanceOpenings?: CashOpening[];
  projectBudgets?: ProjectBudget[];
  paymentSchedules?: PaymentSchedule[];
  selections?: Selection[];
  changeOrders?: ChangeOrder[];
  drawings?: Drawing[];
  drawingHeads?: DrawingHead[];
  purchaseOrders?: PurchaseOrder[];
  snags?: Snag[];
  handovers?: Handover[];
  listValues?: ListValue[];
  chatMessages?: ChatMessage[];
  chatActions?: ChatAction[];
  notifications?: MentionNotice[];
  inboxReads?: InboxRead[];
}
export const newStudio = (id: string, name: string): StudioData => ({
  id,
  name,
  projects: [],
  members: [],
  tasks: [],
  updates: [],
  approvals: [],
  files: [],
  payments: [],
  materials: [],
  invites: [],
  moneyCategories: [],
  cashOpenings: [],
  balanceOpenings: [],
  projectBudgets: [],
  paymentSchedules: [],
  selections: [],
  changeOrders: [],
  drawings: [],
  drawingHeads: [],
  purchaseOrders: [],
  snags: [],
  handovers: [],
  listValues: [],
  chatMessages: [],
  chatActions: [],
  notifications: [],
  inboxReads: [],
});
export function demoStudio(): StudioData {
  const w = seed();
  const members: StudioMember[] = [
    {
      id: "owner",
      name: "Sai Venkat",
      email: "owner@example.com",
      role: "owner",
      projectIds: [],
    },
    {
      id: "designer",
      name: "Priya S",
      email: "designer@example.com",
      role: "designer",
      projectIds: ["p1", "p2"],
    },
    {
      id: "supervisor",
      name: "Ramesh B",
      email: "site@example.com",
      role: "supervisor",
      projectIds: ["p1", "p2"],
    },
    {
      id: "client",
      name: "Mr. Ramesh",
      email: "client@example.com",
      role: "client",
      projectIds: ["p1"],
    },
  ];
  const projects = w.projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: w.clients.find((c) => c.id === p.clientId)?.name || "",
    location: p.location,
    start: p.start,
    end: p.end,
    progress: p.progress,
    status: p.status,
    brief: p.description,
    image: p.image,
  }));
  const tasks: StudioTask[] = w.tasks.map((t, i) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.name,
    assigneeId: i % 5 < 2 ? "designer" : "supervisor",
    due: t.due,
    stage: t.stage,
    priority: t.priority === "High" ? "High" : "Normal",
    status: t.progress === 100 ? "Done" : t.progress > 0 ? "Doing" : "To do",
  }));
  return {
    ...newStudio("demo", "Interior Que Studio"),
    projects,
    members,
    tasks,
    payments: w.transactions.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      amount: t.amount,
      type: t.type,
      date: t.date,
      description: t.description,
      mode:
        t.mode === "Cash"
          ? "Cash"
          : t.mode === "UPI"
            ? "UPI"
            : t.mode === "Cheque"
              ? "Cheque"
              : "Bank transfer",
      categoryId: t.type === "Received" ? "inc-client" : "exp-materials",
    })),
    updates: [
      {
        id: "update-1",
        projectId: "p1",
        authorId: "supervisor",
        authorName: "Ramesh B",
        date: today(),
        room: "Living room",
        summary:
          "Ceiling framework is complete. Electrical points have been checked with the approved drawing.",
        blocker: "Kitchen hardware delivery needs confirmation.",
        clientVisible: true,
      },
    ],
    approvals: [
      {
        id: "approval-1",
        projectId: "p1",
        title: "Living room material palette",
        description:
          "Please review the warm oak finish and ivory wall colour. Confirm before we place the material order.",
        reviewerId: "client",
        authorId: "designer",
        due: today(),
        status: "Awaiting decision",
        response: "",
        clientVisible: true,
      },
    ],
    files: [
      {
        id: "file-1",
        projectId: "p1",
        name: "Living room design reference",
        url: "/images/living.jpg",
        room: "Living room",
        caption: "Sample design reference",
        authorId: "designer",
        clientVisible: true,
        date: today(),
      },
    ],
  };
}
export function canAccessProject(member: StudioMember, id: string) {
  return (
    member.active !== false &&
    (member.role === "owner" || member.projectIds.includes(id))
  );
}
export function scopedStudio(
  data: StudioData,
  member: StudioMember,
): StudioData {
  if (member.active === false) return newStudio(data.id, data.name);
  const allowed = (id: string) => canAccessProject(member, id);
  const client = member.role === "client";
  return {
    ...data,
    projects: data.projects.filter((p) => allowed(p.id)),
    members: client
      ? data.members.filter((m) => m.id === member.id)
      : data.members,
    tasks: client ? [] : data.tasks.filter((t) => allowed(t.projectId)),
    materials: client
      ? []
      : (data.materials || []).filter((m) => allowed(m.projectId)),
    updates: data.updates.filter(
      (u) => allowed(u.projectId) && (!client || u.clientVisible),
    ),
    approvals: data.approvals.filter(
      (a) => allowed(a.projectId) && (!client || a.clientVisible),
    ),
    files: data.files.filter(
      (f) => allowed(f.projectId) && (!client || f.clientVisible),
    ),
    payments: member.role === "owner" ? data.payments : [],
    moneyCategories: member.role === "owner" ? data.moneyCategories || [] : [],
    cashOpenings: member.role === "owner" ? data.cashOpenings || [] : [],
    balanceOpenings: member.role === "owner" ? data.balanceOpenings || [] : [],
    invites: member.role === "owner" ? data.invites : [],
    projectBudgets: member.role === "owner" ? data.projectBudgets || [] : [],
    paymentSchedules:
      member.role === "owner" || client
        ? (data.paymentSchedules || []).filter(
            (r) => allowed(r.projectId) && (!client || r.clientVisible),
          )
        : [],
    changeOrders:
      member.role === "owner" || client
        ? (data.changeOrders || []).filter(
            (r) => allowed(r.projectId) && (!client || r.clientVisible),
          )
        : [],
    selections: (data.selections || []).filter(
      (r) => allowed(r.projectId) && (!client || r.clientVisible),
    ),
    drawings: (data.drawings || []).filter(
      (r) => allowed(r.projectId) && (!client || r.clientVisible),
    ),
    drawingHeads: (data.drawingHeads || []).filter(
      (r) => allowed(r.projectId) && (!client || r.clientVisible),
    ),
    purchaseOrders: client
      ? []
      : (data.purchaseOrders || []).filter((r) => allowed(r.projectId)),
    snags: (data.snags || []).filter(
      (r) => allowed(r.projectId) && (!client || r.clientVisible),
    ),
    handovers: (data.handovers || []).filter(
      (r) => allowed(r.projectId) && (!client || r.clientVisible),
    ),
    listValues: (data.listValues || []).filter(
      (v) => !client || ["rooms", "finishes"].includes(v.category),
    ),
    chatMessages: (data.chatMessages || []).filter(
      (m) => allowed(m.projectId) && (!client || m.clientVisible),
    ),
    chatActions: (data.chatActions || []).filter(
      (m) => allowed(m.projectId) && (!client || m.clientVisible),
    ),
    notifications: (data.notifications || []).filter(
      (n) =>
        n.recipientId === member.id &&
        allowed(n.projectId) &&
        (!client || n.clientVisible),
    ),
    inboxReads: (data.inboxReads || []).filter((r) => r.userId === member.id),
  };
}
export function taskProgress(tasks: StudioTask[]) {
  return tasks.length
    ? Math.round(
        (tasks.filter((t) => t.status === "Done").length / tasks.length) * 100,
      )
    : 0;
}
export function isOverdue(task: StudioTask, date = today()) {
  return task.status !== "Done" && task.due < date;
}
export const lifecycle = [
  "Design & approval",
  "Material selection",
  "Execution",
  "Finishing",
  "Handover",
];
export function projectStarter(
  projectId: string,
  assigneeId: string,
  end: string,
): StudioTask[] {
  return lifecycle.map((stage) => ({
    id: uid(),
    projectId,
    title: (
      {
        "Design & approval": "Prepare drawings and get client approval",
        "Material selection": "Confirm materials and place orders",
        Execution: "Complete site execution",
        Finishing: "Inspect finishes and resolve snags",
        Handover: "Client walkthrough and handover",
      } as Record<string, string>
    )[stage],
    stage,
    assigneeId,
    due: end,
    priority: "Normal",
    status: "To do",
  }));
}
export function safeFileUrl(url: string) {
  return /^\/images\/[\w.-]+$/.test(url);
}
