# Production release

This checklist prepares a release; it is not certification that financial reports or every business workflow are correct. Database integration tests remain unverified unless run successfully in isolation. Do not run test/reset scripts against live records.

## Before release

- Take a database snapshot and back up the persistent uploads directory. Verify a restore procedure and retain the previous application release.
- Use the existing production database, not `letson_business_test`. Remove BUSINESS_TEST_MODE and MONGODB_DB_NAME test overrides. No test database permission is needed for production.
- Set NEXTAUTH_URL to the public HTTPS website, and use a strong stable NEXTAUTH_SECRET. Never publish these credentials. Do not rotate the secret at every restart.
- Set UPLOADS_DIR to an absolute persistent directory outside the release folder. Create it and grant the service account read/write permission. Back it up with MongoDB.
- Disable SEED_ADMIN_RESET_PASSWORD. Review active users, roles and outlet assignments. Do not rerun seeds/reset scripts during routine deployment.

## Verify and build on the production server

```bash
npm ci
npm run production:check
npm test
npm run build
```

`production:check` is read-only. It checks environment configuration, upload directory permissions, database connectivity, transaction-capable topology and existence of an active user. It does not prove MongoDB write privileges, indexes, full workflow correctness, backups or HTTPS proxy configuration. Resolve blockers before deployment.

## Run

Run `npm start` using your service manager with NODE_ENV=production. Use HTTPS via nginx/Caddy, proxy to the private application port, and firewall the application port from the public internet. Apply login/request rate limits at the proxy. Keep uploads on persistent storage.

Build in a separate release directory; do not rebuild the running release's `.next` directory. Stop the old process gracefully, switch the release, and start the new process. Initially use one app instance. If running multiple instances, use the same build artifact and authentication secret; configure shared Server Action encryption keys and cache coordination as described in the installed Next.js self-hosting guide. Reload old browser tabs after deployment if they retain stale Server Action IDs.

Check `/api/health` returns HTTP 200. Sign in as administrator and cashier; verify navigation and outlet restrictions, inventory balances, report visibility and print preview. Do not insert fake transactions into the live database. During a supervised first real transaction, compare receiving, slicing/production inputs and outputs, sale, delivery acceptance, COGS, payment and reports against the source documents before further rollout.

If verification fails, pause new entry and restore the previous application release. Do not restore an old database over newer real transactions without a reviewed recovery plan.

## Known verification limit

Automated unit tests and a successful build are not a full accounting/business acceptance test. Without an isolated database, the end-to-end database tests remain skipped. Monitor the initial rollout and reconcile real records daily.
