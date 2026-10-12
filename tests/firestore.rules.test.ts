import { readFileSync } from "node:fs";
import "firebase/compat/firestore";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  writeBatch,
  getDocs,
  collection,
  query,
  where,
  documentId,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const root = "interiorQueCompanies/studio";
const member = (id: string, role: string, projects = ["p1"]) => ({
  name: id,
  email: `${id}@example.com`,
  role,
  projectIds: projects,
  active: true,
});
describe("Chat, notifications and company choices", () => {
  const message = (shared = false) => ({
    projectId: "p1",
    authorId: "supervisor",
    authorName: "supervisor",
    body: "Check delivery",
    createdAt: serverTimestamp(),
    clientVisible: shared,
    replyTo: "",
    mentions: [],
    photoIds: [],
  });
  it("allows shared project chat for clients while keeping internal conversations private", async () => {
    await assertSucceeds(
      setDoc(ref(db("supervisor"), "chatMessages/internal"), message()),
    );
    await assertSucceeds(
      setDoc(ref(db("supervisor"), "chatMessages/shared"), message(true)),
    );
    await assertFails(getDoc(ref(db("client"), "chatMessages/internal")));
    await assertSucceeds(getDoc(ref(db("client"), "chatMessages/shared")));
    await assertFails(getDoc(ref(db("outsider"), "chatMessages/shared")));
    await assertFails(
      setDoc(ref(db("client"), "chatMessages/client-internal"), {
        ...message(),
        authorId: "client",
        authorName: "client",
      }),
    );
    await assertSucceeds(
      setDoc(ref(db("client"), "chatMessages/client-public"), {
        ...message(true),
        authorId: "client",
        authorName: "client",
      }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "chatMessages/internal"), {
        clientVisible: true,
      }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "chatMessages"),
          where("projectId", "==", "p1"),
          where("clientVisible", "==", true),
          orderBy("createdAt", "desc"),
          orderBy(documentId(), "desc"),
          limit(50),
        ),
      ),
    );
  });
  it("blocks impersonation, backdated messages, cross-channel replies and unavailable mentions", async () => {
    const d = db("supervisor");
    await setDoc(ref(d, "chatMessages/internal"), message());
    await assertFails(
      setDoc(ref(d, "chatMessages/forged"), {
        ...message(),
        authorName: "owner",
      }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/date"), { ...message(), createdAt: 1 }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/reply"), {
        ...message(true),
        replyTo: "internal",
      }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/mention"), {
        ...message(),
        mentions: ["outsider"],
      }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/mention"), {
        ...message(),
        mentions: ["client"],
      }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/mention"), {
        ...message(),
        mentions: ["designer", "designer"],
      }),
    );
    await assertFails(
      setDoc(ref(d, "chatMessages/blank"), { ...message(), body: "" }),
    );
  });
  it("creates mention notices only alongside a valid message and keeps reads private", async () => {
    const d = db("supervisor"),
      b = writeBatch(d),
      notice = {
        projectId: "p1",
        messageId: "mention",
        recipientId: "designer",
        authorId: "supervisor",
        authorName: "supervisor",
        createdAt: serverTimestamp(),
        clientVisible: false,
        read: false,
      };
    b.set(ref(d, "chatMessages/mention"), {
      ...message(),
      mentions: ["designer"],
    });
    b.set(ref(d, "notifications/mention_designer"), notice);
    await assertSucceeds(b.commit());
    await assertSucceeds(
      getDoc(ref(db("designer"), "notifications/mention_designer")),
    );
    await assertFails(
      getDoc(ref(db("owner"), "notifications/mention_designer")),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "notifications/mention_designer"), {
        read: true,
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("designer"), "notifications/mention_designer"), {
        read: true,
      }),
    );
    await assertFails(
      updateDoc(ref(db("designer"), "notifications/mention_designer"), {
        authorName: "different",
      }),
    );
    await assertFails(
      setDoc(ref(d, "notifications/mention_client"), {
        ...notice,
        recipientId: "client",
      }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("designer"), root, "notifications"),
          where("recipientId", "==", "designer"),
          where("projectId", "in", ["p1"]),
        ),
      ),
    );
  });
  it("rejects private, missing and cross-project photo attachments in shared chat", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      await setDoc(ref(d, "files/private"), {
        projectId: "p1",
        clientVisible: false,
      });
      await setDoc(ref(d, "files/other"), {
        projectId: "p2",
        clientVisible: true,
      });
    });
    for (const photoId of ["private", "other", "missing", ""]) {
      await assertFails(
        setDoc(
          ref(db("supervisor"), "chatMessages/photo-" + (photoId || "blank")),
          { ...message(true), photoIds: [photoId] },
        ),
      );
    }
    await assertSucceeds(
      setDoc(ref(db("supervisor"), "chatMessages/private-attachment"), {
        ...message(),
        photoIds: ["private"],
      }),
    );
  });
  it("supports five mentions, two photos and a reply within rule access limits", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      for (let i = 0; i < 5; i++)
        await setDoc(
          ref(d, `members/team${i}`),
          member(`team${i}`, "designer"),
        );
      for (const id of ["photo1", "photo2"])
        await setDoc(ref(d, `files/${id}`), {
          projectId: "p1",
          clientVisible: true,
        });
    });
    const d = db("supervisor");
    await setDoc(ref(d, "chatMessages/parent"), message(true));
    const b = writeBatch(d);
    b.set(ref(d, "chatMessages/full"), {
      ...message(true),
      replyTo: "parent",
      mentions: Array.from({ length: 5 }, (_, i) => `team${i}`),
      photoIds: ["photo1", "photo2"],
    });
    for (let i = 0; i < 5; i++)
      b.set(ref(d, `notifications/full_team${i}`), {
        projectId: "p1",
        messageId: "full",
        recipientId: `team${i}`,
        authorId: "supervisor",
        authorName: "supervisor",
        createdAt: serverTimestamp(),
        clientVisible: true,
        read: false,
      });
    await assertSucceeds(b.commit());
    await assertFails(
      setDoc(ref(d, "chatMessages/overlimit"), {
        ...message(true),
        mentions: Array.from({ length: 6 }, (_, i) => `team${i}`),
      }),
    );
  });
  it("links work atomically to a message and prevents retargeting or client assignment", async () => {
    const d = db("supervisor");
    await setDoc(ref(d, "chatMessages/work"), message());
    const action = {
      messageId: "work",
      projectId: "p1",
      kind: "task",
      recordId: "work_task",
      createdAt: serverTimestamp(),
      authorId: "supervisor",
      clientVisible: false,
    };
    await assertFails(setDoc(ref(d, "chatActions/work_task"), action));
    const batch = writeBatch(d);
    batch.set(ref(d, "tasks/work_task"), { ...task, title: "Follow delivery" });
    batch.set(ref(d, "chatActions/work_task"), action);
    await assertSucceeds(batch.commit());
    await assertFails(
      updateDoc(ref(d, "chatActions/work_task"), { recordId: "task" }),
    );
    await assertFails(
      setDoc(ref(db("client"), "chatActions/work_task"), {
        ...action,
        authorId: "client",
      }),
    );
    await assertFails(getDoc(ref(db("client"), "chatActions/work_task")));
  });
  it("protects company lists and lets only owners archive or rename choices", async () => {
    const entry = { category: "rooms", value: "Study", active: true };
    await assertSucceeds(
      setDoc(ref(db("designer"), "listValues/study"), entry),
    );
    await assertSucceeds(getDoc(ref(db("client"), "listValues/study")));
    await assertFails(
      updateDoc(ref(db("designer"), "listValues/study"), { value: "Other" }),
    );
    await assertFails(
      updateDoc(ref(db("designer"), "listValues/study"), { active: false }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "listValues/study"), { active: false }),
    );
    await assertFails(
      updateDoc(ref(db("designer"), "listValues/study"), { active: true }),
    );
    await assertSucceeds(
      setDoc(ref(db("owner"), "listValues/supplier"), {
        ...entry,
        category: "suppliers",
        value: "Vendor",
      }),
    );
    await assertFails(getDoc(ref(db("client"), "listValues/supplier")));
    await assertFails(setDoc(ref(db("client"), "listValues/client"), entry));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "listValues"),
          where("category", "in", ["rooms", "finishes"]),
        ),
      ),
    );
  });
  it("keeps inbox read states per user and blocks every client from AI counters", async () => {
    await assertSucceeds(
      setDoc(ref(db("designer"), "inboxReads/designer"), {
        userId: "designer",
        keys: ["task:a"],
      }),
    );
    await assertFails(getDoc(ref(db("owner"), "inboxReads/designer")));
    await assertFails(
      setDoc(ref(db("designer"), "inboxReads/owner"), {
        userId: "owner",
        keys: [],
      }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("designer"), root, "inboxReads"),
          where("userId", "==", "designer"),
        ),
      ),
    );
    for (const id of ["owner", "designer", "supervisor", "client"]) {
      await assertFails(getDoc(ref(db(id), "aiPrivateUsage/current")));
      await assertFails(
        setDoc(ref(db(id), "aiPrivateUsage/current"), { count: 0 }),
      );
    }
  });
});

