import { describe, it, expect } from "vitest";
import {
  demoStudio,
  scopedStudio,
  taskProgress,
  projectStarter,
  isOverdue,
  safeFileUrl,
} from "./studio-model";
describe("role workspaces", () => {
  it("keeps clients away from team records and unpublished updates", () => {
    const s = demoStudio();
    s.updates.push({ ...s.updates[0], id: "internal", clientVisible: false });
    const client = scopedStudio(s, s.members.find((m) => m.role === "client")!);
    expect(client.projects.map((p) => p.id)).toEqual(["p1"]);
    expect(client.tasks).toEqual([]);
    expect(client.payments).toEqual([]);
    expect(client.materials).toEqual([]);
    expect(client.invites).toEqual([]);
    expect(client.members).toHaveLength(1);
    expect(client.updates.every((u) => u.clientVisible)).toBe(true);
  });
  it("scopes staff to assigned projects and hides money", () => {
    const s = demoStudio(),
      designer = scopedStudio(s, s.members.find((m) => m.role === "designer")!);
    expect(designer.projects.every((p) => ["p1", "p2"].includes(p.id))).toBe(
      true,
    );
    expect(
      designer.tasks.every((t) => ["p1", "p2"].includes(t.projectId)),
    ).toBe(true);
    expect(designer.payments).toEqual([]);
  });
  it("clears all records for paused members, including owners", () => {
    const s = demoStudio();
    for (const m of s.members) {
      const view = scopedStudio(s, { ...m, active: false });
      expect(view.projects).toEqual([]);
      expect(view.payments).toEqual([]);
      expect(view.members).toEqual([]);
    }
  });
  it("calculates progress from completion and excludes completed overdue tasks", () => {
    const tasks = projectStarter("p1", "owner", "2026-10-12");
    tasks[0].status = "Done";
    expect(taskProgress(tasks)).toBe(20);
    expect(isOverdue(tasks[0], "2026-11-01")).toBe(false);
    expect(isOverdue(tasks[1], "2026-11-01")).toBe(true);
  });
  it("allows only bundled demo references, never permanent external photo URLs", () => {
    expect(safeFileUrl("/images/living.jpg")).toBe(true);
    expect(safeFileUrl("https://drive.google.com/file/d/id/view")).toBe(false);
    for (const url of [
      "javascript:alert(1)",
      "https://drive.google.com.evil.example/file",
      "https://user@drive.google.com/file",
      "http://drive.google.com/file",
    ])
      expect(safeFileUrl(url)).toBe(false);
  });
});
