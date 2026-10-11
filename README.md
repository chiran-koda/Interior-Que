# Interior Que

Project management for interior firms: owners, designers, supervisors and clients. React + TypeScript PWA on GitHub Pages; Google Sign-In and project metadata use the isolated **Interior Que Development** Firebase project.

App: [Interior Que](https://chiran-koda.github.io/Interior-Que/)

## Project photos

The unfinished Google Drive integration and its earlier personal-workspace entry point have been removed. Google authentication requests no Drive scope. No files need migration.

Supervisors choose a project and room, select up to 20 photos, and upload. Images are resized to a maximum 2,000 pixel long edge and re-encoded as WebP/JPEG. Each photo shows progress, success or an actionable error with retry. Two uploads run concurrently. Retries reuse stable IDs and compressed bytes.

Private Cloudflare R2 objects are organized as `companies/{companyId}/projects/{projectId}/photos/{photoId}.webp` or `.jpg`. A Cloudflare Worker provides signed upload URLs (5 minutes) and signed viewing URLs (60 seconds). These are application-signed Worker URLs backed by the private R2 binding, not public bucket or S3 URLs. No R2 access keys are needed in the browser.

The Worker verifies Firebase ID tokens, active membership and project access on the server. Clients can only view explicitly shared photos, and cannot upload or change quota. Access is rechecked on every image view. Firestore stores metadata, quota counters and temporary reservations; no photo bytes or permanent signed URLs. New companies start at **1,000,000,000 bytes (1 GB)**, configurable by the service default or a server-administered company quota.

Exact size, content hash and actual encoded dimensions are verified before storing an upload. Atomic reservations prevent concurrent uploads from exceeding quota. Finalization counts bytes once. Hourly cleanup releases abandoned reservations after 24 hours and removes their orphan objects. R2 is private, with `r2.dev` and public custom domains disabled.

**Live R2 storage is awaiting setup. No Cloudflare subscription, bucket, Worker secrets or paid services were activated.** Until the public Worker URL is configured, the app clearly shows that company storage setup is pending. The demo can resize and save photos on the current device for UI verification.

Follow the complete [Cloudflare setup and Firebase billing guide](docs/CLOUDFLARE_SETUP.md). It covers owner approval before R2 checkout, a private bucket, a dedicated development service account, Worker secrets, deployment, GitHub Pages configuration and live acceptance checks.

## Company workflows and isolation

Owners create studios and projects with a five-step checklist, invite people by Google email and assign projects. Designers and supervisors manage assigned tasks, materials, updates and approvals. Clients see assigned projects and published updates/photos/decisions. Money and membership management remain owner-only. Invitations are saved in the app; no email is sent automatically.

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
