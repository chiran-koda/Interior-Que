# Interior Que shared AI setup

Status: the app and server adapter are prepared; the shared service key will be supplied later. AI calls are currently disconnected. The project helper works without a provider. This service is for all Interior Que roles, with one operator-managed provider account. No user or company needs to paste a key.

## 1. Choose the provider and review costs

Choose `openai` or `gemini`, and a model that supports the structured-output format used by the adapter. Configure the exact API model ID; no model is silently selected. Review the chosen provider's API pricing and data handling before activation. API usage is separate from a ChatGPT or other consumer subscription. Do not activate a paid provider account, Workers Paid or Firebase Blaze without the service owner's approval.

The implementation uses [OpenAI Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) or [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). OpenAI response storage is disabled with `store: false`; that setting does not itself guarantee zero provider retention. Questions and bounded project context are transmitted to the selected provider when a user presses Ask AI. There are no automatic external tools or background AI calls.

## 2. Prepare a development-only database identity

In Google Cloud, verify the selected project is **Interior Que Development / `interior-que-development`**. Create a dedicated service account such as `interior-que-assistant-worker` with **Cloud Datastore User (`roles/datastore.user`)** on this development project only. Generate its JSON credential using your approved account security process. Do not grant Owner/Editor, disable organizational security restrictions, or use a DesignQuote credential.

Store the credential outside the repository. The adapter rejects any Firebase project other than `interior-que-development`, including a service-account credential for another project. Server IAM bypasses client rules, so the Worker independently verifies the user, active company membership, role, assigned project and client visibility. It reads only whitelisted project collections and writes private usage counters.

## 3. Configure the separate assistant Worker

This is **not** the photo Worker. Do not replace `interior-que-photos-dev` or add an AI key to that application's browser settings. Use `worker/assistant.wrangler.jsonc`, which creates `interior-que-assistant-dev` and requires no R2 binding.

Set these non-secret values in that config:

| Name                     | Value                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `FIREBASE_PROJECT_ID`    | Keep `interior-que-development`                                                                      |
| `ALLOWED_ORIGINS`        | Exact comma-separated app origins; include `https://chiran-koda.github.io`, without `/Interior-Que/` |
| `AI_PROVIDER`            | `openai` or `gemini`                                                                                 |
| `AI_MODEL`               | The provider's supported model ID                                                                    |
| `DAILY_GLOBAL_REQUESTS`  | Initially `100` across the entire service                                                            |
| `DAILY_COMPANY_REQUESTS` | Initially `40` per company                                                                           |
| `DAILY_USER_REQUESTS`    | Initially `10` per user within their company                                                         |

Limits reset by UTC day. Requests also have a five-second user cooldown. A reserved attempt counts even if the provider subsequently fails. The adapter bounds project context and caps output at 1,800 tokens. Request limits reduce exposure but are **not a dollar spending cap**; configure and monitor provider usage limits as available.

From the repository, use interactive secret prompts so values do not enter command history:

```text
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --config worker/assistant.wrangler.jsonc
npx wrangler secret put AI_API_KEY --config worker/assistant.wrangler.jsonc
```

Enter the dedicated development JSON credential for the first secret and the service owner's API key for the second. Never paste either into chat, GitHub source, repository variables, company Firestore documents, browser storage or a `VITE_` variable. The provider key is sent in a request header, never in the URL. Request/body logging is disabled in the Worker configuration.

Run the checks, then deploy after credentials, provider choice and any required cost approval are ready:

```text
npm test
npm run check:worker
npm run test:rules
npm run build
npx wrangler deploy --config worker/assistant.wrangler.jsonc
```

Keep the Workers Free plan. If the service cannot run within its limits, measure the issue and ask before upgrading. Verify the resulting HTTPS Worker address; this guide does not claim a live deployment exists yet.

## 4. Connect the public app

In the Interior-Que GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Add the public repository variable **`VITE_ASSISTANT_API_URL`** with the assistant Worker's HTTPS origin, without `/ask`. Run the GitHub Pages publication workflow again. The workflow already includes this variable. Do not add `AI_API_KEY` here: browser builds expose every `VITE_` value.

For local development only, the same public URL can go in ignored `.env.local`. Users then open Assistant and ask questions after signing in. No company-specific configuration is needed.

## 5. Verify before inviting users

Use a synthetic development project to check each role. An owner can ask about the project budget; staff cannot receive internal financial journals. A client can ask about shared updates and shared collection milestones, but cannot receive team tasks, supplier orders or private reports. Unassigned, paused and signed-out accounts must be rejected. Pausing access during a request must suppress the resulting answer.

Check a reviewed task draft creates one assigned task, and a reviewed report respects its selected client visibility. AI proposals are suggestions, with no direct server write to work records. Test the daily limit, unsupported model, missing key and provider failure states. Disable the connection if any boundary fails. For immediate provider shutdown, remove/rotate the Worker key; removing the frontend URL alone does not disable direct server callers.

The assistant receives a bounded sample of up to 20 records per collection, trimmed further to fit context. It explicitly treats that context as partial and must not infer the absence of older records or claim guaranteed complete financial totals. Long-running conversations and autonomous agents are outside this release.

## Firebase and Cloudflare implications

The existing development Firestore stores project data and private atomic counters under `aiPrivateUsage`. AI adds document/index reads, authorization reads and counter writes to that database's existing usage. Chat also adds live listeners and message/mention writes. These consume the shared development project's quotas; Firestore document storage is separate from each company's R2 photo allowance. No photo bytes or provider key are saved in Firestore.

Firebase Storage, Functions and Blaze are not required by this implementation. With a no-billing project, quota exhaustion can interrupt service; enabling billing is a separate approval. See [Firestore usage and limits](https://firebase.google.com/docs/firestore/quotas). Counters and chat history are not automatically deleted with paid TTL.

Workers Free limits still apply, including request/CPU limits; network waiting is distinct from CPU execution. Retain the Free plan and measure signed-in provider requests before wider rollout. See [Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/). Provider charges are a third, separate service cost. DesignQuote's Firebase, subscriptions and production data remain untouched.
