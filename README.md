<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="GitHub Activity Tracker"/>
</p>

<h1 align="center">GitHub Activity Tracker</h1>

<p align="center">
  A personal dashboard for keeping tabs on your GitHub activity across all your repos.
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

## Why?

I got tired needing to scope out all my changes I made in a day. Things quickly become a mess after working in multiple repos and multiple branches so I built this as a way to neatly track my activities so I don't miss any important updates.

## What it does

Sign in with GitHub and you get a dashboard showing everything you've been up to:

- **Overview** — quick glance at your commit count, PR status, and reviews given
- **Commits** — browse your commits with date filters (1d/7d/30d/90d), branch names, and SHAs
- **Pull Requests** — see your PRs filtered by open, merged, or closed
- **Reviews** — PRs you've reviewed
- **Repos** — activity broken down by repository, sortable by activity or recency

Everything auto-refreshes and results are cached so you don't burn through GitHub's rate limits.

## Quick Start

You'll need Node.js 22+, pnpm, and PostgreSQL.

```bash
git clone https://github.com/maximilianfalco/github-activity-tracker.git
cd github-activity-tracker
pnpm install

cp .env.example .env
# fill in your DATABASE_URL, AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

pnpm db:push
pnpm dev
```

Then open [localhost:4731](http://localhost:4731) and sign in with GitHub.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (generate with `openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |

You'll need to create a GitHub OAuth app at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL set to `http://localhost:4731/api/auth/callback/github`.

</details>

## How it works

1. You sign in with GitHub OAuth (`repo`, `read:user`, `read:org` scopes)
2. The app fetches your commits, PRs, and reviews from the GitHub API — commits use a hybrid approach (Events API + Search API) for better coverage
3. Results get cached in Postgres with a 15-min TTL so you're not hammering the API
4. tRPC serves the data to the frontend where React Query handles caching, polling, and keeping things fresh

## Project Structure

```
src/
├── app/                  Next.js pages and API routes
│   ├── dashboard/        All the dashboard views
│   └── api/              Auth + tRPC handlers
├── components/           UI components (shadcn/ui + custom dashboard pieces)
├── server/
│   ├── api/routers/      tRPC routers for github data and settings
│   ├── services/         GitHub API client and cache layer
│   └── auth/             NextAuth config
├── trpc/                 Client/server tRPC setup
└── hooks/                Auto-refresh polling, etc.
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on port 4731 |
| `pnpm build` | Production build |
| `pnpm check` | Lint + typecheck |
| `pnpm test` | Run tests |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio |

## License

MIT
