import { describe, it, expect } from "vitest";
import { demoStudio, scopedStudio, type StudioData } from "./studio-model";
import {
  listId,
  listOptions,
  normalise,
  addDemoMessage,
  addDemoChatAction,
  inboxItems,
  projectHelper,
  type ChatMessage,
} from "./collaboration";
const person = (data: StudioData, role: string) =>
  data.members.find((m) => m.role === role)!;
const message = (s: StudioData, shared = false): ChatMessage => ({
  id: "m1",
  projectId: "p1",
  authorId: person(s, "owner").id,
  authorName: person(s, "owner").name,
  body: "Inspect the kitchen",
  createdAt: 100,
  clientVisible: shared,
  replyTo: "",
  mentions: [],
  photoIds: [],
});
describe("Company choices", () => {
  it("normalises duplicate names and keeps archived choices out of defaults/history", () => {
    const s = demoStudio();
    s.listValues = [
      {
        id: listId("rooms", "Kitchen"),
        category: "rooms",
        value: "Kitchen",
        active: false,
      },
      {
        id: listId("rooms", "Prayer room"),
        category: "rooms",
        value: "Prayer room",
        active: true,
      },
    ];
    s.updates.push({ ...s.updates[0], room: "Kitchen" });
    expect(listOptions(s, "rooms")).not.toContain("Kitchen");
    expect(listOptions(s, "rooms")).toContain("Prayer room");
    expect(listId("rooms", " Prayer  ROOM ")).toBe(
      listId("rooms", "prayer room"),
    );
    expect(normalise(" A   B ")).toBe("A B");
  });
  it("scopes client choices to rooms/finishes and keeps old materials compatible", () => {
    const s = demoStudio();
    s.listValues = [
      {
        id: "s",
        category: "suppliers",
        value: "Internal supplier",
        active: true,
      },
      { id: "r", category: "rooms", value: "Study", active: true },
    ];
    const client = scopedStudio(s, person(s, "client"));
    expect(client.listValues!.map((v) => v.id)).toEqual(["r"]);
    expect(listOptions(client, "suppliers")).toEqual([]);
  });
});
describe("Project conversations", () => {
  it("isolates channels and creates mention notifications once", () => {
    let s = demoStudio();
    const m = { ...message(s), mentions: [person(s, "supervisor").id] };
    s = addDemoMessage(s, person(s, "owner"), m);
    s = addDemoMessage(s, person(s, "owner"), m);
    expect(s.chatMessages).toHaveLength(1);
    expect(s.notifications).toHaveLength(1);
    expect(scopedStudio(s, person(s, "client")).chatMessages).toEqual([]);
    expect(scopedStudio(s, person(s, "supervisor")).notifications).toHaveLength(
      1,
    );
    expect(scopedStudio(s, person(s, "designer")).notifications).toEqual([]);
  });
  it("rejects client/internal messages and private attachments in a shared channel", () => {
    const s = demoStudio(),
      client = person(s, "client");
    expect(() =>
      addDemoMessage(s, client, {
        ...message(s),
        authorId: client.id,
        authorName: client.name,
      }),
    ).toThrow();
    s.files.push({ ...s.files[0], id: "private", clientVisible: false });
    expect(() =>
      addDemoMessage(s, person(s, "owner"), {
        ...message(s, true),
        photoIds: ["private"],
      }),
    ).toThrow();
    expect(() =>
      addDemoMessage(s, person(s, "owner"), {
        ...message(s),
        mentions: ["missing"],
      }),
    ).toThrow();
  });
  it("requires replies to stay in the same project and audience", () => {
    const s = demoStudio();
    s.chatMessages = [message(s)];
    expect(() =>
      addDemoMessage(s, person(s, "owner"), {
        ...message(s, true),
        id: "reply",
        replyTo: "m1",
      }),
    ).toThrow();
    expect(() =>
      addDemoMessage(s, person(s, "owner"), {
        ...message(s),
        id: "reply",
        replyTo: "m1",
      }),
    ).not.toThrow();
  });
  it("creates one linked task and prevents duplicate conversions", () => {
    let s = demoStudio(),
      m = message(s);
    s = addDemoMessage(s, person(s, "owner"), m);
    const task = {
      ...s.tasks[0],
      id: "m1_task",
      projectId: "p1",
      title: m.body,
      status: "To do" as const,
    };
    s = addDemoChatAction(s, person(s, "owner"), m, "task", task);
    expect(s.chatActions![0].recordId).toBe(task.id);
    expect(() =>
      addDemoChatAction(s, person(s, "owner"), m, "task", task),
    ).toThrow();
    expect(() =>
      addDemoChatAction(
        s,
        person(s, "client"),
        { ...m, clientVisible: true },
        "task",
        task,
      ),
    ).toThrow();
  });
});
describe("Inbox and project helper privacy", () => {
  it("keeps read state per member and hides internal work from clients", () => {
    const s = demoStudio(),
      owner = person(s, "owner"),
      client = person(s, "client"),
      first = inboxItems(s, owner)[0];
    s.inboxReads = [{ id: owner.id, userId: owner.id, keys: [first.key] }];
    expect(
      inboxItems(scopedStudio(s, owner), owner).find((n) => n.key === first.key)
        ?.read,
    ).toBe(true);
    const view = scopedStudio(s, client);
    expect(
      inboxItems(view, client).every(
        (n) => !["Tasks", "Site updates"].includes(n.page),
      ),
    ).toBe(true);
  });
  it("client progress drafts only use shared site reports", () => {
    const s = demoStudio();
    s.updates.unshift({
      ...s.updates[0],
      id: "secret",
      clientVisible: false,
      date: "2099-01-01",
      summary: "Internal private instructions",
    });
    const helper = projectHelper(s, person(s, "owner"), "p1");
    expect(helper.summary).toContain("Internal private instructions");
    expect(helper.clientDraft).not.toContain("Internal private instructions");
    expect(() =>
      projectHelper(
        scopedStudio(s, person(s, "client")),
        person(s, "client"),
        "p2",
      ),
    ).toThrow();
  });
});
