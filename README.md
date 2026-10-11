# Interior Que

Interior project management for an entire firm: owners, designers, site supervisors and clients. A React + TypeScript PWA with Firebase Google authentication, Firestore studio data and private Google Drive file links/uploads.

Live app: https://chiran-koda.github.io/Interior-Que/

## Daily work

- Owners create studios, projects and a five-step starter checklist; invite people by their Google email, assign projects and tasks, and record receipts/expenses.
- Designers work from their task list, plan materials, share drawings and request decisions.
- Supervisors record site progress and blockers, complete tasks and track delivery of materials.
- Clients see only assigned projects, published site updates/files and shared decisions. They can approve or request changes with review notes.
- Team updates default to internal. Owners control membership and project access. Invitations are saved in the app; no email is sent automatically.
- The interactive demo uses separate device storage. Earlier personal tools and records remain accessible from the welcome screen.

## Development backend

The default web configuration points only to **interior-que-development**, the new Interior Que Development Firebase project. Firestore is Standard edition in **asia-south1 (Mumbai)**; the project uses the free Spark plan.

Google sign-in is enabled for this development app. Each firm creates its own studio. Access is enforced by Firestore rules, with verified authentication, active membership, assigned projects and role checks.

All application data is under:

    interiorQueCompanies/{companyId}/
      members, projects, tasks, materials, updates, approvals, files,
      expenses, receipts, invites

The root company record contains its name and owner ID. Expenses and receipts are owner-only collections. Unrelated namespaces are denied. Client queries include published visibility constraints. Decisions are assigned to one reviewer and cannot be rewritten after review.

**DesignQuote production data, authentication, rules and subscriptions were not changed.** Future integration needs a tested rollout of the Interior Que namespace and an explicit cross-origin sign-in handoff. Sharing a Firebase project alone does not automatically sign a browser into a different website. Interior Que subscriptions/entitlements must remain separate from DesignQuote; billing is not implemented in this development release.

Firebase web configuration and OAuth client IDs are public application identifiers, not administrator credentials. Never place service accounts, OAuth client secrets or refresh tokens in this repository or its frontend build.

## Google Drive

Files are stored in the uploader's Drive, organized into Interior Que/project folders. The app saves their links and captions against the project. Drive access requests use drive.file, and access tokens stay in memory. Uploads are limited to 25 MB and verified against the returned file size. Stable attachment IDs let a retry find a previously completed upload.

A project link does not change the underlying Drive file's sharing permissions. Recipients must also have permission in Google Drive. Files are never made public automatically. Existing HTTPS Drive links can be added without connecting uploads.

The development OAuth web client is configured with Drive API enabled and the GitHub Pages/local test origins. Its public client ID is included as the default. Advanced connection settings accept another public client ID when needed. Individual users consent when they connect their own Drive. Shared-workspace uploads require an internet connection; the older personal workspace retains its device upload queue.

## Local development

    npm ci
    npm run dev
    npm test
    npm run test:rules
    npm run build

Use Node 22 and Java 21 for Firestore emulator tests. The emulator uses demo-interior-que; tests do not access live Firebase data. The GitHub Pages workflow runs application tests, database access tests and a production build before publishing.

This release is locked to the registered Interior Que Development web configuration. The configuration guard rejects different project IDs, API keys, authentication domains and app IDs before starting authentication. A production integration requires a separately tested code release.

To deploy development rules and indexes after tests:

    npx firebase deploy --only firestore --project interior-que-development

The frontend build uses VITE_BASE_PATH=/Interior-Que/ on GitHub Pages. Its manifest and service worker use the same scope. The app offers an update prompt when a new version is available.

## Verification

Application tests cover existing calculations, validation, Drive requests and new role-scoped data/progress behavior. Firestore emulator tests cover signed-out and unverified denial, isolated companies, paused access, owner creation, atomic project checklists, project-scoped staff, client visibility, reviewer-only decisions, assigned staff validation, invitation acceptance and rejected privilege escalation.

Browser checks cover responsive navigation, project creation, task completion/progress, persisted demo changes, internal site updates and client review validation. Live Google sign-in, studio creation, project/checklist creation, task completion/progress, deadline editing and material delivery were verified against the separate development backend. Per-user Google Drive authorization was also verified.

The source repository is public. Studio records and Drive files are stored in their respective services, not committed to GitHub. Demo data is fictional.
