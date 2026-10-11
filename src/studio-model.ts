import { seed, today, uid, type Project } from "./model";

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
}
export interface StudioPayment {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  type: "Received" | "Spent";
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
    invites: member.role === "owner" ? data.invites : [],
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
export function driveProject(p: StudioProject): Project {
  return {
    id: p.id,
    name: p.name,
    clientId: "",
    type: "Interior",
    location: p.location,
    value: 0,
    start: p.start,
    end: p.end,
    status: "In progress",
    progress: p.progress,
    image: p.image,
    description: p.brief,
  };
}
export function safeFileUrl(url: string) {
  if (/^\/images\/[\w.-]+$/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "drive.google.com" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