describe("Interior firm project tools", () => {
  const budget = {
    projectId: "p1",
    contractValue: 1000,
    costBudget: 700,
    quotationRef: "Q1",
  };
  const schedule = {
    projectId: "p1",
    title: "Advance",
    amount: 300,
    received: 0,
    due: "2026-10-15",
    clientVisible: true,
  };
  const selection = {
    projectId: "p1",
    room: "Kitchen",
    title: "Finish",
    specification: "Oak",
    photoId: "",
    authorId: "designer",
    reviewerId: "client",
    due: "2026-10-15",
    status: "Awaiting decision",
    response: "",
    clientVisible: true,
  };
  const extra = {
    projectId: "p1",
    title: "Extra cabinet",
    description: "Storage",
    amount: 100,
    extraDays: 2,
    authorId: "owner",
    reviewerId: "client",
    due: "2026-10-15",
    status: "Awaiting decision",
    response: "",
    clientVisible: true,
  };
  const drawing = {
    projectId: "p1",
    groupId: "layout",
    title: "Layout",
    room: "Kitchen",
    url: "https://example.com/layout.pdf",
    version: 1,
    authorId: "designer",
    date: "2026-10-12",
    status: "Draft",
    clientVisible: false,
  };
  const head = {
    projectId: "p1",
    groupId: "layout",
    nextVersion: 1,
    currentId: "",
    clientVisible: false,
  };
  const order = {
    projectId: "p1",
    materialId: "",
    title: "Plywood",
    supplier: "Supplier",
    quantity: 20,
    receivedQuantity: 0,
    unit: "Sheets",
    unitRate: 100,
    due: "2026-10-15",
    notes: "",
    authorId: "designer",
  };
  const snag = {
    projectId: "p1",
    title: "Loose handle",
    room: "Kitchen",
    description: "Tighten",
    photoId: "",
    authorId: "client",
    assigneeId: "",
    due: "2026-10-15",
    status: "Open",
    resolution: "",
    completionPhotoId: "",
    clientVisible: true,
  };
  const handover = {
    projectId: "p1",
    checks: [false, false, false, false, false],
    date: "2026-10-15",
    notes: "",
    completed: false,
    clientVisible: true,
  };
  const createDrawing = async (id = "v1", version = 1) => {
    const d = db("designer"),
      batch = writeBatch(d);
    batch.set(ref(d, `drawings/${id}`), { ...drawing, version });
    if (version === 1) batch.set(ref(d, "drawingHeads/p1_layout"), head);
    else
      batch.update(ref(d, "drawingHeads/p1_layout"), { nextVersion: version });
    await assertSucceeds(batch.commit());
  };
  const approveVersion = async (id: string, previous?: string) => {
    const d = db("owner"),
      batch = writeBatch(d);
    if (previous)
      batch.update(ref(d, `drawings/${previous}`), { status: "Superseded" });
    batch.update(ref(d, `drawings/${id}`), {
      status: "Approved",
      clientVisible: true,
    });
    batch.update(ref(d, "drawingHeads/p1_layout"), {
      currentId: id,
      clientVisible: true,
    });
    await assertSucceeds(batch.commit());
  };
  it("restricts budgets to owners and schedules to owners or assigned shared clients", async () => {
    await assertSucceeds(setDoc(ref(db("owner"), "projectBudgets/p1"), budget));
    await assertSucceeds(
      setDoc(ref(db("owner"), "paymentSchedules/m1"), schedule),
    );
    await assertSucceeds(getDoc(ref(db("client"), "paymentSchedules/m1")));
    for (const id of ["client", "designer", "supervisor", "outsider"]) {
      await assertFails(getDoc(ref(db(id), "projectBudgets/p1")));
      await assertFails(setDoc(ref(db(id), "projectBudgets/p1"), budget));
      await assertFails(
        updateDoc(ref(db(id), "paymentSchedules/m1"), { received: 100 }),
      );
    }
    await assertFails(getDoc(ref(db("designer"), "paymentSchedules/m1")));
    await assertFails(getDoc(ref(db("outsider"), "paymentSchedules/m1")));
    await assertFails(setDoc(ref(db("owner"), "projectBudgets/p2"), budget));
    await assertFails(
      setDoc(ref(db("owner"), "paymentSchedules/negative"), {
        ...schedule,
        amount: -10,
      }),
    );
    await assertSucceeds(
      setDoc(ref(db("owner"), "paymentSchedules/private"), {
        ...schedule,
        clientVisible: false,
      }),
    );
    await assertFails(getDoc(ref(db("client"), "paymentSchedules/private")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "paymentSchedules"),
          where("projectId", "in", ["p1"]),
          where("clientVisible", "==", true),
        ),
      ),
    );
  });
  it("links only receipts from the same project to milestones and keeps journal writes private", async () => {
    const d = db("owner");
    await setDoc(ref(d, "paymentSchedules/m1"), schedule);
    const receipt = {
      projectId: "p1",
      type: "Received",
      description: "Advance",
      amount: 100,
      date: "2026-10-12",
      milestoneId: "m1",
    };
    const batch = writeBatch(d);
    batch.set(ref(d, "receipts/r1"), receipt);
    batch.update(ref(d, "paymentSchedules/m1"), { received: 100 });
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(ref(d, "expenses/e1"), { ...receipt, type: "Spent" }),
    );
    await assertFails(
      setDoc(ref(d, "receipts/r2"), { ...receipt, projectId: "p2" }),
    );
    await assertFails(
      setDoc(ref(d, "receipts/r2"), { ...receipt, milestoneId: "missing" }),
    );
    await assertFails(setDoc(ref(db("client"), "receipts/r2"), receipt));
    await assertFails(getDoc(ref(db("client"), "receipts/r1")));
  });
  it("allows only the assigned reviewer to make one immutable selection decision", async () => {
    await assertSucceeds(
      setDoc(ref(db("designer"), "selections/s1"), selection),
    );
    await assertSucceeds(getDoc(ref(db("client"), "selections/s1")));
    await assertFails(
      updateDoc(ref(db("owner"), "selections/s1"), { status: "Approved" }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "selections/s1"), {
        status: "Approved",
        specification: "Changed",
      }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "selections/s1"), {
        status: "Changes requested",
        response: "",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("client"), "selections/s1"), {
        status: "Changes requested",
        response: "Use walnut",
      }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "selections/s1"), { status: "Approved" }),
    );
    await assertFails(
      setDoc(ref(db("outsider"), "selections/s2"), {
        ...selection,
        authorId: "outsider",
      }),
    );
    await assertFails(
      setDoc(ref(db("designer"), "selections/s2"), {
        ...selection,
        clientVisible: false,
      }),
    );
    await assertFails(
      setDoc(ref(db("designer"), "selections/s2"), {
        ...selection,
        reviewerId: "outsider",
      }),
    );
    await assertFails(
      setDoc(ref(db("client"), "selections/s2"), {
        ...selection,
        authorId: "client",
      }),
    );
  });
  it("allows owner-created cost variations without revealing them to staff", async () => {
    await assertSucceeds(setDoc(ref(db("owner"), "changeOrders/c1"), extra));
    await assertFails(getDoc(ref(db("designer"), "changeOrders/c1")));
    await assertFails(
      setDoc(ref(db("designer"), "changeOrders/c2"), {
        ...extra,
        authorId: "designer",
      }),
    );
    await assertFails(
      setDoc(ref(db("owner"), "changeOrders/c2"), {
        ...extra,
        reviewerId: "designer",
      }),
    );
    await assertFails(
      setDoc(ref(db("owner"), "changeOrders/c2"), { ...extra, extraDays: 2.5 }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "changeOrders/c1"), {
        amount: 0,
        status: "Approved",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("client"), "changeOrders/c1"), { status: "Approved" }),
    );
  });
  it("blocks sharing private or cross-project photos through reports and selections", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(ref(c.firestore(), "files/private"), {
        projectId: "p1",
        clientVisible: false,
      });
      await setDoc(ref(c.firestore(), "files/public"), {
        projectId: "p1",
        clientVisible: true,
      });
      await setDoc(ref(c.firestore(), "files/other"), {
        projectId: "p2",
        clientVisible: true,
      });
    });
    const report = {
      projectId: "p1",
      authorId: "supervisor",
      authorName: "Supervisor",
      date: "2026-10-12",
      room: "Kitchen",
      summary: "Carpentry done",
      tomorrow: "Paint",
      shortages: "Handles",
      blocker: "",
      workers: 3,
      photoIds: ["public"],
      clientVisible: true,
    };
    await assertSucceeds(
      setDoc(ref(db("supervisor"), "updates/report"), report),
    );
    await assertSucceeds(getDoc(ref(db("client"), "updates/report")));
    for (const photoId of ["private", "other", "missing"]) {
      await assertFails(
        setDoc(ref(db("supervisor"), "updates/bad"), {
          ...report,
          photoIds: [photoId],
        }),
      );
      await assertFails(
        setDoc(ref(db("designer"), "selections/bad"), {
          ...selection,
          photoId,
        }),
      );
    }
    await assertFails(
      setDoc(ref(db("supervisor"), "updates/bad"), { ...report, workers: -1 }),
    );
    await assertFails(
      setDoc(ref(db("supervisor"), "updates/bad"), {
        ...report,
        photoIds: ["public", "public", "public", "public", "public"],
      }),
    );
    await assertSucceeds(
      setDoc(ref(db("supervisor"), "updates/internal-report"), {
        ...report,
        photoIds: ["private"],
        clientVisible: false,
      }),
    );
    await assertFails(getDoc(ref(db("client"), "updates/internal-report")));
  });
  it("allocates unique drawing versions atomically and publishes one approved version", async () => {
    await createDrawing();
    await assertFails(getDoc(ref(db("client"), "drawings/v1")));
    await assertFails(
      setDoc(ref(db("designer"), "drawings/duplicate"), drawing),
    );
    await assertFails(
      updateDoc(ref(db("designer"), "drawings/v1"), {
        status: "Approved",
        clientVisible: true,
      }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "drawings/v1"), {
        status: "Approved",
        clientVisible: true,
      }),
    );
    await approveVersion("v1");
    await assertSucceeds(getDoc(ref(db("client"), "drawings/v1")));
    await createDrawing("v2", 2);
    const ownerDatabase = db("owner"),
      invalid = writeBatch(ownerDatabase);
    invalid.update(ref(ownerDatabase, "drawings/v2"), {
      status: "Approved",
      clientVisible: true,
    });
    invalid.update(ref(ownerDatabase, "drawingHeads/p1_layout"), {
      currentId: "v2",
    });
    await assertFails(invalid.commit());
    await approveVersion("v2", "v1");
    expect((await getDoc(ref(db("owner"), "drawings/v1"))).data()?.status).toBe(
      "Superseded",
    );
    expect(
      (await getDoc(ref(db("owner"), "drawingHeads/p1_layout"))).data()
        ?.currentId,
    ).toBe("v2");
    await assertFails(
      updateDoc(ref(db("owner"), "drawings/v2"), {
        url: "https://example.com/changed.pdf",
      }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "drawings"),
          where("projectId", "in", ["p1"]),
          where("clientVisible", "==", true),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("supervisor"), root, "drawingHeads"),
          where("projectId", "in", ["p1"]),
        ),
      ),
    );
  });
  it("limits orders to assigned staff and deliveries to valid cumulative quantities", async () => {
    await assertSucceeds(
      setDoc(ref(db("designer"), "purchaseOrders/o1"), order),
    );
    await assertFails(
      setDoc(ref(db("supervisor"), "purchaseOrders/o2"), {
        ...order,
        authorId: "supervisor",
      }),
    );
    await assertFails(getDoc(ref(db("client"), "purchaseOrders/o1")));
    await assertFails(getDoc(ref(db("outsider"), "purchaseOrders/o1")));
    await assertSucceeds(
      updateDoc(ref(db("supervisor"), "purchaseOrders/o1"), {
        receivedQuantity: 10,
      }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "purchaseOrders/o1"), {
        receivedQuantity: 21,
      }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "purchaseOrders/o1"), {
        receivedQuantity: 9,
      }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "purchaseOrders/o1"), { unitRate: 0 }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "purchaseOrders/o1"), { receivedQuantity: 9 }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("supervisor"), root, "purchaseOrders"),
          where("projectId", "==", "p1"),
        ),
      ),
    );
  });
  it("requires team repair evidence and owner or reporting-client verification", async () => {
    await assertSucceeds(setDoc(ref(db("client"), "snags/s1"), snag));
    await assertFails(
      setDoc(ref(db("client"), "snags/s2"), { ...snag, clientVisible: false }),
    );
    await assertFails(
      setDoc(ref(db("client"), "snags/s2"), {
        ...snag,
        assigneeId: "designer",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "snags/s1"), { assigneeId: "supervisor" }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "snags/s1"), { status: "Resolved" }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "snags/s1"), {
        status: "Ready for check",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("supervisor"), "snags/s1"), {
        status: "Ready for check",
        resolution: "Handle tightened",
      }),
    );
    await assertFails(
      updateDoc(ref(db("supervisor"), "snags/s1"), { status: "Resolved" }),
    );
    await assertSucceeds(
      updateDoc(ref(db("client"), "snags/s1"), { status: "Resolved" }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "snags/s1"), { status: "Open" }),
    );
  });
  it("keeps handover finalization owner-only, requires every check and locks completion", async () => {
    await assertFails(setDoc(ref(db("supervisor"), "handovers/p1"), handover));
    await assertSucceeds(setDoc(ref(db("owner"), "handovers/p1"), handover));
    await assertSucceeds(getDoc(ref(db("client"), "handovers/p1")));
    await assertFails(
      updateDoc(ref(db("owner"), "handovers/p1"), { completed: true }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "handovers/p1"), {
        completed: true,
        checks: [true, true, true, true, true],
      }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "handovers/p1"), { completed: false }),
    );
    await assertFails(getDoc(ref(db("outsider"), "handovers/p1")));
  });
});

