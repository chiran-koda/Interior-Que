import {
  initializeApp,
  getApp,
  getApps,
  type FirebaseOptions,
} from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
  writeBatch,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import {
  newStudio,
  type StudioData,
  type StudioMember,
  type StudioInvite,
  type StudioProject,
  type StudioTask,
  type StudioPayment,
} from "./studio-model";
import {
  drawingGroup,
  type Drawing,
  type DrawingHead,
  type PurchaseOrder,
  type OperationCollection,
} from "./project-operations";
import { developmentConfig } from "./firebase-development";
import {
  chatActionId,
  type ChatMessage,
  type ChatAction,
  type ChatActionKind,
  type ChatWorkRecord,
  type CollaborationCollection,
} from "./collaboration";

export interface CloudConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}
export function parseCloudConfig(raw: string): CloudConfig {
  const config = JSON.parse(raw);
  if (
    !config ||
    ["apiKey", "authDomain", "projectId", "appId"].some(
      (key) => typeof config[key] !== "string" || !config[key].trim(),
    )
  )
    throw new Error(
      "Paste the Firebase web app configuration, including apiKey, authDomain, projectId and appId.",
    );
  if (
    !/^[\w.-]+$/.test(config.authDomain) ||
    !/^[a-z0-9-]+$/.test(config.projectId)
  )
    throw new Error(
      "The Firebase project ID or authentication domain is invalid.",
    );
  if (
    ["apiKey", "authDomain", "projectId", "appId"].some(
      (key) =>
        config[key] !==
        developmentConfig[key as keyof typeof developmentConfig],
    )
  )
    throw new Error(
      "This development release connects only to Interior Que Development. Production connections require a separately tested release.",
    );
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
  };
}
export function savedCloudConfig() {
  try {
    return parseCloudConfig(
      localStorage.getItem("iq-firebase-config") ||
        import.meta.env.VITE_FIREBASE_CONFIG ||
        JSON.stringify(developmentConfig),
    );
  } catch {
    return null;
  }
}
let db: Firestore;
// Keep the local preview working when this module is refreshed during development.
if (getApps().some((app) => app.name === "interior-que-company"))
  db = getFirestore(getApp("interior-que-company"));
export function startCloud(config: CloudConfig) {
  const app = initializeApp(config, "interior-que-company");
  db = getFirestore(app);
  return getAuth(app);
}
export { onAuthStateChanged, signOut };
export type { User };
export const login = (auth: ReturnType<typeof getAuth>) =>
  signInWithPopup(auth, new GoogleAuthProvider());
export const cloudDb = () => db;
export const currentUser = () =>
  getAuth(getApp("interior-que-company")).currentUser;
