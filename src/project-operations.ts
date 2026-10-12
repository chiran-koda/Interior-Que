import { uid } from "./model";
import { validAmount, validDate } from "./money";
import {
  canAccessProject,
  type StudioData,
  type StudioProject,
  type StudioTask,
  type StudioMember,
  type StudioPayment,
} from "./studio-model";

export interface ProjectBudget {
  id: string;
  projectId: string;
  contractValue: number;
  costBudget: number;
  quotationRef: string;
}
export interface PaymentSchedule {
  id: string;
  projectId: string;
  title: string;
  amount: number;
  received: number;
  due: string;
  clientVisible: boolean;
}
export interface Selection {
  id: string;
  projectId: string;
  room: string;
  title: string;
  specification: string;
  photoId: string;
  authorId: string;
  reviewerId: string;
  due: string;
  status: "Awaiting decision" | "Approved" | "Changes requested";
  response: string;
  clientVisible: boolean;
}
export interface ChangeOrder {
  id: string;
  projectId: string;
  title: string;
  description: string;
  amount: number;
  extraDays: number;
  authorId: string;
  reviewerId: string;
  due: string;
  status: Selection["status"];
  response: string;
  clientVisible: boolean;
}
export interface Drawing {
  id: string;
  projectId: string;
  groupId: string;
  title: string;
  room: string;
  url: string;
  version: number;
  authorId: string;
  date: string;
  status: "Draft" | "Approved" | "Superseded";
  clientVisible: boolean;
}
export interface DrawingHead {
  id: string;
  projectId: string;
  groupId: string;
  nextVersion: number;
  currentId: string;
  clientVisible: boolean;
}
export interface PurchaseOrder {
  id: string;
  projectId: string;
  materialId: string;
  title: string;
  supplier: string;
  quantity: number;
  receivedQuantity: number;
  unit: string;
  unitRate: number;
  due: string;
  notes: string;
  authorId: string;
}
export interface Snag {
  id: string;
  projectId: string;
  title: string;
  room: string;
  description: string;
  photoId: string;
  authorId: string;
  assigneeId: string;
  due: string;
  status: "Open" | "Ready for check" | "Resolved";
  resolution: string;
  completionPhotoId: string;
  clientVisible: boolean;
}
export const handoverItems = [
  "Work inspected",
  "Snags resolved",
  "Keys and access delivered",
  "Drawings and warranties shared",
  "Client walkthrough completed",
] as const;
export interface Handover {
  id: string;
  projectId: string;
  checks: boolean[];
  date: string;
  notes: string;
  completed: boolean;
  clientVisible: boolean;
}
export type OperationCollection =
  | "projectBudgets"
  | "paymentSchedules"
  | "selections"
  | "changeOrders"
  | "drawings"
  | "drawingHeads"
  | "purchaseOrders"
  | "snags"
  | "handovers";
export type OperationRecord =
  | ProjectBudget
  | PaymentSchedule
  | Selection
  | ChangeOrder
  | Drawing
  | DrawingHead
  | PurchaseOrder
  | Snag
  | Handover;

