# LeadGen Demo

LeadGen Demo turns a company domain or website URL into evidence-backed sales intelligence. It discovers relevant pages, extracts people and company data, resolves duplicate entities, enriches public professional data, scores decision-makers, and presents ranked leads with supporting evidence.

## Core Features

- **Company search** - accepts a bare domain or a complete `http://` or `https://` website URL.
- **Dynamic discovery** - checks the homepage, sitemap, robots directives, and discovered same-domain links instead of relying on a fixed page list.
- **Structured extraction** - uses Playwright and OpenAI Structured Outputs to extract company, person, employment, and business-signal observations.
- **Entity resolution** - normalizes domains, names, profile URLs, companies, people, and employments while preventing duplicate canonical records.
- **Professional-data enrichment** - optionally uses Crustdata for company details, LinkedIn URLs, headcount, industry, people, and employment timelines.
- **Deterministic scoring** - ranks leads using ICP fit, decision authority, experience, business signals, contactability, and evidence quality.
- **High Value Leads** - groups qualifying leads by company and exposes company context, LinkedIn data, experience metrics, and complete employment timelines.
- **Natural-language search** - searches stored leads, timelines, and employment connections using validated search intents, clarification questions, and safe widening options.
- **Potential Connections** - identifies high-value leads whose employment periods overlapped at the same employer, with separate relationship-strength and evidence-quality scores.
- **Live run progress** - streams pipeline status and newly resolved leads through server-sent events.
- **Evidence and export** - provides source excerpts, score explanations, relationship graphs, and CSV export.
- **User isolation and demo protection** - applies Google OAuth, ownership checks, rate limits, quotas, SSRF protection, and hashed client-IP accounting.

## Lead Discovery Workflow

1. Submit a company domain or full website URL.
2. Optionally select target industries, locations, seniorities, functions, and custom job titles.
3. Follow progress through `queued`, `discovering`, `extracting`, `resolving`, `enriching`, `scoring`, and `completed`.
4. Review target matches or all discovered people as they are resolved.
5. Open a lead to inspect its score, confidence, evidence, contacts, and employment timeline.
6. Export completed run results as CSV.

Runs can be canceled while queued or active. Re-running a previously searched company creates a refresh that reuses canonical entities and updates observations, enrichment, freshness, and scores.

## High Value Leads

A lead qualifies for the High Value Lead views when it belongs to the signed-in user and meets the current score policy:

- Final score of at least `50`.
- Confidence of at least `0.50`.
- Score version `2`.
- Non-stale canonical person and lead records.
- A known LinkedIn profile.
- A completed source run.

The company view includes company name, domain, industry, location, headcount, company LinkedIn URL, and all qualifying people. Person details include current role, score, confidence, total experience, leadership experience, LinkedIn URL, and employment history.

## Natural-Language Search

Natural-language search operates only on data owned by the signed-in user. OpenAI converts the question into a validated search intent; the application resolves entities and executes predefined query builders. The model does not receive database credentials and does not generate or execute arbitrary SQL.

Supported result modes:

- **Leads** - role, seniority, company, minimum or maximum score, confidence, business signal, dates, and sorting.
- **Timelines** - person name, current company, previous company, total experience, and employment history.
- **Connections** - shared employer, person, company pair, and minimum overlap duration.

Example queries:

```text
Chief Technology Officers at OutcomesAI with score above 55
Show Siddalingamurthy BG's employment timeline from OutcomesAI
Show high-value founders who previously worked at Groww
Find connections between leaders at Ringg AI and Credit Dharma
```

If a person, company, role, or relationship is ambiguous, the API returns `needs_clarification` with selectable answers and an optional custom answer. A successful search returns `completed`. A valid search with no matches returns `no_results` with explicit widening options that are never applied without user approval.

## Potential Connections

Potential Connections is designed as a warm-introduction signal, not proof that two people directly worked together. It only evaluates the signed-in user's canonical High Value Leads and compares their dated employment histories.

For each candidate pair, the feature:

