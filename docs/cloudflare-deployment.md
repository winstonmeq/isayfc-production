# Cloudflare deployment configuration

The database connection helper validates MONGODB_URI when a request connects,
not when Next.js imports route modules during its build. A missing build-time
secret therefore does not cause route collection to fail. Runtime database
access still requires a real connection string; this change is not a database
fallback and does not embed credentials in the bundle.

Configure MONGODB_URI as an encrypted server-side secret in the deployed
Worker's Variables and Secrets settings. Also configure NEXTAUTH_SECRET and
NEXTAUTH_URL (the public HTTPS application URL). Never prefix database or auth
secrets with NEXT_PUBLIC_, put them in Git, or paste them into build logs.
Build variables and deployed Worker runtime secrets are separate settings.

The checked-in wrangler.jsonc targets isayfc-production. WORKER_SELF_REFERENCE
must match that name; it must not refer to the package name letson. The config
preserves dashboard variables (keep_vars), disables workers.dev/preview URLs,
and enables Node.js compatibility. It contains no database or auth secrets.

Cloudflare Workers Builds settings:

- Build command: leave empty (the deploy script builds first)
- Deploy command: npm run deploy:cloudflare
- Root directory: the repository root
- Use Node.js 24 LTS (set NODE_VERSION=24 in build variables if needed).

The deploy script explicitly runs OpenNext build before OpenNext deploy. This
creates the compiled OpenNext configuration and Worker bundle that next build
alone does not produce. If the dashboard requires a build command, npm run build
is harmless but redundant: the deploy script will build again. Crucially, change
the dashboard deploy command from npx wrangler deploy to npm run deploy:cloudflare.
Wrangler auto-detects OpenNext and delegates to its deploy command before custom
Wrangler build hooks can produce the missing compiled configuration; a custom
build hook is therefore not used here. Do not run OpenNext migrate on deployment.
Keep the checked-in package-lock.json and install with npm ci.

The existing npm run build / npm start commands still support the Node server.
The OpenNext configuration does not enable an R2 incremental cache; add that
separately if using persistent ISR/caching. Do not point the production domain
to the new Worker until preview/runtime checks pass. Dashboard domain routes
are not changed by this repository configuration.

Uploads currently use persistent filesystem storage. Before migrating the
application runtime to Workers, adapt uploads to durable object storage such as
R2; an instance's local filesystem is not the existing server's persistent disk.
Verify MongoDB connectivity, authentication, transactions and receipt uploads
on a preview deployment before moving production traffic. An alternative is to
retain the existing Node server behind Cloudflare's DNS/proxy.

If credentials were printed in a previous configuration-diff log, rotate the
MongoDB user's password and NEXTAUTH_SECRET before retrying production. Replace
the old plaintext runtime variables with encrypted secrets. Rotating the auth
secret signs out existing sessions. keep_vars prevents accidental removal of
dashboard variables; it does not encrypt existing plaintext variables.

Validation notes (2026-11-08): Next.js 16.4.5 compilation/type checking and the
unit suite pass locally. Full OpenNext packaging was blocked on Windows by an
EPERM symlink error; verify the complete bundle on Cloudflare's Linux builder.
OpenNext also warns that Node.js middleware support is experimental. Dependency
audit reports unresolved transitive advisories (including proxy-addr); review
these before treating the migration as production-ready. No forced dependency
downgrades or security-check bypasses were applied.