describe("Owner financial journals and configuration", () => {
  const expense = {
    projectId: "p1",
    description: "Materials",
    amount: 12.5,
    type: "Spent",
    date: "2026-10-12",
    mode: "Cash",
    categoryId: "exp-materials",
  };
  const category = {
    name: "Custom expenses",
    type: "Spent",
    color: "#4f46e5",
    active: true,
  };
  const opening = { projectId: "p1", amount: 1000, date: "2026-10-01" };
  it("keeps combined openings private and separate from legacy cash balances", async () => {
    const ownerDb = db("owner");
    await assertSucceeds(setDoc(ref(ownerDb, "cashOpenings/p1"), opening));
    await assertSucceeds(
      setDoc(ref(ownerDb, "balanceOpenings/p1"), { ...opening, amount: 2000 }),
    );
    expect((await getDoc(ref(ownerDb, "cashOpenings/p1"))).data()?.amount).toBe(
      1000,
    );
    expect(
      (await getDoc(ref(ownerDb, "balanceOpenings/p1"))).data()?.amount,
    ).toBe(2000);
    for (const id of ["client", "designer", "supervisor", "outsider"]) {
      await assertFails(getDoc(ref(db(id), "balanceOpenings/p1")));
      await assertFails(setDoc(ref(db(id), "balanceOpenings/p1"), opening));
    }
    await assertFails(setDoc(ref(ownerDb, "balanceOpenings/p2"), opening));
    await assertFails(
      setDoc(ref(ownerDb, "balanceOpenings/p1"), { ...opening, amount: -1 }),
    );
  });
  it("lets the owner add categories and cash openings, hiding both from other roles", async () => {
    await assertSucceeds(
      setDoc(ref(db("owner"), "moneyCategories/custom"), category),
    );
    await assertSucceeds(setDoc(ref(db("owner"), "cashOpenings/p1"), opening));
    await assertSucceeds(getDoc(ref(db("owner"), "moneyCategories/custom")));
    for (const id of ["client", "designer", "supervisor", "outsider"]) {
      await assertFails(getDoc(ref(db(id), "moneyCategories/custom")));
      await assertFails(getDoc(ref(db(id), "cashOpenings/p1")));
      await assertFails(setDoc(ref(db(id), "cashOpenings/p1"), opening));
    }
  });
  it("allows editing a legacy journal without making a second record", async () => {
    await assertSucceeds(
      updateDoc(ref(db("owner"), "expenses/payment"), {
        amount: 120,
        description: "Revised labour",
        categoryId: "exp-labour",
        mode: "Cash",
      }),
    );
    await assertFails(
      updateDoc(ref(db("designer"), "expenses/payment"), { amount: 999 }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "expenses/payment"), { type: "Received" }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "expenses/payment"), { projectId: "p2" }),
    );
  });
  it("validates amount, method, category type and unknown fields on financial writes", async () => {
    await assertSucceeds(setDoc(ref(db("owner"), "expenses/new"), expense));
    for (const change of [
      { amount: -1 },
      { amount: 1000000001 },
      { mode: "Invalid" },
      { date: "2026-99-12" },
      { categoryId: "inc-client" },
      { categoryId: "missing" },
      { unexpected: true },
    ])
      await assertFails(
        setDoc(ref(db("owner"), "expenses/bad"), { ...expense, ...change }),
      );
    await assertSucceeds(
      setDoc(ref(db("owner"), "moneyCategories/custom"), category),
    );
    await assertSucceeds(
      setDoc(ref(db("owner"), "expenses/custom"), {
        ...expense,
        categoryId: "custom",
      }),
    );
    await assertFails(
      setDoc(ref(db("owner"), "receipts/custom"), {
        ...expense,
        type: "Received",
        categoryId: "custom",
      }),
    );
  });
  it("renames and archives categories without reclassifying existing records", async () => {
    await assertSucceeds(
      setDoc(ref(db("owner"), "moneyCategories/custom"), category),
    );
    await assertSucceeds(
      setDoc(ref(db("owner"), "expenses/custom"), {
        ...expense,
        categoryId: "custom",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "moneyCategories/custom"), {
        name: "Renamed",
        active: false,
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "expenses/custom"), { amount: 14 }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "moneyCategories/custom"), {
        type: "Received",
      }),
    );
  });
  it("bounds opening balances to their project and rejects invalid configuration", async () => {
    await assertSucceeds(setDoc(ref(db("owner"), "cashOpenings/p1"), opening));
    await assertSucceeds(
      updateDoc(ref(db("owner"), "cashOpenings/p1"), { amount: 0 }),
    );
    await assertFails(setDoc(ref(db("owner"), "cashOpenings/p2"), opening));
    await assertFails(
      setDoc(ref(db("owner"), "cashOpenings/p1"), { ...opening, amount: -1 }),
    );
    await assertFails(
      setDoc(ref(db("owner"), "moneyCategories/bad"), {
        ...category,
        color: "url(evil)",
      }),
    );
    await assertFails(
      setDoc(
        doc(db("owner"), "interiorQueCompanies/other/cashOpenings/p1"),
        opening,
      ),
    );
  });
});
const project = {
  name: "Home",
  clientName: "Client",
  location: "Hyderabad",
  start: "2026-10-01",
  end: "2026-11-01",
  progress: 0,
  status: "Planning",
  brief: "Interior project",
  image: "/images/living.jpg",
};
const task = {
  projectId: "p1",
  title: "Check drawing",
  assigneeId: "designer",
  due: "2026-10-12",
  stage: "Design",
  priority: "Normal",
  status: "To do",
};
const approval = {
  projectId: "p1",
  title: "Palette",
  description: "Review finishes",
  reviewerId: "client",
  authorId: "designer",
  due: "2026-10-12",
  status: "Awaiting decision",
  response: "",
  clientVisible: true,
};
const db = (id: string, verified = true) =>
  env
    .authenticatedContext(id, {
      email: `${id}@example.com`,
      email_verified: verified,
    })
    .firestore();