const base = (id: string) => `interiorQueCompanies/${id}`;
export async function createStudio(user: User, name: string) {
  if (!user.emailVerified)
    throw new Error("Use a verified Google account to create your studio.");
  const id = crypto.randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, base(id)), { name, ownerId: user.uid });
  batch.set(doc(db, base(id), "members", user.uid), {
    name: user.displayName || "Owner",
    email: user.email?.toLowerCase() || "",
    role: "owner",
    projectIds: [],
    active: true,
  });
  await batch.commit();
  return id;
}
export async function joinStudio(user: User, id: string) {
  if (!user.emailVerified || !user.email)
    throw new Error(
      "Sign in with the verified Google account named in your invitation.",
    );
  const invite = await getDoc(
    doc(db, base(id), "invites", user.email.toLowerCase()),
  );
  if (!invite.exists() || invite.data().status !== "Pending")
    throw new Error(
      "No pending invitation was found for this account. Ask your owner for access.",
    );
  const data = invite.data() as StudioInvite;
  const batch = writeBatch(db);
  batch.set(doc(db, base(id), "members", user.uid), {
    name: data.name,
    email: data.email,
    role: data.role,
    projectIds: data.projectIds,
    active: true,
  });
  batch.update(invite.ref, { status: "Accepted" });
  await batch.commit();
  return id;
}
export function watchMembership(
  id: string,
  uid: string,
  callback: (member: StudioMember | null) => void,
  error: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, base(id), "members", uid),
    (snapshot) =>
      callback(
        snapshot.exists()
          ? ({ ...snapshot.data(), id: uid } as StudioMember)
          : null,
      ),
    error,
  );
}
export function watchStudio(
  id: string,
  member: StudioMember,
  callback: (data: StudioData) => void,
  error: (error: Error) => void,
) {
  let data = newStudio(id, "Your studio");
  const stops: Unsubscribe[] = [];
  const emit = () => callback({ ...data });
  stops.push(
    onSnapshot(
      doc(db, base(id)),
      (snapshot) => {
        if (snapshot.exists()) {
          data.name = snapshot.data().name;
          emit();
        }
      },
      error,
    ),
  );
  const root = base(id),
    client = member.role === "client",
    owner = member.role === "owner",
    ids = member.projectIds;
  const listen = (
    key: keyof Pick<
      StudioData,
      | "projects"
      | "members"
      | "tasks"
      | "materials"
      | "updates"
      | "approvals"
      | "files"
      | "invites"
      | "moneyCategories"
      | "cashOpenings"
      | "balanceOpenings"
      | OperationCollection
      | "listValues"
      | "notifications"
      | "inboxReads"
    >,
    filters: any[] = [],
  ) => {
    stops.push(
      onSnapshot(
        query(collection(db, root, key), ...filters),
        (snapshot) => {
          (data[key] as any[]) = snapshot.docs.map((d) => ({
            ...d.data(),
            id: d.id,
            ...(key === "notifications"
              ? { createdAt: d.data().createdAt?.toMillis?.() || 0 }
              : {}),
          }));
          emit();
        },
        error,
      ),
    );
  };
  if (owner) listen("projects");
  else if (ids.length) listen("projects", [where(documentId(), "in", ids)]);
  if (client) data.members = [member];
  else listen("members");
  listen(
    "listValues",
    client ? [where("category", "in", ["rooms", "finishes"])] : [],
  );
  listen("inboxReads", [where("userId", "==", member.id)]);
  if (owner || ids.length)
    listen("notifications", [
      where("recipientId", "==", member.id),
      ...(!owner ? [where("projectId", "in", ids)] : []),
      ...(client ? [where("clientVisible", "==", true)] : []),
      orderBy("createdAt", "desc"),
      limit(100),
    ]);
  if (owner) {
    for (const key of [
      "tasks",
      "materials",
      "updates",
      "approvals",
      "files",
      "invites",
      "moneyCategories",
      "cashOpenings",
      "balanceOpenings",
      "projectBudgets",
      "paymentSchedules",
      "selections",
      "changeOrders",
      "drawings",
      "drawingHeads",
      "purchaseOrders",
      "snags",
      "handovers",
    ] as const)
      listen(key);
    let expenses: any[] = [],
      receipts: any[] = [];
    for (const key of ["expenses", "receipts"] as const)
      stops.push(
        onSnapshot(
          collection(db, root, key),
          (snapshot) => {
            const records = snapshot.docs.map((d) => ({
              ...d.data(),
              id: d.id,
            }));
            if (key === "expenses") expenses = records;
            else receipts = records;
            data.payments = [...expenses, ...receipts];
            emit();
          },
          error,
        ),
      );
  } else if (ids.length) {
    for (const key of (client
      ? [
          "selections",
          "changeOrders",
          "drawings",
          "drawingHeads",
          "snags",
          "handovers",
          "paymentSchedules",
        ]
      : [
          "selections",
          "drawings",
          "drawingHeads",
          "purchaseOrders",
          "snags",
          "handovers",
        ]) as OperationCollection[])
      listen(key, [
        where("projectId", "in", ids),
        ...(client ? [where("clientVisible", "==", true)] : []),
      ]);
    for (const key of (client
      ? ["updates", "approvals", "files"]
      : ["tasks", "materials", "updates", "approvals", "files"]) as (
      "tasks" | "materials" | "updates" | "approvals" | "files"
    )[])
      listen(key, [
        where("projectId", "in", ids),
        ...(client ? [where("clientVisible", "==", true)] : []),
      ]);
  }
  emit();
  return () => stops.forEach((stop) => stop());
}
type RecordCollection =
  | CollaborationCollection
  | "projects"
  | "members"
  | "tasks"
  | "materials"
  | "updates"
  | "approvals"
  | "files"
  | "payments"
  | "invites";
// Owner-only financial configuration uses dedicated collections.
type FinancialCollection =
  "moneyCategories" | "cashOpenings" | "balanceOpenings" | OperationCollection;
