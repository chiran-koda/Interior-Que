import { openDB } from "idb";
import { demoStudio, type StudioData } from "./studio-model";
const database = () =>
  openDB("interior-que-demo", 1, {
    upgrade(db) {
      db.createObjectStore("studio");
    },
  });
export async function loadDemoStudio(): Promise<StudioData> {
  return (await (await database()).get("studio", "data")) || demoStudio();
}
export async function saveDemoStudio(data: StudioData) {
  await (await database()).put("studio", data, "data");
}
