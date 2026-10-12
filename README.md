# Interior Que

Project management for interior firms: owners, designers, supervisors and clients. React + TypeScript PWA on GitHub Pages; Google Sign-In and project metadata use the isolated **Interior Que Development** Firebase project.

App: [Interior Que](https://chiran-koda.github.io/Interior-Que/)

## Conversations, inbox and faster forms

**Chat** has a separate team conversation and client conversation for each project. Assigned people can reply, mention up to five people, and attach up to two existing project photos. Clients can only use the shared conversation and shared photos. Team members can turn a message into an assigned task, snag or approval request after reviewing the copied text and audience. Each message can create one linked item of each kind, preventing duplicate conversions. Messages are immutable. The screen loads the latest 50 messages and can load older history; an inbox mention opens its referenced message even if it is older.

**Inbox** brings together mentions, assignments, pending reviews, site blockers, due deliveries and collections according to the signed-in role. Opening an item marks it read. Mention records and read state sync through Firestore; other reminders are derived from current project records. This is an in-app inbox, without email, SMS or background push delivery.

**Editable choices** let users select, search or type room names, materials, suppliers, units, finishes, brands, work categories and common task names. Typing a new value does not require maintaining a list first. Staff can explicitly save a value for reuse; owners can rename, archive and restore company choices in Settings. Renaming preserves historical records. Appropriate identity, status, role and permission fields retain constrained selectors.

These workflows use company-scoped `chatMessages`, `chatActions`, `notifications`, `inboxReads` and `listValues` collections. Firestore rules enforce audience, project access, immutable authorship, same-channel replies, valid mentions and shared attachments. Chat listeners are limited to the selected project and audience; notification listeners are limited to the current recipient. Local demo messages never reach other users.

## Shared project assistant

The Assistant screen is available to owners, designers, supervisors and clients. Project overview, pending work, latest approved drawings and a client update draft work from permitted records now. **Shared generative AI is prepared but disconnected until the service owner supplies the key and connects the separate assistant Worker.** Companies and users do not enter their own API keys.

The prepared Worker supports OpenAI Responses or Gemini structured output, selected once by the service owner. It verifies Firebase authentication and project access, fetches bounded role-permitted records on the server and rechecks membership before returning an answer. Clients receive shared project information; internal journals are owner-only. AI drafts tasks or site reports for human review; it never silently assigns work, sends a message or records a decision. Private atomic counters enforce daily global/company/user request limits. No live provider request or paid service was activated for this release.

Follow [shared AI setup](docs/AI_SETUP.md) when the key is ready. Keep the key in a Worker secret; only the public service URL belongs in `VITE_ASSISTANT_API_URL`.

## Interior firm project tools

Open a project to use **Budget / Payments, Selections, Extras, Drawings, Orders, Snags and Handover**. Tools adapt to the signed-in role. Money provides a budget overview; Materials links directly to each project's supplier orders. New projects open their workspace after creation.

- **Templates:** Simple project, 2BHK, 3BHK, villa, office and renovation. Suggested task dates are spread across the chosen start and handover dates. The owner can reassign and edit the tasks. Existing project checklists are preserved.
- **Daily site reports:** One form for completed work, tomorrow's plan, shortages, blockers, worker count and up to four project photos. Reports have explicit client visibility. Drafts stay on the current device. Uploaded photos remain in the project even if the report is abandoned. Live uploads still require completing the existing R2 setup; reports can be posted without photos.
- **Budgets and payment milestones:** Agreed value, expected cost, client collections, paid expenses, remaining collections and forecast margin. Approved variations increase agreed value. Milestones do not create money transactions; link income to a milestone in Money. Editing, relinking or unlinking the same receipt adjusts collections in one transaction. Editing a milestone preserves its current collections. Owner contributions and unrelated income are excluded from project client collections unless explicitly linked to a client milestone.
- **Room selections:** Record specifications and an optional project photo, then choose an assigned reviewer. Reviewers approve or request changes with a comment. Recorded decisions are immutable; a revised choice gets a new request.
- **Extra work:** The owner records scope, additional cost and days and requests an owner/client decision. Only approved extras affect the agreed value; no money is transferred or dates automatically changed. Staff do not receive these cost records.
- **Drawing versions:** HTTPS links to files already hosted by the firm, grouped by room and title. Team members add private drafts; owners approve and share versions. Atomic version counters prevent duplicate versions. Approving a version atomically supersedes the previous approval. File hosting/sharing permissions are controlled at the linked host; this release does not upload drawing PDFs to R2.
- **Purchase orders and deliveries:** Owners/designers record suppliers, quantities, rates and expected dates. Assigned supervisors record cumulative deliveries, with partial and complete status. Receipts across linked orders determine whether the planned material quantity is on site. Orders do not create expenses automatically.
- **Snags and handover:** Any assigned user can report a snag; the owner assigns repairs. The team records repair evidence; the owner or reporting client verifies it. The owner can complete handover once all recorded snags are resolved and five checklist items are checked. Completed handovers are locked.

New collections under `interiorQueCompanies/{companyId}`: `projectBudgets`, `paymentSchedules`, `selections`, `changeOrders`, `drawings`, `drawingHeads`, `purchaseOrders`, `snags` and `handovers`. Firestore rules enforce active membership, project access, role permissions, reviewer-only decisions and shared-photo references. Budgets are owner-only; shared payment schedules/variations are available to assigned clients; supplier orders stay internal. No external message is sent by these workflows.

This release uses the existing development project's Firestore and Google authentication. It adds document reads/writes, listeners and indexes to existing Firestore usage; it does not enable Firebase Storage, Functions or a paid Firebase plan. Company photo quotas apply to R2 photo bytes, not Firestore document/index storage. All rules and workflow tests run locally before development deployment.

## Money workspace

Company owners can filter income and expenses by project and month, view net totals and expense charts, record and edit transactions, and create, rename or archive categories. Archived categories retain their historical transactions. Income and expense type and project remain fixed on an existing transaction; amount, date, description, payment method and category can be corrected without creating a duplicate.

Combined balance uses a project opening balance across all payment methods plus all receipts minus all expenses from the opening date through the selected month end. Cash, bank, UPI, cheque, other and unspecified methods are included. Before an opening balance is configured, the card calculates from all recorded transactions with a clearly labelled zero opening assumption. Opening balance means the total before transactions on that date. Combined opening balances are stored separately from legacy cash-only openings, which are never silently reinterpreted or rewritten. Legacy transactions remain unchanged and can be classified by the owner; missing expense categories appear as Other expenses.

Receipt sharing opens a reviewed WhatsApp draft. The owner chooses the recipient and sends it in WhatsApp; no message is sent automatically. Financial journals, categories and opening balances are readable and writable only by an active company owner in the isolated development Firebase project. Categories use `moneyCategories/{id}`, combined openings use `balanceOpenings/{projectId}`, and legacy cash-only openings remain in `cashOpenings/{projectId}`. No DesignQuote data or production rules are changed.

## Project photos

The unfinished Google Drive integration and its earlier personal-workspace entry point have been removed. Google authentication requests no Drive scope. No files need migration.

Supervisors choose a project and room, select up to 20 photos, and upload. Images are resized to a maximum 2,000 pixel long edge and re-encoded as WebP/JPEG. Each photo shows progress, success or an actionable error with retry. Two uploads run concurrently. Retries reuse stable IDs and compressed bytes.

Private Cloudflare R2 objects are organized as `companies/{companyId}/projects/{projectId}/photos/{photoId}.webp` or `.jpg`. A Cloudflare Worker provides signed upload URLs (5 minutes) and signed viewing URLs (60 seconds). These are application-signed Worker URLs backed by the private R2 binding, not public bucket or S3 URLs. No R2 access keys are needed in the browser.

The Worker verifies Firebase ID tokens, active membership and project access on the server. Clients can only view explicitly shared photos, and cannot upload or change quota. Access is rechecked on every image view. Firestore stores metadata, quota counters and temporary reservations; no photo bytes or permanent signed URLs. New companies start at **1,000,000,000 bytes (1 GB)**, configurable by the service default or a server-administered company quota.

Exact size, content hash and actual encoded dimensions are verified before storing an upload. Atomic reservations prevent concurrent uploads from exceeding quota. Finalization counts bytes once. Hourly cleanup releases abandoned reservations after 24 hours and removes their orphan objects. R2 is private, with `r2.dev` and public custom domains disabled.

**Live R2 storage is awaiting completion of the manual setup.** The user has created a private development bucket and Worker in Cloudflare; the remaining service credentials, binding and public app connection have not been verified. This feature release does not enable paid services. Until the public Worker URL is configured, the app clearly shows that company storage setup is pending. The demo can resize and save photos on the current device for UI verification.

Follow the complete [Cloudflare setup and Firebase billing guide](docs/CLOUDFLARE_SETUP.md). It covers owner approval before R2 checkout, a private bucket, a dedicated development service account, Worker secrets, deployment, GitHub Pages configuration and live acceptance checks.

## Company workflows and isolation

Owners create studios and projects with a chosen template checklist, invite people by Google email and assign projects. Designers and supervisors manage assigned tasks, materials, updates and approvals. Clients see assigned projects and published updates/photos/decisions. Money and membership management remain owner-only. Invitations are saved in the app; no email is sent automatically.

**DesignQuote and its Firebase authentication, data, rules and subscriptions are untouched.** Both the app configuration guard and photo Worker are restricted to `interior-que-development`. Future production integration requires a separate tested release. Shared authentication across websites and subscription billing are not implemented here.

Firestore application records remain in `interiorQueCompanies/{companyId}`. Photo metadata uses `files/{photoId}`, pending records use `photoUploads/{photoId}`, and company usage uses `photoStorage/current`. Private server cleanup jobs use `interiorQuePhotoJobs`; app clients have no access to that namespace. Clients cannot write any photo metadata or counters directly.

## Development and checks

```text
npm ci
npm test
npm run check:worker
npm run test:rules
npm run build
npm run build:worker
```

Node 22 and Java 21 are used for checks. Rule tests use the `demo-interior-que` local emulator, never a live database. Worker tests use isolated fake database/bucket adapters to exercise real request handlers, concurrent reservation behavior, retries, scope enforcement, signed link expiry and orphan cleanup. JWT tests verify issuer, audience, signature, expiry and verified email.

Frontend development: `npm run dev`. Set only the public `VITE_PHOTO_API_URL` in ignored `.env.local` after Worker setup. Server credentials belong only in Cloudflare Worker secrets. Never place service-account JSON, private keys or signing secrets in source, GitHub Pages or a `VITE_` variable.

GitHub Pages CI tests the app, Worker types and Firestore rules before publication. Set the repository **variable** `VITE_PHOTO_API_URL` to the HTTPS Worker URL and manually rerun the publication workflow after setup. Local builds default to `/`; Pages uses `/Interior-Que/`, including the PWA manifest and service worker.

No Firebase Storage, Cloud Functions or Blaze upgrade is required. Firestore metadata and authorization operations consume the project's existing free quotas. R2's included usage is account-wide and metered beyond the allowance; a 1 GB company quota does not guarantee zero account cost. See the setup guide for current official billing sources and the required approval boundary.
