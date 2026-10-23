# MediVault

MediVault is a pharmacy operations application built with plain HTML, CSS, and JavaScript, plus an Express/Mongoose API backed by MongoDB. The Express server also serves the frontend so the application can use one origin.

## Requirements

- Node.js 20 or later
- MongoDB configured as a replica set for transactional sales and stock receiving

## Setup

1. Install backend dependencies:

   ```sh
   cd backend
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and set `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, `INITIAL_ADMIN_EMAIL`, and a unique `INITIAL_ADMIN_PASSWORD` (10–128 characters). Keep `.env` private; it is excluded from Git.
3. Create the first Admin once:

   ```sh
   node scripts/seedAdmin.js
   ```

   The seed refuses to overwrite an account or create a second Admin. The initial account must change its password at first login.
4. Start the application from the repository root:

   ```sh
   npm run dev
   ```

   Open the configured preview at the backend port (5000 by default). For a production-style process, use `npm start`.
5. Register staff or supplier accounts from the shared login page, then approve them using an Admin account.

The app does not clear or seed operational data automatically. Back up the database before any manual data maintenance.

## Tests

Run `npm test` from the repository root, or `npm test` inside `backend/`. The current automated suite covers FEFO batch ordering, expiry-day boundaries, inactive/expired exclusions, and insufficient eligible stock. Transactional API workflows still require integration tests against a replica-set MongoDB instance.

## Backup and restore

Use MongoDB Database Tools and retain the archive securely:

```sh
mongodump --uri="$MONGO_URI" --archive=medivault.archive.gz --gzip
mongorestore --uri="$MONGO_URI" --archive=medivault.archive.gz --gzip
```

Restoring replaces or merges data depending on the options and target database; verify the target and backup before running a restore. Do not run restore commands against production without an approved recovery procedure.

## Current implementation boundaries

The existing application includes role-based login/approval, inventory, transactional sales with FEFO allocation, purchase records, supplier order status workflows, verified receipt, and report endpoints. GST rates are stored per medicine and must be verified for the pharmacy's jurisdiction. Restock receipts use the medicine's current purchase cost because this workflow does not yet collect an independently approved unit cost. Return/cancellation workflows, full historical-cost accounting, expanded analytics, and end-to-end concurrency/rollback tests remain unfinished; the application should not be treated as production-complete until those are implemented and validated.

See [API.md](API.md) for current route contracts and permissions.
