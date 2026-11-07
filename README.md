# LETSON POS & Inventory

LETSON is a Next.js POS and inventory system for managing customers, suppliers, products, bodega products, deliveries, slicing/production, sales, payments, inventory, users, and roles.

## Tech stack

- Next.js App Router
- React
- TypeScript
- MongoDB
- Mongoose
- NextAuth Credentials Provider
- Tailwind CSS / shadcn UI components

## Requirements

- Node.js 20 or newer
- MongoDB connection string
- npm

For transaction support, use MongoDB Atlas or a local MongoDB replica set. Single standalone MongoDB servers do not support multi-document transactions.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set these values:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/letson
NEXTAUTH_SECRET=replace-this-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000
SEED_ADMIN_PASSWORD=your-secure-admin-password
```

Seed the admin user and system roles:

```bash
npm run seed:admin
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Important security notes

- Do not commit your real `.env` file.
- Do not use a default admin password.
- Change `SEED_ADMIN_PASSWORD` after first setup.
- If you reset the admin password through the seed script, set `SEED_ADMIN_RESET_PASSWORD=true` temporarily, run the seed, then set it back to `false`.
- API routes should enforce permissions on the server, not only in the frontend.

## Core permission groups

- Dashboard
- Master Data
- Purchasing / Stock-In
- Production
- Sales
- Payments
- Inventory
- Reports
- System

## Main scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run seed:admin
```

## Deployment notes

See [Production release checklist](docs/production-release.md). Run
`npm run production:check` on the deployment server before release; this is a
read-only configuration and database check, not a business acceptance test.

Set `UPLOADS_DIR` to a persistent, writable directory outside the release
directory. Uploaded receipts and menu images are served through
`/api/uploads/...`. Back up this directory together with MongoDB.

Use `GET /api/health` as the readiness check. It returns HTTP 200 only when
MongoDB responds to a ping; otherwise it returns HTTP 503.

The application throttles repeated login failures. A reverse proxy such as
nginx or Caddy should also enforce request rate limits so protection survives
application restarts and scales across multiple instances.
