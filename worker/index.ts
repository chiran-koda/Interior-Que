import { FirestoreStore } from "./firestore";
import { handle, sweep, type PhotoEnv } from "./service";
import { PROJECT, verifyUser } from "./security";
interface Env extends PhotoEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT: string;
}
function store(env: Env) {
  if (env.FIREBASE_PROJECT_ID !== PROJECT)
    throw new Error("This worker is restricted to Interior Que Development.");
  return new FirestoreStore(env.FIREBASE_SERVICE_ACCOUNT);
}
export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handle(request, env, { store: store(env), verifyUser });
    } catch {
      return Response.json(
        { error: "Photo storage has not been configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(sweep(env, store(env)));
  },
} satisfies ExportedHandler<Env>;
