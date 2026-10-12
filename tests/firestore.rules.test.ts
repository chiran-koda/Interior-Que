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
