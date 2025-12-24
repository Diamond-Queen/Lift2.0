# Lift 2.0

## Overview
Lift 2.0 is a Next.js application providing AI-assisted career and study tooling (resume/cover letter generation, note summarization, flashcards) with user accounts backed by Prisma/PostgreSQL.


Tip: You can use a free managed Postgres from Neon or Supabase. See "Database Setup" below.
## Stack
- Next.js (Pages router)
- NextAuth (database sessions via Prisma adapter)
- Prisma (PostgreSQL)
- Tailwind / PostCSS for styling
- **AI Providers** (resilient tiered fallback):
  - Primary: Template-based generation (never fails)
  - Fallback: OpenAI (gpt-4o-mini)
  - Last resort: Anthropic (Claude 3.5 Sonnet)

## Prerequisites
- Node.js 18+

Notes
- `.env.local` overrides shell exports at runtime in many scripts (we also load `.env` in node scripts with override).
- If you exported a placeholder `DATABASE_URL` in your shell, unset it to avoid conflicts: `unset DATABASE_URL`.
- PostgreSQL database (reachable via `DATABASE_URL`)

## Environment Variables
Create a `.env.local` (never commit) with:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
NEXTAUTH_SECRET=your-long-random-secret
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # Optional but recommended for fallback
LOG_LEVEL=info

### Database Setup (Neon)
You can provision a free Postgres with Neon (no Docker required):
- Create a project at https://neon.tech and copy the connection string (example):
	`postgresql://USER:PASS@HOST.neon.tech:5432/DB?sslmode=require`
- Put it into `.env.local` as `DATABASE_URL=...`
- Apply migrations:
```bash
npx prisma migrate deploy
```

If you prefer the CLI, use `npx neonctl@latest` to list orgs, projects, branches, and fetch a connection string.
```


### School Codes
There is a JSON file and a sync script to upsert school codes into the DB.
- Copy the example to a local file (not committed):
```bash
cp data/schoolCodes.example.json data/schoolCodes.json
```
- Edit `data/schoolCodes.json` (use `schoolName` keys).
- Sync to the database (default path is `data/schoolCodes.json`):
```bash
node scripts/sync_school_codes.js
```
- Or provide a custom path:
```bash
node scripts/sync_school_codes.js ./path/to/my-codes.json
```
The script uses `DATABASE_URL` from `.env` (override=true) and performs transactional upserts.

### Stripe Subscriptions
For individual subscription payments (Career Only $9/mo, Full Access $10/mo):
1. Create Stripe account at https://dashboard.stripe.com
2. Create products and get Price IDs
3. Add keys to `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CAREER=price_...
STRIPE_PRICE_FULL=price_...
```
4. Run migration: `npx prisma migrate dev --name add_subscription_user_link`
5. For local testing: `stripe listen --forward-to localhost:3000/api/subscription/webhook`

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for detailed instructions.

### Redeem Verification (CLI)
To simulate the redeem flow without NextAuth:
```bash
node scripts/verify_redeem_flow.js <CODE> <EMAIL>
```
Behavior:
- First run redeems the code and assigns the user to the code's school.
- Second run with the same code fails with `already_redeemed`.
## Install & Run
```bash
npm ci
npm run dev
```

Sensitive files are ignored by `.gitignore` (`.env*`, `.envrc`, `.npmrc`, `.vercel/`, key/cert file extensions, `.ssh/`). Never commit secrets.
Visit: http://localhost:3000

## Database / Prisma
```bash
npx prisma migrate status --schema=prisma/schema.prisma
npx prisma migrate dev --name init --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
```
Seeding (if provided):
```bash
node prisma/seed.js
```

## Tests / Lint
```bash
npm run lint
# (Add test script once tests are implemented)
```

## Security & Hardening
- Rate limiting currently in-memory (replace with Redis in production).
- CSP, CORP, COOP, COEP headers set via `lib/security.js`.
- Passwords hashed with Argon2 (tuned parameters).
- Account lockout after repeated failed logins.

**Please review [SECURITY_POLICY.md](./important/SECURITY_POLICY.md) for security information and responsible disclosure.**

## Legal & Compliance
**Please review [LEGAL_NOTICE.md](./important/LEGAL_NOTICE.md) for licensing and legal information.**

## Logging
Structured JSON logs via `lib/logger.js`. Adjust verbosity with `LOG_LEVEL`.

## Common Issues
- Schema not found: ensure commands run from project root and pass `--schema=prisma/schema.prisma`.
- OPENAI_API_KEY missing: resume/cover endpoints will throw explicit error.
- ESM/CJS Prisma dev patch: `postinstall` script applies safe shim to `@prisma/dev` when needed.

## Scripts
- `postinstall`: applies Prisma dev require shim.

## Contributing
1. Branch from `main`
2. Add focused changes
3. Run lint & (future) tests
4. Submit PR with description

## Roadmap
- Redis-based rate limiting
- Test coverage for auth & AI endpoints
- CI workflow (GitHub Actions)
- Extended validation via Zod

---
This README will evolve as testing/CI and additional features are added.