type TaskSeed = [string, string, number];
const homeTasks: TaskSeed[] = [
  ["Site measurements and scope confirmation", "Design & approval", 0.08],
  ["Prepare room layouts and working drawings", "Design & approval", 0.18],
  ["Client approval of drawings and finishes", "Design & approval", 0.25],
  ["Confirm materials and place orders", "Material selection", 0.35],
  ["Complete electrical and ceiling work", "Execution", 0.55],
  ["Complete carpentry and installation", "Execution", 0.78],
  ["Painting, finishing and snag inspection", "Finishing", 0.94],
  ["Client walkthrough and handover", "Handover", 1],
];
export const projectTemplates: {
  id: string;
  name: string;
  description: string;
  tasks: TaskSeed[];
}[] = [
  {
    id: "basic",
    name: "Simple project",
    description: "Five broad stages to customise yourself.",
    tasks: [
      ["Prepare drawings and get client approval", "Design & approval", 0.2],
      ["Confirm materials and place orders", "Material selection", 0.35],
      ["Complete site execution", "Execution", 0.8],
      ["Inspect finishes and resolve snags", "Finishing", 0.95],
      ["Client walkthrough and handover", "Handover", 1],
    ],
  },
  {
    id: "2bhk",
    name: "2BHK home",
    description: "Room planning, ceiling, electrical, carpentry and handover.",
    tasks: homeTasks,
  },
  {
    id: "3bhk",
    name: "3BHK home",
    description: "Home workflow with wardrobe and storage planning.",
    tasks: [
      ...homeTasks.slice(0, 4),
      [
        "Confirm bedroom wardrobes and storage details",
        "Material selection",
        0.4,
      ],
      ...homeTasks.slice(4),
    ],
  },
  {
    id: "villa",
    name: "Villa",
    description:
      "Floor coordination, outdoor finishes and a full home walkthrough.",
    tasks: [
      ...homeTasks.slice(0, 4),
      ["Coordinate floor-wise services and site access", "Execution", 0.45],
      ...homeTasks.slice(4, 7),
      ["Inspect stairs, outdoor areas and final finishes", "Finishing", 0.96],
      homeTasks[7],
    ],
  },
  {
    id: "office",
    name: "Office",
    description:
      "Workstations, services, network, signage and fit-out inspection.",
    tasks: [
      [
        "Confirm workplace requirements and site measurements",
        "Design & approval",
        0.08,
      ],
      [
        "Approve layout, services and furniture drawings",
        "Design & approval",
        0.25,
      ],
      [
        "Order furniture, lights and finish materials",
        "Material selection",
        0.35,
      ],
      ["Complete electrical, data and ceiling work", "Execution", 0.55],
      ["Install partitions, workstations and storage", "Execution", 0.8],
      ["Test lighting, network points and signage", "Finishing", 0.94],
      ["Office walkthrough and handover", "Handover", 1],
    ],
  },
  {
    id: "renovation",
    name: "Renovation",
    description: "Protection, demolition, repairs and phased completion.",
    tasks: [
      [
        "Survey existing conditions and confirm scope",
        "Design & approval",
        0.08,
      ],
      ["Approve revised drawings and finish choices", "Design & approval", 0.2],
      [
        "Protect retained areas and arrange materials",
        "Material selection",
        0.3,
      ],
      ["Complete demolition and civil repairs", "Execution", 0.45],
      ["Complete services and new installation", "Execution", 0.78],
      ["Inspect finishes, clean and resolve snags", "Finishing", 0.95],
      ["Client walkthrough and handover", "Handover", 1],
    ],
  },
];
export function templateTasks(
  templateId: string,
  project: Pick<StudioProject, "id" | "start" | "end">,
  assigneeId: string,
): StudioTask[] {
  if (
    !validDate(project.start) ||
    !validDate(project.end) ||
    project.end < project.start
  )
    throw new Error("Choose a valid project schedule.");
  const template = projectTemplates.find((t) => t.id === templateId);
  if (!template) throw new Error("Choose a project template.");
  const start = Date.parse(`${project.start}T12:00:00Z`),
    span = Date.parse(`${project.end}T12:00:00Z`) - start;
  return template.tasks.map(([title, stage, fraction]) => ({
    id: uid(),
    projectId: project.id,
    title,
    stage,
    assigneeId,
    due: new Date(start + Math.round((span / 86400000) * fraction) * 86400000)
      .toISOString()
      .slice(0, 10),
    priority: "Normal",
    status: "To do",
  }));
}
export function budgetSummary(data: StudioData, projectId: string) {
  const budget = data.projectBudgets?.find((b) => b.projectId === projectId);
  const cents = (n: number) => Math.round(n * 100);
  const approved = (data.changeOrders || []).filter(
    (c) => c.projectId === projectId && c.status === "Approved",
  );
  const extras = approved.reduce((n, c) => n + cents(c.amount), 0);
  const contract = cents(budget?.contractValue || 0) + extras;
  const received = data.payments
    .filter(
      (p) =>
        p.projectId === projectId &&
        p.type === "Received" &&
        (!p.categoryId || p.categoryId === "inc-client" || p.milestoneId),
    )
    .reduce((n, p) => n + cents(p.amount), 0);
  const spent = data.payments
    .filter((p) => p.projectId === projectId && p.type === "Spent")
    .reduce((n, p) => n + cents(p.amount), 0);
  return {
    configured: !!budget,
    contract: contract / 100,
    extras: extras / 100,
    received: received / 100,
    spent: spent / 100,
    remaining: Math.max(0, contract - received) / 100,
    forecastMargin: budget ? (contract - cents(budget.costBudget)) / 100 : null,
    overBudget: budget
      ? Math.max(0, spent - cents(budget.costBudget)) / 100
      : null,
    extraDays: approved.reduce((n, c) => n + c.extraDays, 0),
  };
}
export function outstanding(schedule: PaymentSchedule) {
  return (
    Math.max(
      0,
      Math.round(schedule.amount * 100) - Math.round(schedule.received * 100),
    ) / 100
  );
}
export function orderStatus(order: PurchaseOrder) {
  return order.receivedQuantity >= order.quantity
    ? "Received"
    : order.receivedQuantity > 0
      ? "Part received"
      : "Ordered";
}
export function drawingGroup(room: string, title: string) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([room.trim().toLowerCase(), title.trim().toLowerCase()]),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
export function safeDrawingLink(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function canFinishHandover(snags: Snag[], checks: boolean[]) {
  return (
    checks.length === handoverItems.length &&
    checks.every(Boolean) &&
    snags.every((s) => s.status === "Resolved")
  );
}
export function validateOperation(
  key: OperationCollection,
  record: OperationRecord,
) {
  const r = record as any;
  if (!r.projectId || !r.id) throw new Error("Choose a project.");
  for (const field of [
    "title",
    "room",
    "supplier",
    "unit",
    "specification",
    "description",
  ])
    if (
      field in r &&
      typeof r[field] === "string" &&
      !r[field].trim() &&
      ["title", "room", "supplier", "unit"].includes(field)
    )
      throw new Error(
        `Enter ${field.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
      );
  if ("due" in r && !validDate(r.due))
    throw new Error("Choose a valid due date.");
  const limits: Record<string, number> = {
    title: 300,
    room: 120,
    supplier: 300,
    unit: 40,
    specification: 4000,
    description: 4000,
    response: 2000,
    notes: 2000,
    resolution: 2000,
    quotationRef: 500,
    url: 2000,
    groupId: 1000,
  };
  for (const [field, max] of Object.entries(limits))
    if (field in r && (typeof r[field] !== "string" || r[field].length > max))
      throw new Error(
        `${field.replace(/([A-Z])/g, " $1")} must be no longer than ${max} characters.`,
      );
  if (key === "projectBudgets")
    for (const n of [r.contractValue, r.costBudget])
      validAmount(String(n), true);
  if (key === "paymentSchedules") validAmount(String(r.amount));
  if (key === "changeOrders") {
    validAmount(String(r.amount), true);
    if (!Number.isInteger(r.extraDays) || r.extraDays < 0 || r.extraDays > 365)
      throw new Error("Enter 0–365 additional days.");
  }
  if (key === "drawings" && !safeDrawingLink(r.url))
    throw new Error(
      "Use an HTTPS drawing link without embedded account credentials.",
    );
  if (key === "purchaseOrders") {
    validAmount(String(r.unitRate), true);
    if (
      !(r.quantity > 0) ||
      !Number.isFinite(r.quantity) ||
      !(r.receivedQuantity >= 0 && r.receivedQuantity <= r.quantity)
    )
      throw new Error("Check ordered and received quantities.");
  }
  if (key === "handovers") validDate(r.date);
}

export function applyProjectPayment(
  data: StudioData,
  payment: StudioPayment,
): StudioData {
  const previous = data.payments.find((p) => p.id === payment.id);
  if (
    previous &&
    (previous.projectId !== payment.projectId || previous.type !== payment.type)
  )
    throw new Error("The transaction’s project and type stay fixed.");
  const ids = [previous?.milestoneId, payment.milestoneId].filter(Boolean);
  for (const id of ids)
    if (
      payment.type !== "Received" ||
      !data.paymentSchedules?.some(
        (s) => s.id === id && s.projectId === payment.projectId,
      )
    )
      throw new Error("Choose a payment milestone from this project.");
  return {
    ...data,
    payments: [payment, ...data.payments.filter((p) => p.id !== payment.id)],
    paymentSchedules: (data.paymentSchedules || []).map((s) => {
      const before =
        previous?.milestoneId === s.id ? Math.round(previous.amount * 100) : 0;
      const after =
        payment.milestoneId === s.id ? Math.round(payment.amount * 100) : 0;
      return before || after
        ? {
            ...s,
            received:
              Math.max(0, Math.round(s.received * 100) + after - before) / 100,
          }
        : s;
    }),
  };
}
export function applyOperation(
  data: StudioData,
  key: OperationCollection,
  record: OperationRecord,
  member: StudioMember,
): StudioData {
  validateOperation(key, record);
  if (member.active === false || !canAccessProject(member, record.projectId))
    throw new Error("You cannot update this project.");
  const owner = member.role === "owner",
    client = member.role === "client";
  const previous = (data[key] || []).find((r) => r.id === record.id) as any;
  const put = (r: OperationRecord): StudioData => ({
    ...data,
    [key]: [r, ...(data[key] || []).filter((v) => v.id !== r.id)],
  });
  if (
    ["projectBudgets", "paymentSchedules", "handovers"].includes(key) &&
    !owner
  )
    throw new Error("Only the owner can edit this record.");
  if (key === "paymentSchedules")
    return put({
      ...record,
      received: previous?.received || 0,
    } as PaymentSchedule);
  if (key === "selections" || key === "changeOrders") {
    const r = record as Selection | ChangeOrder;
    if (previous) {
      if (
        previous.status !== "Awaiting decision" ||
        previous.reviewerId !== member.id ||
        !["Approved", "Changes requested"].includes(r.status)
      )
        throw new Error("This item is not awaiting your decision.");
      if (r.status === "Changes requested" && !r.response.trim())
        throw new Error("Explain the changes needed.");
      return put({ ...previous, status: r.status, response: r.response });
    }
    if (client || (key === "changeOrders" && !owner))
      throw new Error("You cannot create this request.");
    const reviewer = data.members.find(
      (m) =>
        m.id === r.reviewerId &&
        m.active !== false &&
        canAccessProject(m, r.projectId),
    );
    if (
      !reviewer ||
      (reviewer.role === "client" && !r.clientVisible) ||
      (key === "changeOrders" && !["owner", "client"].includes(reviewer.role))
    )
      throw new Error("Choose an available reviewer.");
    if (r.authorId !== member.id || r.status !== "Awaiting decision")
      throw new Error("Create a new pending request.");
  }
  if (key === "drawings") {
    if (client) throw new Error("Only the team can add drawings.");
    const r = record as Drawing,
      groupId = drawingGroup(r.room, r.title),
      headId = `${r.projectId}_${groupId}`,
      head = data.drawingHeads?.find((h) => h.id === headId);
    if (r.version === 0 && !previous)
      return {
        ...put({
          ...r,
          groupId,
          version: (head?.nextVersion || 0) + 1,
          status: "Draft",
          clientVisible: false,
        }),
        drawingHeads: [
          {
            id: headId,
            projectId: r.projectId,
            groupId,
            nextVersion: (head?.nextVersion || 0) + 1,
            currentId: head?.currentId || "",
            clientVisible: head?.clientVisible || false,
          },
          ...(data.drawingHeads || []).filter((h) => h.id !== headId),
        ],
      };
    if (
      !owner ||
      previous?.status !== "Draft" ||
      r.status !== "Approved" ||
      !head
    )
      throw new Error("This drawing is not awaiting owner approval.");
    return {
      ...data,
      drawings: (data.drawings || []).map((d) =>
        d.id === r.id
          ? { ...d, status: "Approved", clientVisible: r.clientVisible }
          : d.id === head.currentId
            ? { ...d, status: "Superseded" }
            : d,
      ),
      drawingHeads: (data.drawingHeads || []).map((h) =>
        h.id === headId
          ? { ...h, currentId: r.id, clientVisible: r.clientVisible }
          : h,
      ),
    };
  }
  if (key === "purchaseOrders") {
    const r = record as PurchaseOrder;
    if (client || (!previous && !owner && member.role !== "designer"))
      throw new Error("Only the owner or designer can create an order.");
    if (previous && !owner && r.receivedQuantity < previous.receivedQuantity)
      throw new Error("Delivered quantities cannot be reduced.");
    const next = put(
      previous ? { ...previous, receivedQuantity: r.receivedQuantity } : r,
    );
    if (r.materialId) {
      const material = data.materials.find(
        (m) => m.id === r.materialId && m.projectId === r.projectId,
      );
      if (!material) throw new Error("Choose a material from this project.");
      const received = (next.purchaseOrders || [])
        .filter(
          (o) => o.projectId === r.projectId && o.materialId === r.materialId,
        )
        .reduce((n, o) => n + o.receivedQuantity, 0);
      return {
        ...next,
        materials: data.materials.map((m) =>
          m.id === r.materialId
            ? { ...m, status: received >= m.quantity ? "On site" : "Ordered" }
            : m,
        ),
      };
    }
    return next;
  }
  if (key === "snags") {
    const r = record as Snag;
    if (!previous) {
      if (r.authorId !== member.id || r.status !== "Open")
        throw new Error("Create an open snag.");
    } else if (previous.status === "Open" && r.status === "Open") {
      if (!owner && previous.authorId !== member.id)
        throw new Error("Only the author or owner can edit this snag.");
    } else if (previous.status === "Open" && r.status === "Ready for check") {
      if (client || !r.resolution.trim())
        throw new Error("The team must describe the repair.");
    } else if (
      previous.status === "Ready for check" &&
      r.status === "Resolved"
    ) {
      if (!owner && !(client && previous.authorId === member.id))
        throw new Error(
          "Only the owner or reporting client can verify this repair.",
        );
    } else throw new Error("This snag has already changed. Refresh and retry.");
    if (client && !r.clientVisible)
      throw new Error("Client snags must be shared.");
  }
  if (key === "handovers") {
    const r = record as Handover;
    if (previous?.completed) throw new Error("Handover is already complete.");
    if (
      r.completed &&
      !canFinishHandover(
        (data.snags || []).filter((s) => s.projectId === r.projectId),
        r.checks,
      )
    )
      throw new Error("Resolve snags and complete the checklist first.");
  }
  if (key === "drawingHeads")
    throw new Error("Drawing versions are managed automatically.");
  return put(record);
}
