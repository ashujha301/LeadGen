# leadGen-demo

Evidence-backed lead intelligence that turns a company domain into ranked decision-makers, employment relationships, source citations, and CSV-ready outreach data.

## Features

- **Domain search** — submit a company domain with optional ICP filters and target roles.
- **Pipeline worker** — Playwright discovery, AI extraction, entity resolution, enrichment, and deterministic scoring via `pg-boss`.
- **Ranked leads** — TanStack Table with score, confidence, contactability, and key reason.
- **Lead detail** — score breakdown, evidence excerpts, employment timeline, and Cytoscape relationship graph.
- **Relationship intelligence** — shared-employment overlap search and local graph visualization.
- **CSV export** — download ranked leads for a completed run.
- **Public demo protections** — IP-hashed quotas, rate limits, SSRF guards, and read-only entity review.

## Requirements

- Node.js 24+
- pnpm 9+
- PostgreSQL 16+ (local Docker or Neon)

## Quick start

```bash
# Clone and install
git clone https://github.com/ashujha301/LeadGen.git
cd LeadGen
pnpm install

# Configure environment
cp .env.example .env
# Edit DATABASE_URL and OPENAI_API_KEY

# Start PostgreSQL (optional — or use Neon)
docker compose -f infra/docker/compose.local.yml up -d postgres

# Run migrations and seed demo data
pnpm db:migrate
pnpm db:seed

# Start web + worker
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for structured extraction |
| `OPENAI_MODEL` | No | Default `gpt-5.4-mini` |
| `IP_HASH_SALT` | Yes | Salt for hashing client IPs |
| `PUBLIC_RUN_LIMIT_PER_IP_DAY` | No | Default `3` |
| `PUBLIC_GLOBAL_RUN_LIMIT_DAY` | No | Default `50` |
| `PUBLIC_ACTIVE_RUNS_PER_IP` | No | Default `1` |
| `CRUSTDATA_API_KEY` | No | Optional enrichment provider |
| `EMAIL_VERIFIER_API_KEY` | No | Optional email verification |

See `.env.example` for the full list.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js web and worker concurrently |
| `pnpm build` | Build all workspace packages |
| `pnpm typecheck` | TypeScript check across monorepo |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests (requires `DATABASE_URL` for pg-boss) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo fixture data |

### Optional smoke tests

```bash
RUN_SMOKE=true SMOKE_DOMAIN=example.com APP_URL=http://localhost:3000 \
  vitest run tests/smoke/live-domain.test.ts
```

## Architecture overview

```text
Browser → Next.js (API + UI)
              ↓
         PostgreSQL ← Drizzle ORM
              ↑
         pg-boss queue
              ↑
         Worker (Playwright pipeline)
              ↓
         OpenAI Structured Outputs
```

See [docs/architecture.md](./docs/architecture.md) for component boundaries and data flow.

## Project structure

```text
apps/
  web/          Next.js App Router, API routes, React UI
  worker/       Playwright crawler and pipeline stages
packages/
  contracts/    Zod schemas and shared types
  db/           Drizzle schema, migrations, repositories
  domain/       Normalization, entity resolution, confidence
  scoring/      Deterministic lead scoring
  ai/           OpenAI client and prompts
  connectors/   External data providers
  search/       Natural language search and graph builders
tests/
  unit/         Pure logic tests
  integration/  API validation, pagination, quota, pg-boss
  e2e/          Playwright UI flows
  smoke/        Optional live domain checks
docs/           Architecture, scoring, runbook, submission
infra/          Docker, Terraform, Nginx, deploy scripts
```

## Pages

| Route | Purpose |
|---|---|
| `/` | Domain search, natural language search, recent runs |
| `/runs/[runId]` | Pipeline progress, ranked leads, CSV export |
| `/leads/[leadId]` | Score breakdown, evidence, timeline, graph |
| `/companies/[companyId]` | Canonical company profile |
| `/people/[personId]` | Person profile, contacts, employment |
| `/connections` | Shared-employment overlap search |
| `/review` | Read-only ambiguous entity matches |

## Deployment

Production deployment uses Docker Compose on a GCP Compute Engine VM with Nginx, Artifact Registry, and Terraform. See [docs/runbook.md](./docs/runbook.md).

```bash
# Verify deployment health
pnpm verify:deployment
```

## Documentation

- [Architecture](./docs/architecture.md)
- [Design system](./docs/design-system.md)
- [Scoring](./docs/scoring.md)
- [Data sources](./docs/data-sources.md)
- [Runbook](./docs/runbook.md)
- [Submission guide](./docs/submission.md)
- [Production roadmap](./docs/production-roadmap.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)

## Ethical collection

- Respects `robots.txt` with a transparent user agent.
- Crawls only same-registrable-domain pages with strict page, depth, and timeout limits.
- Blocks SSRF to internal networks.
- Stores excerpts and structured observations, not full HTML, in PostgreSQL.
- Optional enrichment providers are feature-flagged and degrade gracefully.

## License

[MIT](./LICENSE)