- Resolves shared employers using provider IDs, domains, LinkedIn company URLs, canonical company IDs, and normalized names.
- Calculates the intersection of the two employment date ranges.
- Scores relationship strength from overlap duration, role proximity, joining cohort, recency, and repeated shared-employer context.
- Scores evidence quality independently from employer identity quality, complete dates, and provenance freshness.
- Labels strength as `strong`, `moderate`, or `weak` and evidence as `strong`, `supported`, or `limited`.
- Shows list and graph views with the exact roles, dates, overlap duration, and reason codes used for the result.

The Connections page reflects newly completed runs automatically because results are calculated from the latest qualifying leads and employment provenance. Filters include current company, shared employer, strength band, minimum overlap days, limited-evidence inclusion, and result limit.

## Requirements

- Node.js 24+
- pnpm 9+
- PostgreSQL 16+ through local Docker or a hosted provider such as Neon
- Chromium for Playwright discovery
- Google OAuth credentials
- OpenAI API key
- Crustdata API key for optional company, LinkedIn, and timeline enrichment

## Local Setup

```bash
git clone https://github.com/ashujha301/LeadGen.git
cd LeadGen
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

cp .env.example .env

# Optional when not using hosted PostgreSQL
docker compose -f infra/docker/compose.local.yml up -d postgres

pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

For local Google OAuth, configure this redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

`pnpm db:seed` is optional when testing with existing data.

## Environment Variables

Start from `.env.example`. Never commit real secret values.

### Application and authentication

| Variable               | Required | Description                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `NODE_ENV`             | No       | Runtime environment; defaults to development locally.            |
| `APP_URL`              | Yes      | Public application origin, such as `http://localhost:3000`.      |
| `PORT`                 | No       | Web port; defaults to `3000`.                                    |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string.                                    |
| `AUTH_SECRET`          | Yes      | Auth.js signing secret. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID`     | Yes      | Google OAuth client ID.                                          |
| `GOOGLE_CLIENT_SECRET` | Yes      | Google OAuth client secret.                                      |
| `IP_HASH_SALT`         | Yes      | Secret salt used to hash client IPs.                             |
| `TRUSTED_PROXY_HOPS`   | No       | Number of trusted reverse-proxy hops; production default is `1`. |

### OpenAI

| Variable                   | Required | Description                                                                           |
| -------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`           | Yes      | Structured extraction, natural-language intent parsing, explanations, and embeddings. |
| `OPENAI_MODEL`             | No       | Structured-output model; example default is `gpt-5.4-mini`.                           |
| `OPENAI_EMBEDDING_MODEL`   | No       | Embedding model; example default is `text-embedding-3-small`.                         |
| `OPENAI_MAX_OUTPUT_TOKENS` | No       | Maximum output tokens per structured request.                                         |
| `OPENAI_TIMEOUT_MS`        | No       | OpenAI request timeout in milliseconds.                                               |

### Crustdata and enrichment

| Variable                       | Required     | Description                                        |
| ------------------------------ | ------------ | -------------------------------------------------- |
| `ENABLE_CRUSTDATA`             | No           | Set to `true` to enable Crustdata calls.           |
| `CRUSTDATA_API_KEY`            | When enabled | Crustdata API key.                                 |
| `CRUSTDATA_API_BASE_URL`       | No           | Crustdata API origin.                              |
| `CRUSTDATA_API_VERSION`        | No           | Requested Crustdata API version.                   |
| `CRUSTDATA_COMPANY_RPM`        | No           | Company-enrichment request limit per minute.       |
| `CRUSTDATA_PERSON_SEARCH_RPM`  | No           | Person-search request limit per minute.            |
| `CRUSTDATA_PERSON_ENRICH_RPM`  | No           | Person-enrichment request limit per minute.        |
| `CRUSTDATA_CACHE_TTL_HOURS`    | No           | In-process response-cache lifetime.                |
| `CRUSTDATA_TIMEOUT_MS`         | No           | Company and search request timeout.                |
| `CRUSTDATA_PEOPLE_TIMEOUT_MS`  | No           | Person-enrichment request timeout.                 |
| `CRUSTDATA_MAX_PEOPLE_PER_RUN` | No           | Maximum people sent for enrichment per run.        |
| `ENABLE_EMAIL_VERIFIER`        | No           | Enables the optional email verification connector. |
| `EMAIL_VERIFIER_API_KEY`       | When enabled | Email verifier API key.                            |

