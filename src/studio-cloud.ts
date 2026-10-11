import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
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
} from "./studio-model";
import { developmentConfig } from "./firebase-development";

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
  if (["apiKey", "authDomain", "projectId", "appId"].some(
    key => config[key] !== developmentConfig[key as keyof typeof developmentConfig],
  )) throw new Error("This development release connects only to Interior Que Development. Production connections require a separately tested release.");
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
if (getApps().some(app => app.name === "interior-que-company"))
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
  if (owner) {
    for (const key of [
      "tasks",
      "materials",
      "updates",
      "approvals",
      "files",
      "invites",
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
      ? ["updates", "approvals", "files"]
      : ["tasks", "materials", "updates", "approvals", "files"]) as (
      | "tasks"
      | "materials"
      | "updates"
      | "approvals"
      | "files"
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
  | "projects"
  | "members"
  | "tasks"
  | "materials"
  | "updates"
  | "approvals"
  | "files"
  | "payments"
  | "invites";
export async function saveRecord(
  companyId: string,
  key: RecordCollection,
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
  key: RecordCollection,
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
