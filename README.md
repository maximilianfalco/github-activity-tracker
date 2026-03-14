<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="GitHub Activity Tracker"/>
</p>

<h1 align="center">GitHub Activity Tracker</h1>

<p align="center">
  A personal dashboard to view your recent GitHub activity — commits, pull requests, and code reviews — all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/next.js-15-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/trpc-11-398CCB?style=flat-square&logo=trpc&logoColor=white" alt="tRPC"/>
  <img src="https://img.shields.io/badge/prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma"/>
</p>

---

## What it does

Connects to the GitHub API via OAuth, fetches your activity across all repositories, and renders it in a dashboard with filtering, sorting, and auto-refresh.

1. **Overview** — daily commit count, open/merged PRs, reviews given, and a recent activity feed.
2. **Commits** — filterable list (1d, 7d, 30d, 90d) with branch names and SHAs. Uses a hybrid fetching strategy combining the Events API and Search API for comprehensive coverage.
3. **Pull Requests** — filterable by state (open, merged, closed) and date range, with status badges.
4. **Reviews** — PRs you've reviewed, filterable by date range.
5. **Repositories** — activity breakdown by repo, sortable by total activity or recency.

## Why?
I got tired needing to scope out all my changes I made in a day. Things quickly become a mess after working in multiple repos and multiple branches so I built this as a way to neatly track my activities so I don't miss any important updates

## Quick Start

**Prerequisites:** Node.js 22+, pnpm, PostgreSQL

```bash
# 1. Clone and install
git clone https://github.com/maximilianfalco/github-activity-tracker.git
cd github-activity-tracker
pnpm install

# 2. Set up environment
cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

# 3. Push the database schema
pnpm db:push

# 4. Start the dev server
pnpm dev
```

Open [localhost:4731](http://localhost:4731). Sign in with GitHub to start tracking your activity.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (generate with `openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |

Create a GitHub OAuth app at [github.com/settings/developers](https://github.com/settings/developers) with callback URL `http://localhost:4731/api/auth/callback/github`.

</details>

## Project Structure

```
github-activity-tracker/
├── src/
│   ├── app/                  Next.js App Router
│   │   ├── dashboard/        Dashboard pages (overview, commits, PRs, reviews, repos, settings)
│   │   └── api/              Auth and tRPC route handlers
│   ├── components/
│   │   ├── dashboard/        Metric cards, activity feed, filters, badges
│   │   └── ui/               shadcn/ui primitives
│   ├── server/
│   │   ├── api/routers/      tRPC routers (github, settings)
│   │   ├── services/         GitHub API client, cache layer
│   │   └── auth/             NextAuth configuration
│   ├── trpc/                 Client and server tRPC setup
│   └── hooks/                Auto-refresh polling, mobile detection
├── prisma/
│   └── schema.prisma         Database schema
└── public/                   Favicon and static assets
```

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix UI |
| Icons | HugeIcons |
| API | tRPC 11 (end-to-end type safety) |
| Data fetching | TanStack React Query 5 |
| Virtualization | TanStack Virtual |
| Database | PostgreSQL, Prisma 6 |
| Auth | NextAuth 5 (GitHub OAuth) |
| Testing | Vitest |
| Linting | ESLint 9, Prettier |

## How It Works

1. **Authenticate** — user signs in with GitHub OAuth, granting `repo`, `read:user`, and `read:org` scopes.
2. **Fetch** — the GitHub service fetches commits (hybrid Events + Search API), PRs, and reviews with pagination (up to 10 pages per type).
3. **Cache** — results are cached in PostgreSQL with a 15-minute TTL to stay within GitHub's rate limits.
4. **Serve** — tRPC routers expose typed queries; React Query handles client-side caching, polling, and stale data management.
5. **Render** — dashboard pages display data in virtualized lists with filter chips for date ranges and states.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with Turbopack on port 4731 |
| `pnpm build` | Production build |
| `pnpm check` | Lint + typecheck |
| `pnpm test` | Run tests with Vitest |
| `pnpm db:push` | Push Prisma schema to database |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm format:write` | Format code with Prettier |

## License

MIT