### Pipeline and crawl controls

| Variable                        | Required | Description                                       |
| ------------------------------- | -------- | ------------------------------------------------- |
| `AI_EXTRACTION_CONCURRENCY`     | No       | Concurrent structured page extractions.           |
| `RESOLUTION_CONCURRENCY`        | No       | Concurrent entity-resolution operations.          |
| `PERSON_ENRICHMENT_CONCURRENCY` | No       | Concurrent person-enrichment operations.          |
| `CRAWL_MAX_SUCCESSFUL_PAGES`    | No       | Maximum successfully processed pages per run.     |
| `CRAWL_MAX_ATTEMPTS`            | No       | Maximum attempted pages per run.                  |
| `CRAWL_MAX_DEPTH`               | No       | Maximum discovered-link depth.                    |
| `CRAWL_CONCURRENCY`             | No       | Concurrent browser page fetches.                  |
| `CRAWL_TIMEOUT_MS`              | No       | Overall crawl timeout.                            |
| `CRAWL_PAGE_TIMEOUT_MS`         | No       | Timeout for an individual page.                   |
| `RAW_DATA_RETENTION_DAYS`       | No       | Raw artifact retention period.                    |
| `RAW_ARTIFACTS_BUCKET`          | No       | Optional object-storage bucket for raw artifacts. |
| `LOG_LEVEL`                     | No       | Application and worker log level.                 |

### Public demo limits

| Variable                      | Required | Description                                       |
| ----------------------------- | -------- | ------------------------------------------------- |
| `PUBLIC_RUN_LIMIT_PER_IP_DAY` | No       | Daily run limit per hashed client IP.             |
| `PUBLIC_GLOBAL_RUN_LIMIT_DAY` | No       | Global daily run limit.                           |
| `PUBLIC_ACTIVE_RUNS_PER_IP`   | No       | Concurrent active-run limit per hashed client IP. |

## Application Pages