export async function saveRecord(
  companyId: string,
  key: RecordCollection | FinancialCollection,
  record: { id: string; [key: string]: any },
) {
  const { id, ...data } = record;
  await setDoc(
    doc(
      db,
      base(companyId),
      key === "payments"
        ? record.type === "Spent"
          ? "expenses"
          : "receipts"
        : key,
      id,
    ),
    data,
  );
}
export async function patchRecord(
  companyId: string,
  key: RecordCollection | FinancialCollection,
  id: string,
  changes: Record<string, unknown>,
) {
  await updateDoc(doc(db, base(companyId), key, id), changes);
}
export async function createProject(
  companyId: string,
  project: StudioProject,
  tasks: StudioTask[],
) {
  const batch = writeBatch(db);
  const { id, ...data } = project;
  batch.set(doc(db, base(companyId), "projects", id), data);
  for (const task of tasks) {
    const { id, ...data } = task;
    batch.set(doc(db, base(companyId), "tasks", id), data);
  }
  await batch.commit();
}
const chatRecord = (snapshot: any): ChatMessage => {
  const fields = snapshot.data();
  return {
    ...fields,
    id: snapshot.id,
    createdAt: fields.createdAt?.toMillis?.() || 0,
  };
};
export function watchConversation(
  company: string,
  project: string,
  shared: boolean,
  onData: (messages: ChatMessage[], actions: ChatAction[]) => void,
  onError: (e: Error) => void,
) {
  let messages: ChatMessage[] = [],
    actions: ChatAction[] = [];
  const filters = [
    where("projectId", "==", project),
    where("clientVisible", "==", shared),
  ];
  const stops = [
    onSnapshot(
      query(
        collection(db, base(company), "chatMessages"),
        ...filters,
        orderBy("createdAt", "desc"),
        orderBy(documentId(), "desc"),
        limit(50),
      ),
      (snapshot) => {
        messages = snapshot.docs.map(chatRecord).reverse();
        onData(messages, actions);
      },
      onError,
    ),
    onSnapshot(
      query(
        collection(db, base(company), "chatActions"),
        ...filters,
        orderBy("createdAt", "desc"),
        limit(200),
      ),
      (snapshot) => {
        actions = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as ChatAction[];
        onData(messages, actions);
      },
      onError,
    ),
  ];
  return () => stops.forEach((stop) => stop());
}
export async function olderConversation(
  company: string,
  project: string,
  shared: boolean,
  before: ChatMessage,
) {
  const snapshot = await getDocs(
    query(
      collection(db, base(company), "chatMessages"),
      where("projectId", "==", project),
      where("clientVisible", "==", shared),
      orderBy("createdAt", "desc"),
      orderBy(documentId(), "desc"),
      startAfter(Timestamp.fromMillis(before.createdAt), before.id),
      limit(50),
    ),
  );
  return snapshot.docs.map(chatRecord).reverse();
}
export async function mentionedMessage(company: string, messageId: string) {
  const snapshot = await getDoc(
    doc(db, base(company), "chatMessages", messageId),
  );
  return snapshot.exists() ? chatRecord(snapshot) : null;
}
export async function sendMessage(company: string, message: ChatMessage) {
  const existing = await getDoc(
    doc(db, base(company), "chatMessages", message.id),
  );
  if (existing.exists()) {
    if (
      existing.data().authorId === message.authorId &&
      existing.data().body === message.body &&
      existing.data().projectId === message.projectId &&
      existing.data().clientVisible === message.clientVisible
    )
      return;
    throw new Error(
      "An earlier version of this message was already delivered. Reopen the conversation before sending a new message.",
    );
  }
  const batch = writeBatch(db),
    { id, ...record } = message;
  batch.set(doc(db, base(company), "chatMessages", id), {
    ...record,
    createdAt: serverTimestamp(),
  });
  for (const recipientId of message.mentions.filter(
    (id) => id !== message.authorId,
  ))
    batch.set(doc(db, base(company), "notifications", `${id}_${recipientId}`), {
      projectId: message.projectId,
      messageId: id,
      recipientId,
      authorId: message.authorId,
      authorName: message.authorName,
      createdAt: serverTimestamp(),
      clientVisible: message.clientVisible,
      read: false,
    });
  await batch.commit();
}
export async function convertMessage(
  company: string,
  message: ChatMessage,
  kind: ChatActionKind,
  record: ChatWorkRecord,
  authorId: string,
) {
  const actionId = chatActionId(message.id, kind),
    actionRef = doc(db, base(company), "chatActions", actionId),
    key = kind === "task" ? "tasks" : kind === "snag" ? "snags" : "approvals";
  await runTransaction(db, async (tx) => {
    const original = await tx.get(
        doc(db, base(company), "chatMessages", message.id),
      ),
      existing = await tx.get(actionRef);
    if (!original.exists() || existing.exists())
      throw new Error(
        "This message already has that linked item, or is no longer available.",
      );
    if (
      original.data().projectId !== record.projectId ||
      record.id !== actionId
    )
      throw new Error("The linked item must stay in this project.");
    const projectRef = doc(db, base(company), "projects", record.projectId);
    let progress: number | undefined;
    if (kind === "task") {
      await tx.get(projectRef);
      const tasks = await getDocs(
        query(
          collection(db, base(company), "tasks"),
          where("projectId", "==", record.projectId),
        ),
      );
      const records = await Promise.all(tasks.docs.map((d) => tx.get(d.ref)));
      progress = Math.round(
        (records.filter((s) => s.data()?.status === "Done").length /
          (records.length + 1)) *
          100,
      );
    }
    const { id, ...fields } = record;
    tx.set(doc(db, base(company), key, id), fields);
    tx.set(actionRef, {
      messageId: message.id,
      projectId: record.projectId,
      kind,
      recordId: id,
      authorId,
      clientVisible: original.data().clientVisible,
      createdAt: serverTimestamp(),
    });
    if (progress !== undefined)
      tx.update(projectRef, {
        progress,
        status:
          progress === 100
            ? "Completed"
            : progress > 0
              ? "In progress"
              : "Planning",
      });
  });
}
export async function createDrawing(company: string, drawing: Drawing) {
  const groupId = drawingGroup(drawing.room, drawing.title);
  const headRef = doc(
    db,
    base(company),
    "drawingHeads",
    `${drawing.projectId}_${groupId}`,
  );
  await runTransaction(db, async (tx) => {
    const head = (await tx.get(headRef)).data();
    const version = (head?.nextVersion || 0) + 1;
    const { id, ...record } = drawing;
    tx.set(doc(db, base(company), "drawings", id), {
      ...record,
      groupId,
      version,
      status: "Draft",
      clientVisible: false,
    });
    tx.set(headRef, {
      projectId: drawing.projectId,
      groupId,
      nextVersion: version,
      currentId: head?.currentId || "",
      clientVisible: head?.clientVisible || false,
    });
  });
}
export async function approveDrawing(company: string, drawing: Drawing) {
  const headRef = doc(
    db,
    base(company),
    "drawingHeads",
    `${drawing.projectId}_${drawing.groupId}`,
  );
  const drawingRef = doc(db, base(company), "drawings", drawing.id);
  await runTransaction(db, async (tx) => {
    const head = (await tx.get(headRef)).data() as DrawingHead | undefined;
    const current = (await tx.get(drawingRef)).data();
    if (!head || current?.status !== "Draft")
      throw new Error("This drawing is no longer awaiting approval.");
    const previousRef = head.currentId
      ? doc(db, base(company), "drawings", head.currentId)
      : null;
    if (previousRef) await tx.get(previousRef);
    if (previousRef) tx.update(previousRef, { status: "Superseded" });
    tx.update(drawingRef, {
      status: "Approved",
      clientVisible: drawing.clientVisible,
    });
    tx.update(headRef, {
      currentId: drawing.id,
      clientVisible: drawing.clientVisible,
    });
  });
}
export async function saveOrder(company: string, order: PurchaseOrder) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, base(company), "purchaseOrders", order.id);
    const existing = await tx.get(ref);
    const materialRef = order.materialId
      ? doc(db, base(company), "materials", order.materialId)
      : null;
    const material = materialRef ? await tx.get(materialRef) : null;
    if (material && material.data()?.projectId !== order.projectId)
      throw new Error("Choose a material from this project.");
    const related = materialRef
      ? await getDocs(
          query(
            collection(db, base(company), "purchaseOrders"),
            where("projectId", "==", order.projectId),
          ),
        )
      : null;
    const snapshots = related
      ? await Promise.all(
          related.docs
            .filter((d) => d.id !== order.id)
            .map((d) => tx.get(d.ref)),
        )
      : [];
    const received = snapshots
      .filter((s) => s.data()?.materialId === order.materialId)
      .reduce(
        (n, s) => n + Number(s.data()?.receivedQuantity || 0),
        order.receivedQuantity,
      );
    const { id, ...record } = order;
    if (existing.exists())
      tx.update(ref, { receivedQuantity: order.receivedQuantity });
    else tx.set(ref, record);
    if (materialRef)
      tx.update(materialRef, {
        status:
          received >= Number(material?.data()?.quantity)
            ? "On site"
            : "Ordered",
      });
  });
}
export async function decideOperation(
  company: string,
  key: "selections" | "changeOrders",
  record: { id: string; status: string; response: string },
  reviewerId: string,
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, base(company), key, record.id),
      snapshot = await tx.get(ref);
    if (
      snapshot.data()?.status !== "Awaiting decision" ||
      snapshot.data()?.reviewerId !== reviewerId
    )
      throw new Error("This item is no longer awaiting your decision.");
    tx.update(ref, { status: record.status, response: record.response });
  });
}
export async function savePaymentSchedule(
  company: string,
  record: import("./project-operations").PaymentSchedule,
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, base(company), "paymentSchedules", record.id),
      snapshot = await tx.get(ref);
    const { id, ...fields } = record;
    tx.set(ref, { ...fields, received: snapshot.data()?.received || 0 });
  });
}
export async function saveProjectPayment(
  company: string,
  payment: StudioPayment,
) {
  const journal = payment.type === "Spent" ? "expenses" : "receipts";
  await runTransaction(db, async (tx) => {
    const ref = doc(db, base(company), journal, payment.id);
    const previous = (await tx.get(ref)).data() as StudioPayment | undefined;
    const ids = [
      ...new Set([previous?.milestoneId, payment.milestoneId].filter(Boolean)),
    ] as string[];
    const linked = await Promise.all(
      ids.map((id) => tx.get(doc(db, base(company), "paymentSchedules", id))),
    );
    for (const snapshot of linked) {
      const milestone = snapshot.data();
      if (
        !milestone ||
        milestone.projectId !== payment.projectId ||
        payment.type !== "Received"
      )
        throw new Error("Choose a payment milestone from this project.");
      const before =
        previous?.milestoneId === snapshot.id
          ? Math.round(previous.amount * 100)
          : 0;
      const after =
        payment.milestoneId === snapshot.id
          ? Math.round(payment.amount * 100)
          : 0;
      tx.update(snapshot.ref, {
        received:
          Math.max(0, Math.round(milestone.received * 100) + after - before) /
          100,
      });
    }
    const { id, ...record } = payment;
    tx.set(ref, record);
  });
}
export async function decideApproval(
  companyId: string,
  id: string,
  status: "Approved" | "Changes requested",
  response: string,
  reviewerId: string,
) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, base(companyId), "approvals", id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== "Awaiting decision")
      throw new Error(
        "This decision has already been recorded. Refresh to see the latest version.",
      );
    if (snapshot.data().reviewerId !== reviewerId)
      throw new Error("Only the person asked to review this item can decide.");
    transaction.update(ref, { status, response });
  });
}
export async function setTaskStatus(
  companyId: string,
  task: StudioTask,
  status: StudioTask["status"],
) {
  await runTransaction(db, async (transaction) => {
    const project = doc(db, base(companyId), "projects", task.projectId);
    await transaction.get(project);
    const tasks = await getDocs(
      query(
        collection(db, base(companyId), "tasks"),
        where("projectId", "==", task.projectId),
      ),
    );
    const snapshots = await Promise.all(
      tasks.docs.map((d) => transaction.get(d.ref)),
    );
    const completed = snapshots.filter((s) =>
      s.id === task.id ? status === "Done" : s.data()?.status === "Done",
    ).length;
    const progress = snapshots.length
      ? Math.round((completed / snapshots.length) * 100)
      : 0;
    transaction.update(doc(db, base(companyId), "tasks", task.id), { status });
    transaction.update(project, {
      progress,
      status: progress === 100 ? "Completed" : "In progress",
    });
  });
}
export async function saveTask(companyId: string, task: StudioTask) {
  await runTransaction(db, async (transaction) => {
    const project = doc(db, base(companyId), "projects", task.projectId);
    await transaction.get(project);
    const tasks = await getDocs(
      query(
        collection(db, base(companyId), "tasks"),
        where("projectId", "==", task.projectId),
      ),
    );
    const snapshots = await Promise.all(
      tasks.docs.map((d) => transaction.get(d.ref)),
    );
    const other = snapshots.filter((s) => s.id !== task.id);
    const completed =
      other.filter((s) => s.data()?.status === "Done").length +
      (task.status === "Done" ? 1 : 0);
    const progress = Math.round((completed / (other.length + 1)) * 100);
    const { id, ...record } = task;
    transaction.set(doc(db, base(companyId), "tasks", id), record);
    transaction.update(project, {
      progress,
      status:
        progress === 100
          ? "Completed"
          : progress > 0
            ? "In progress"
            : "Planning",
    });
  });
}
