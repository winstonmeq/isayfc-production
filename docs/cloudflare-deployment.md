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

This repository currently uses a standard Next.js Node server, with no checked-in
Cloudflare adapter or Wrangler configuration. Fixing the missing variable does
not certify Workers compatibility. A full-stack deployment needs a supported
Next.js Workers adapter and Node.js compatibility enabled, not a static Pages
export. Verify the adapter against the installed Next.js version.

Uploads currently use persistent filesystem storage. Before migrating the
application runtime to Workers, adapt uploads to durable object storage such as
R2; an instance's local filesystem is not the existing server's persistent disk.
Verify MongoDB connectivity, authentication, transactions and receipt uploads
on a preview deployment before moving production traffic. An alternative is to
retain the existing Node server behind Cloudflare's DNS/proxy.