const ref = (database: any, path: string) => doc(database, `${root}/${path}`);
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("Run npm run test:rules through the local emulator.");
  env = await initializeTestEnvironment({
    projectId: "demo-interior-que",
    firestore: {
      host: "127.0.0.1",
      port: 8089,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const d = context.firestore();
    const batch = writeBatch(d);
    batch.set(doc(d, root), { name: "Test studio", ownerId: "owner" });
    for (const [id, role, ids] of [
      ["owner", "owner", []],
      ["designer", "designer", ["p1"]],
      ["supervisor", "supervisor", ["p1"]],
      ["client", "client", ["p1"]],
      ["outsider", "designer", ["p2"]],
    ] as const)
      batch.set(ref(d, `members/${id}`), member(id, role, [...ids]));
    batch.set(ref(d, "projects/p1"), project);
    batch.set(ref(d, "projects/p2"), project);
    batch.set(ref(d, "tasks/task"), task);
    batch.set(ref(d, "approvals/approval"), approval);
    for (const shared of [true, false])
      batch.set(ref(d, `updates/${shared ? "shared" : "internal"}`), {
        projectId: "p1",
        authorId: "supervisor",
        authorName: "Supervisor",
        date: "2026-10-11",
        room: "Living",
        summary: "Work completed",
        blocker: shared ? "" : "Internal issue",
        clientVisible: shared,
      });
    batch.set(ref(d, "expenses/payment"), {
      projectId: "p1",
      description: "Labour",
      amount: 100,
      type: "Spent",
      date: "2026-10-11",
    });
    await batch.commit();
  });
});
describe("Company and project isolation", () => {
  it("denies signed-out and unverified accounts", async () => {
    await assertFails(
      getDoc(ref(env.unauthenticatedContext().firestore(), "projects/p1")),
    );
    await assertFails(getDoc(ref(db("owner", false), "projects/p1")));
  });
  it("allows verified owner company creation with membership in one batch", async () => {
    const d = db("newowner");
    const b = writeBatch(d);
    b.set(doc(d, "interiorQueCompanies/new"), {
      name: "New studio",
      ownerId: "newowner",
    });
    b.set(
      doc(d, "interiorQueCompanies/new/members/newowner"),
      member("newowner", "owner", []),
    );
    await assertSucceeds(b.commit());
  });
  it("limits staff and client to assigned projects, including queries", async () => {
    await assertSucceeds(getDoc(ref(db("designer"), "projects/p1")));
    await assertFails(getDoc(ref(db("designer"), "projects/p2")));
    await assertFails(getDoc(ref(db("outsider"), "projects/p1")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "projects"),
          where(documentId(), "in", ["p1"]),
        ),
      ),
    );
    await assertFails(getDocs(collection(db("client"), root, "projects")));
  });
  it("denies other companies and production namespaces", async () => {
    await assertFails(
      getDoc(doc(db("owner"), "interiorQueCompanies/other/projects/p1")),
    );
    await assertFails(
      setDoc(doc(db("owner"), "designQuote/test"), { value: 1 }),
    );
  });
  it("revokes paused accounts immediately", async () => {
    await assertSucceeds(
      updateDoc(ref(db("owner"), "members/designer"), { active: false }),
    );
    await assertFails(getDoc(ref(db("designer"), "projects/p1")));
    await assertFails(
      updateDoc(ref(db("designer"), "tasks/task"), { status: "Done" }),
    );
  });
  it("does not let staff create projects or change client-facing project details", async () => {
    await assertFails(setDoc(ref(db("designer"), "projects/p3"), project));
    await assertFails(
      updateDoc(ref(db("supervisor"), "projects/p1"), { brief: "Changed" }),
    );
    await assertSucceeds(
      updateDoc(ref(db("supervisor"), "projects/p1"), {
        progress: 50,
        status: "In progress",
      }),
    );
  });
  it("creates a project and starter tasks atomically", async () => {
    const d = db("owner"),
      b = writeBatch(d);
    b.set(ref(d, "projects/new"), project);
    for (let i = 0; i < 5; i++)
      b.set(ref(d, "tasks/new-" + i), {
        ...task,
        projectId: "new",
        assigneeId: "owner",
      });
    await assertSucceeds(b.commit());
  });
});
describe("Client privacy and decisions", () => {
  it("hides internal work, team members and financial journals", async () => {
    for (const path of [
      "tasks/task",
      "updates/internal",
      "expenses/payment",
      "members/designer",
    ])
      await assertFails(getDoc(ref(db("client"), path)));
    await assertFails(getDoc(ref(db("designer"), "expenses/payment")));
    await assertSucceeds(getDoc(ref(db("owner"), "expenses/payment")));
  });
  it("requires published-only client queries", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(db("client"), root, "updates"),
          where("projectId", "in", ["p1"]),
          where("clientVisible", "==", true),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(db("client"), root, "updates"),
          where("projectId", "in", ["p1"]),
        ),
      ),
    );
  });
  it("allows the assigned reviewer to decide once, preserving the decision record", async () => {
    await assertFails(
      updateDoc(ref(db("designer"), "approvals/approval"), {
        status: "Approved",
      }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "approvals/approval"), {
        status: "Changes requested",
        response: "",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("client"), "approvals/approval"), {
        status: "Changes requested",
        response: "Use a lighter oak finish.",
      }),
    );
    await assertFails(
      updateDoc(ref(db("client"), "approvals/approval"), {
        status: "Approved",
      }),
    );
  });
  it("prevents changing decision author, reviewer or description", async () => {
    await assertFails(
      updateDoc(ref(db("client"), "approvals/approval"), {
        status: "Approved",
        description: "Changed terms",
      }),
    );
    await assertFails(
      updateDoc(ref(db("owner"), "approvals/approval"), {
        reviewerId: "owner",
      }),
    );
  });
  it("requires client visibility for client review requests", async () => {
    await assertSucceeds(
      setDoc(ref(db("designer"), "approvals/new"), approval),
    );
    await assertFails(
      setDoc(ref(db("designer"), "approvals/hidden"), {
        ...approval,
        clientVisible: false,
      }),
    );
  });
});
describe("Invitations and data validation", () => {
  it("assigns tasks only to active staff with access to the same project", async () => {
    await assertFails(
      setDoc(ref(db("owner"), "tasks/client-task"), {
        ...task,
        assigneeId: "client",
      }),
    );
    await assertFails(
      setDoc(ref(db("owner"), "tasks/outsider-task"), {
        ...task,
        assigneeId: "outsider",
      }),
    );
    await assertSucceeds(
      setDoc(ref(db("owner"), "tasks/valid-task"), {
        ...task,
        assigneeId: "supervisor",
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db("owner"), "tasks/task"), { assigneeId: "supervisor" }),
    );
  });
  it("rejects self-promotion and uninivited membership", async () => {
    await assertFails(
      updateDoc(ref(db("designer"), "members/designer"), { role: "owner" }),
    );
    await assertFails(
      setDoc(
        ref(db("intruder"), "members/intruder"),
        member("intruder", "owner", []),
      ),
    );
    await assertFails(
      setDoc(
        ref(db("owner"), "members/intruder"),
        member("intruder", "owner", []),
      ),
    );
  });
  it("lets only the named email accept the exact invited role and projects", async () => {
    const invite = {
      name: "New client",
      email: "guest@example.com",
      role: "client",
      projectIds: ["p1"],
      status: "Pending",
    };
    await assertSucceeds(
      setDoc(ref(db("owner"), "invites/guest@example.com"), invite),
    );
    await assertFails(getDoc(ref(db("intruder"), "invites/guest@example.com")));
    await assertFails(
      setDoc(ref(db("guest"), "members/guest"), {
        ...member("guest", "designer"),
        name: invite.name,
      }),
    );
    const d = db("guest"),
      b = writeBatch(d);
    b.set(ref(d, "members/guest"), {
      ...member("guest", "client"),
      name: invite.name,
    });
    b.update(ref(d, "invites/guest@example.com"), { status: "Accepted" });
    await assertSucceeds(b.commit());
  });
  it("denies arbitrary fields and spoofed authors", async () => {
    await assertFails(
      setDoc(ref(db("owner"), "projects/bad"), {
        ...project,
        internalProfit: 100,
      }),
    );
    await assertFails(
      setDoc(ref(db("designer"), "updates/spoof"), {
        projectId: "p1",
        authorId: "owner",
        authorName: "Owner",
        date: "2026-10-11",
        room: "Living",
        summary: "Fake",
        blocker: "",
        clientVisible: true,
      }),
    );
  });
  it("enforces valid material quantities and server-only photo metadata", async () => {
    const d = db("designer");
    const material = {
      projectId: "p1",
      name: "Plywood",
      quantity: 10,
      unit: "Sheet",
      status: "To order",
      notes: "",
    };
    await assertSucceeds(setDoc(ref(d, "materials/good"), material));
    await assertFails(
      setDoc(ref(d, "materials/bad"), { ...material, quantity: -1 }),
    );
    const file = {
      projectId: "p1",
      name: "Site photo",
      kind: "photo",
      objectKey: "companies/studio/projects/p1/photos/example.webp",
      sizeBytes: 1000,
      url: "",
      room: "Kitchen",
      caption: "",
      authorId: "designer",
      clientVisible: true,
      date: "2026-10-11",
    };
    await assertFails(setDoc(ref(d, "files/good"), file));
    await assertFails(setDoc(ref(db("owner"), "files/good"), file));
    await assertFails(
      setDoc(ref(db("owner"), "photoStorage/current"), {
        usedBytes: 0,
        quotaBytes: 9999999999,
      }),
    );
    await assertFails(setDoc(ref(d, "photoUploads/invented"), file));
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(ref(context.firestore(), "files/server-photo"), file),
    );
    await assertSucceeds(getDoc(ref(db("client"), "files/server-photo")));
    await assertFails(
      updateDoc(ref(db("client"), "files/server-photo"), {
        clientVisible: false,
      }),
    );
    await assertFails(
      setDoc(ref(d, "files/bad"), {
        ...file,
        url: "https://evil.example/file",
      }),
    );
    await assertFails(getDoc(ref(db("client"), "materials/good")));
  });
});