| Route                                          | Purpose                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/sign-in`                                     | Google sign-in.                                                                                  |
| `/`                                            | Company search, natural-language search, and recent runs.                                        |
| `/runs/[runId]`                                | Live pipeline progress, discovered people, ranked leads, warnings, cancellation, and CSV export. |
| `/high-value-leads`                            | Companies with qualifying High Value Leads.                                                      |
| `/high-value-leads/[companyId]`                | Company context and its qualifying people.                                                       |
| `/high-value-leads/[companyId]/leads/[leadId]` | Company-scoped lead detail with previous, next, and back navigation.                             |
| `/leads/[leadId]`                              | General lead detail, score breakdown, evidence, timeline, and graph.                             |
| `/companies/[companyId]`                       | Canonical company profile and current people.                                                    |
| `/people/[personId]`                           | Canonical person profile, contacts, metrics, and employment history.                             |
| `/connections`                                 | Potential Connections list, graph, filters, evidence, and strength summaries.                    |
| `/review`                                      | Read-only ambiguous entity matches.                                                              |

## API Conventions

- All `/api/v1/*` endpoints require an authenticated Auth.js session.
- Every user-owned read checks ownership before returning runs, companies, people, leads, timelines, or connections.
- Standard JSON success responses use `{ "data": ..., "meta": { "requestId": "..." } }`.
- Standard JSON errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- Cursor-paginated endpoints return `nextCursor` in response metadata or data as documented below.
- The events endpoint returns `text/event-stream`, and the export endpoint returns CSV instead of the JSON envelope.

## API Endpoints

### Authentication and health

| Method        | Endpoint                  | Authentication         | Purpose                                                    |
| ------------- | ------------------------- | ---------------------- | ---------------------------------------------------------- |
| `GET`, `POST` | `/api/auth/[...nextauth]` | Public/session-managed | Auth.js sign-in, callback, session, and sign-out handlers. |
| `GET`         | `/api/health/live`        | Public                 | Process liveness check.                                    |
| `GET`         | `/api/health/ready`       | Public                 | Readiness check, including required dependencies.          |

### Runs and results

| Method | Endpoint                      | Inputs                                                                                                          | Purpose                                                                                         |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/runs`                | JSON body: `domain`, optional `icp`, `roleCriteria`, or legacy `targetRoles`; optional `Idempotency-Key` header | Validates a company URL/domain, applies quotas, creates or reuses a run, and queues processing. |
| `GET`  | `/api/v1/runs`                | None                                                                                                            | Lists recent runs owned by the current user.                                                    |
| `GET`  | `/api/v1/runs/[runId]`        | Path: `runId`                                                                                                   | Returns run status, progress, warnings, source summaries, and counts.                           |
| `POST` | `/api/v1/runs/[runId]/cancel` | Path: `runId`                                                                                                   | Cancels a queued or active run and persists the canceled status.                                |
| `GET`  | `/api/v1/runs/[runId]/events` | Path: `runId`; optional `Last-Event-ID` header                                                                  | Streams ordered run and lead events using server-sent events.                                   |
| `GET`  | `/api/v1/runs/[runId]/leads`  | Query: optional `cursor`; `scope` accepts `matched` or `all`                                                    | Returns a cursor-paginated lead table for a run.                                                |
| `GET`  | `/api/v1/exports/[runId]`     | Path: `runId`                                                                                                   | Downloads the owned run's ranked leads as CSV.                                                  |

Example run request:

```json
{
  "domain": "https://www.example.com/about",
  "icp": {
    "industries": ["Cybersecurity"],
    "locations": ["India"]
  },
  "roleCriteria": {
    "seniorities": ["founder", "c_suite", "vp"],
    "functions": ["executive", "engineering"],
    "customTitles": ["Chief Information Security Officer"]
  }
}
```

### Leads, companies, and people

| Method | Endpoint                                    | Inputs                    | Purpose                                                                               |
| ------ | ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/leads/[leadId]`                    | Path: `leadId`            | Returns lead detail, scoring components, evidence, person details, and timeline.      |
| `GET`  | `/api/v1/leads/[leadId]/graph`              | Path: `leadId`            | Returns Cytoscape-compatible person, company, signal, and employment nodes and edges. |
| `GET`  | `/api/v1/companies/[companyId]`             | Path: `companyId`         | Returns an owned canonical company and related people.                                |
| `GET`  | `/api/v1/people/[personId]`                 | Path: `personId`          | Returns an owned canonical person, contacts, metrics, and employments.                |
| `POST` | `/api/v1/people/[personId]/enrich-timeline` | Path: `personId`; no body | Re-runs Crustdata timeline enrichment for an owned person.                            |
| `GET`  | `/api/v1/entity-matches`                    | None                      | Lists ambiguous entity matches visible to the current user.                           |

### High Value Leads

| Method | Endpoint                                         | Inputs                            | Purpose                                                                |
| ------ | ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/api/v1/high-value-leads/companies`             | None                              | Lists owned companies with qualifying lead counts and company context. |
| `GET`  | `/api/v1/high-value-leads/companies/[companyId]` | Query: optional `cursor`, `limit` | Returns company context and its cursor-paginated qualifying leads.     |

### Natural-language search

| Method | Endpoint                                     | Inputs                                                    | Purpose                                                                            |
| ------ | -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST` | `/api/v1/search/natural`                     | JSON body: `query`, optional `runId`                      | Parses, resolves, validates, and executes a lead, timeline, or connection search.  |
| `POST` | `/api/v1/search/natural/[sessionId]/resolve` | JSON body: `version` plus `answers` or `wideningOptionId` | Continues an ambiguity-resolution session or executes an approved widening option. |

Initial request:

```json
{
  "query": "Chief Technology Officers at OutcomesAI with score above 55"
}
```

Clarification response submission:

```json
{
  "version": 1,
  "answers": [
    {
      "questionId": "company",
      "optionIds": ["company-id-returned-by-the-api"]
    }
  ]
}
```

### Connections

| Method | Endpoint                      | Inputs                                                                                                            | Purpose                                                                                                                              |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/connections`         | Query: optional `currentCompanyId`, `sharedEmployer`, `strengthBand`, `minOverlapDays`, `includeLimited`, `limit` | Returns Potential Connections for owned High Value Leads, including summary counts, facets, evidence quality, and revision metadata. |
| `GET`  | `/api/v1/connections/overlap` | Query: required `companyId`; optional `personId`, `minOverlapDays`                                                | Returns the lower-level shared-employment overlap result for a canonical company.                                                    |

Example Potential Connections request:

```text
GET /api/v1/connections?strengthBand=strong&minOverlapDays=180&includeLimited=false&limit=50
```

## Scripts

| Command                           | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                        | Starts the Next.js web app and worker concurrently.     |
| `pnpm dev:web`                    | Starts only the Next.js development server.             |
| `pnpm dev:worker`                 | Starts only the queue worker in watch mode.             |
| `pnpm build`                      | Builds the web app and worker.                          |
| `pnpm start:web`                  | Starts the production web build.                        |
| `pnpm start:worker`               | Starts the compiled production worker.                  |
| `pnpm format`                     | Formats the repository with Prettier.                   |
| `pnpm format:check`               | Checks formatting without changing files.               |
| `pnpm lint`                       | Runs ESLint.                                            |
| `pnpm typecheck`                  | Checks web and worker TypeScript projects.              |
| `pnpm test`                       | Runs unit and architecture-contract tests.              |
| `pnpm test:integration`           | Runs integration tests.                                 |
| `pnpm test:e2e`                   | Runs Playwright end-to-end tests.                       |
| `pnpm db:generate`                | Generates Drizzle migrations from schema changes.       |
| `pnpm db:migrate`                 | Applies pending Drizzle migrations.                     |
| `pnpm db:seed`                    | Seeds demo data.                                        |
| `pnpm db:studio`                  | Opens Drizzle Studio.                                   |
| `pnpm db:cleanup`                 | Removes expired retained data.                          |
| `pnpm db:repair-garbage-contacts` | Repairs invalid contact values.                         |
| `pnpm db:repair-hvl-duplicates`   | Repairs duplicate High Value Lead records.              |
| `pnpm db:repair-employer-links`   | Reports or repairs unresolved employment-company links. |
| `pnpm search:reindex`             | Rebuilds natural-search indexes and embeddings.         |
| `pnpm verify:deployment`          | Checks production deployment health.                    |

## Testing

Run the same primary checks used by CI:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Install Chromium before the first end-to-end run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Live smoke tests are opt-in because they access external websites and may consume provider credits.

## Production Deployment

Production runs as separate web and worker containers through Docker Compose on a GCP Compute Engine VM. Nginx terminates HTTP/HTTPS traffic, Docker Hub stores private images, a reserved GCP IP keeps the host stable, and GitHub Actions builds and deploys immutable image tags after successful CI on `main`.

```bash
pnpm verify:deployment
```

## Ethical Data Collection

- Respects `robots.txt` and uses a transparent user agent.
- Crawls only same-registrable-domain pages within strict page, depth, concurrency, and timeout limits.
- Blocks requests to internal networks through SSRF protection.
- Stores structured observations, hashes, URLs, and evidence excerpts instead of retaining full HTML indefinitely.
- Treats employment overlap as a potential connection signal, never proof of a direct personal relationship.
- Keeps enrichment providers feature-flagged and reports provider failures or exhausted credits without inventing data.
- Scopes all persisted and returned business data to the authenticated owner.

## License

[MIT](./LICENSE)
