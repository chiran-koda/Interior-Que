# Interior Que private photo storage setup

This setup is for **Interior Que Development (`interior-que-development`) only**. Do not open, select, generate keys for, deploy to, or change DesignQuote's Firebase project. There are no real user files to migrate.

The code is ready for configuration; a live R2 bucket and Worker have **not** been activated by this change. Google Sign-In remains for authentication only. No Drive connection, API client ID, storage login or permission screen is needed by supervisors.

## 1. Review costs before activation

Cloudflare requires an R2 subscription checkout even though Standard storage includes free usage. **Stop and obtain the owner's explicit approval before completing that checkout or enabling any paid plan.** No Workers Paid, Cloudflare Images, Firebase Blaze, Firebase Storage, Cloud Functions, Firestore TTL, backups or other paid services are required by this implementation.

At the time of implementation (11 October 2026), R2 Standard includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month for the entire Cloudflare account. Usage beyond the included amount is metered: $0.015/GB-month, $4.50/million Class A and $0.36/million Class B, with billing-unit rounding. Internet egress from R2 is free. These are account totals, **not allowances per company**. Use Standard rather than Infrequent Access. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [R2 subscription setup](https://developers.cloudflare.com/r2/get-started/).

Workers Free currently includes 100,000 requests per day and a 10 ms CPU limit per invocation. The service uses native Web Crypto, streams and an R2 binding. Do not switch to a paid Worker plan automatically if limits are reached; measure and ask the owner. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

The app's 1 GB quota is a per-company product limit, not a guarantee of a zero Cloudflare bill. Multiple companies and operation traffic can exceed account-wide allowances. Monitor Cloudflare storage/operations and configure available billing notifications. Budget alerts are notifications, not hard spending caps.

## 2. Create the private R2 bucket (after approval)

1. Sign in to your Cloudflare account. Open **Storage & databases → R2 → Overview**.
2. Complete subscription checkout only after the approval described above.
3. Create a **Standard** bucket named `interior-que-photos-dev`. Choose the desired jurisdiction/location for the firm's data.
4. Keep **Public Development URL (`r2.dev`) disabled**. Do not add a public custom domain.
5. Keep the name in `worker/wrangler.jsonc` aligned with this bucket.

Browsers upload through the Worker, not directly to the bucket. No bucket CORS rule or S3 API key is needed. The Worker has a private `PHOTOS` binding to this bucket. Do not enable public access to make images load.

## 3. Create a dedicated development database identity

1. In Google Cloud, verify the selected project is exactly **Interior Que Development / `interior-que-development`**.
2. Open **IAM & Admin → Service Accounts**. Create `interior-que-photo-worker` in this development project only.
3. Grant **Cloud Datastore User (`roles/datastore.user`)** on this development project. Do not grant Owner/Editor and do not grant access to DesignQuote.
4. Generate a JSON key for this identity. Treat it as a private credential. Keep it outside this repository and never paste it in chat, GitHub variables, frontend environment files or source code.
5. If key creation is blocked by your organization's policy, ask its administrator for an approved credential approach. Do not disable security policy or attach billing to work around it.

This server identity uses Firestore IAM and bypasses client Security Rules. Therefore the Worker explicitly checks verified Firebase tokens, active company membership, project assignments and client visibility. Both the Worker and service-account parser are pinned to `interior-que-development`; another project is rejected.

## 4. Configure the Worker and its private secrets

From the `interior-que-github` checkout:

```text
npm ci
npx wrangler login
```

Review `worker/wrangler.jsonc`:

- `FIREBASE_PROJECT_ID`: keep `interior-que-development`.
- `PHOTOS` bucket binding: keep the private bucket from step 2.
- `ALLOWED_ORIGINS`: comma-separated exact origins, including `https://chiran-koda.github.io`. Local testing uses `http://127.0.0.1:5174` or `http://127.0.0.1:5173`. No wildcard origin.
- `DEFAULT_COMPANY_QUOTA_BYTES`: `1000000000` (1 decimal GB).
- Hourly cleanup trigger: keep `17 * * * *` for abandoned upload reservations.

Store these **Worker secrets**, using the interactive prompt, not a command-line value:

```text
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --config worker/wrangler.jsonc
npx wrangler secret put URL_SIGNING_SECRET --config worker/wrangler.jsonc
```

For `FIREBASE_SERVICE_ACCOUNT`, enter the development service account's JSON as one line. For `URL_SIGNING_SECRET`, generate and enter at least 32 random bytes using a password manager. Do not reuse a password or a Firebase API key. [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) are stored separately from source. Commands may create the Worker shell if it does not yet exist; retain the Free plan. Local `.dev.vars` is ignored by Git if a developer needs local credentials; never check it in.

Run the checks before the first deployment:

```text
npm test
npm run check:worker
npm run test:rules
npm run build
npm run build:worker
```

Then, after the R2 activation approval and secret configuration, deploy:

```text
npx wrangler deploy --config worker/wrangler.jsonc
```

Record its HTTPS `workers.dev` URL. A paid Worker plan must not be enabled as part of this step without separate approval.

## 5. Apply only Interior Que development database rules

The changed rules make `files`, `photoUploads`, `photoStorage`, and cleanup bookkeeping server-controlled. App users cannot create metadata, set object keys or change counters/quotas. Existing role restrictions still govern reading published metadata.

```text
npx firebase deploy --only firestore --project interior-que-development
```

Never use a default-project shortcut or select DesignQuote. Test rules locally first. The checked-in indexes continue to support client queries for project/visibility. The cleanup queue uses a normal single-field index on `expires` and does not use paid Firestore TTL.

## 6. Connect GitHub Pages to the Worker

1. In **chiran-koda/Interior-Que → Settings → Secrets and variables → Actions → Variables**, add the public repository variable `VITE_PHOTO_API_URL` with the Worker's HTTPS URL.
2. **Do not put either Worker secret in GitHub Pages or any `VITE_` variable.** The Worker URL is a public endpoint, not a credential.
3. Run the **Publish Interior Que** workflow manually. The workflow includes application, Worker type and Firestore rule checks.
4. Open the app and use **Update app** when offered.

For local frontend testing, put only `VITE_PHOTO_API_URL` in `.env.local` and restart the development server. If it is absent, the app clearly says company photo storage is awaiting setup and does not pretend an upload was saved.

## 7. Test the complete development flow

1. Sign in with Google, create a development company and project, then invite a supervisor to that project.
2. As supervisor, choose **Upload photos**, select the project and room, and pick several JPEG/PNG/WebP photos. The app resizes to a maximum 2,000 pixel long edge, re-encodes WebP (JPEG fallback), removes original EXIF/GPS metadata and uploads two photos at a time.
3. Verify progress and a **Saved to project** result for each photo. Disconnect during one upload, reconnect, and retry. The existing photo ID is reused and completed photos are not counted twice.
4. Check `companies/{companyId}/projects/{projectId}/photos/{photoId}.webp` (or `.jpg`) in R2 and the corresponding `files/{photoId}` document in Firestore. Only metadata is in Firestore; no permanent signed URLs or photo bytes are stored there.
5. Verify company used/reserved bytes in `interiorQueCompanies/{companyId}/photoStorage/current`.
6. Sign in as an unassigned person or paused member and verify denial. As the client, verify team-only photos are hidden and explicitly shared photos are visible. Clients cannot upload or edit storage.
7. Open a photo, revoke project access, and request the viewing URL again: access must be denied. A previously issued viewing URL is also rechecked against current membership. Links expire after 60 seconds and are bearer links during that period; do not put them in messages or logs.
8. Test the company storage limit with a small limit in the development company before restoring 1 GB. Rejected/partial uploads must not appear as saved photos.
9. Verify the hourly cleanup removes abandoned objects and releases reserved bytes after 24 hours. Cleanup retries late/orphan removal for an additional day.

Source photos up to 40 MB are accepted for client resizing; compressed uploads are capped at 5 MB. Unsupported HEIC files get a clear request to export as JPEG. An interrupted batch is retryable while the upload dialog remains open; reload requires selecting the unsaved photos again. The server holds reservations for 24 hours and releases abandoned space through cleanup. Keep that scheduled trigger enabled.

## Company quota configuration

New companies start with `DEFAULT_COMPANY_QUOTA_BYTES=1000000000`. At the first reservation, the Worker creates:

```json
{ "quotaBytes": 1000000000, "usedBytes": 0, "reservedBytes": 0 }
```

For an existing company, an authorized development administrator can change **only `quotaBytes`** on `interiorQueCompanies/{companyId}/photoStorage/current`, using the Firebase console or an approved server administration tool. Leave counters intact. Changing the Worker default affects new storage documents; it does not override existing company quotas. Ordinary app users, including owners, cannot self-increase a quota.

Reservation and finalization counters are atomic Firestore transactions. The server validates exact size, checksum and actual JPEG/WebP dimensions before writing to R2. Objects cannot be overwritten with different content using an old upload link. No delete or storage-upgrade purchase flow is implemented here; quota changes require administration, and no paid service is purchased automatically.

## Firebase billing implications

**Firebase Blaze is not required by this design.** Google Sign-In stays in the existing development Firebase Authentication setup. Photo bytes are in R2; Firebase Storage and Firebase Cloud Functions are not used. Firestore holds metadata, memberships, pending upload records and company counters.

Firestore's current free quota is 1 GiB database storage, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day and 10 GiB outbound transfer/month, for one free database per project. Those limits are shared across all companies in this project, not per company. The 1 GB R2 company allowance is separate from Firestore's 1 GiB database allowance. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) and [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Each first reservation writes three documents; successful finalization writes four. Membership/project checks, transactions, gallery subscriptions, view authorization and hourly cleanup add reads and sometimes retries. Viewing photos serves image bytes through R2, but still reads authorization/metadata from Firestore. On Spark, exceeding quotas can interrupt operations; do not auto-upgrade. On a future approved Blaze plan, usage beyond free quotas is billed. Enabling Google Cloud billing can automatically upgrade a Firebase project to Blaze, so do not link a billing account for this setup.

No live R2 upload is claimed as verified until the deployment checklist above is completed. Automated service tests use an isolated in-memory database/bucket; Firestore rule tests use the local emulator. They never write to DesignQuote.
