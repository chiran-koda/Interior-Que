# Interior Que — Project Management

A responsive React + TypeScript progressive web app for interior studio operations. Built with Vite, Recharts, IndexedDB, and a generated Workbox service worker. Uses direct Google Identity Services authorization with the `drive.file` scope; no OAuth secrets or access tokens are saved to disk.

## Run

Use Node 22.12 or later. Run `npm install`, `npm run dev`, `npm test`, and `npm run build`. Serve `dist` over HTTPS. Development preview is at http://127.0.0.1:5173.

## Google Drive setup

1. Enable Google Drive API in your Google Cloud project.
2. Configure the consent screen and test users, or complete Google’s required publishing process.
3. Create a Web application OAuth client. Add the exact JavaScript origins `https://chiran-koda.github.io` and `http://127.0.0.1:5173`. An OAuth origin does not include the `/interior-que/` path.
4. Set the public client ID through the app’s Settings, or use `VITE_GOOGLE_CLIENT_ID` when building. No client secret is needed for this browser token flow.
5. Connect Drive. Each account gets a separate local workspace. Start a new workspace or explicitly import the local workspace in Settings.
6. Add files to a project, then choose **Sync uploads**. Files are created in `Interior Que / Project name` with stable project IDs and metadata. Access tokens expire; reconnect to continue.

Uploads are stored as blobs in IndexedDB before syncing. Failed uploads remain queued. Retry looks up the unique attachment ID to avoid a duplicate after an uncertain response. Drive uploads are bounded at 25 MB per file. Drive files are private; the app never makes them public.

## Workflows

- Projects and clients: create/edit records, search, filter, grid/list layouts and detail panels.
- Estimation: room-wise quantities, material specifications, rates, GST and discounts; printable A4 quotation.
- Payments: record receipts and expenses; calculations derived from transactions; CSV export.
- Purchases and inventory: order status, material rates, stock levels, reorder shortcuts and exports. Delivery changes and stock adjustments are separate explicit actions.
- Site progress: board/list tasks, assignments, priorities, due dates, mark complete and calculated project progress.
- Team: assignment roster and derived workload, without account invitations.
- Documents: local file queue, project galleries, Drive refresh and download.
- Reports: derived financial summaries and printable reports.
- Settings: studio details, install guidance, Drive connection, backup and restore, local JSON export/import.

## Persistence and scope

This release is an offline-first personal workspace. Structured records are saved on the current device, separately for each connected Google account. Drive backup and restore explicitly move records between devices; uploads sync separately. It does **not** provide shared simultaneous team editing, role-based permissions, background token refresh, automatic multi-device database synchronization, email/WhatsApp sending, invoice issuance, or forecasted profit. A shared production studio should add an authenticated backend with membership rules and conflict resolution before enabling these capabilities.

Never clear browser storage before queued files are uploaded and records backed up. JSON backups include file metadata and Drive links, not unsynced binary files. Restore saves the previous workspace under `<account-id>-before-restore` in the IndexedDB workspaces store.

PWA installation requires a secure origin and browser support. The service worker precaches the app shell, fonts, icons and local sample photos. Google authorization and Drive access require connectivity. Access tokens are kept only in memory. Sample imagery is from Unsplash and is marked as reference photography; sample clients use example.com addresses.

## GitHub Pages deployment

The live app is published at `https://chiran-koda.github.io/Interior-Que/`. `.github/workflows/pages.yml` tests and builds every push to `main`, then deploys using the official GitHub Pages actions. Set the repository's Pages source to **GitHub Actions**. Builds use `VITE_BASE_PATH=/Interior-Que/`; local development uses `/`. Fonts, photos, icons, the manifest, and the service worker respect that base path.

GitHub Pages serves the app publicly. Project data is stored in each browser, separately for connected Google accounts; it is not committed to this repository. Publishing does not add multiuser cloud storage or team sign-up.

Hosting origins have separate browser storage. Export your records from the former preview before moving to GitHub Pages, then import them in Settings. Unsynced binary attachments must be uploaded to Drive from the old origin first. Existing storage and Drive metadata keys retain the legacy internal prefix for compatibility; the displayed app name, new folder names, and installation branding are Interior Que.

## Verification

Run `npm test` for financial consistency, quote calculations, backup validation and mocked Drive request isolation/idempotency. A live Drive upload requires the configured OAuth client and user consent; mocked tests do not establish live Google authorization.
