<p align="center">
  <img src="public/logo.png" width="80" height="80" alt="GitHub Activity Tracker" style="border-radius: 50%"/>
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

GitHub UI kinda sucks and I got tired to needing to comb through branches and repos and PRs just to give a daily update to my team. Hopefully this dashboard improves it!

## What it does

Sign in with GitHub and you get a dashboard showing everything you've been up to:

- **Overview** — quick glance at your commit count, PR status, and reviews given
- **Commits** — browse your commits with date filters (1d/7d/30d/90d), branch names, and SHAs
- **Pull Requests** — see your PRs filtered by open, merged, or closed
- **Reviews** — PRs you've reviewed
- **Repos** — activity broken down by repository, sortable by activity or recency
- **Recap** — AI-generated standup recaps from your recent activity (24h–72h configurable), filterable by activity type (commits, PRs, reviews) and repo, with a custom rule editor so you can control the tone, format, and style of the output
- **Settings** — configure default time windows, notifications, and your custom AI recap rule, saved with a single form submit

Everything auto-refreshes and results are cached so you don't burn through GitHub's rate limits.

## Quick Start

You'll need Node.js 22+, pnpm, Docker or another PostgreSQL instance, and Go 1.24+ if you want to use the local CLI.

The fastest setup path is one command:

```bash
./scripts/setup.sh
```

It will:
- create `.env` if needed
- prompt for your GitHub OAuth app credentials
- install dependencies
- start a local Postgres container if Docker or Podman is available
- apply the Prisma schema
- install `ghat` to `~/.local/bin` by default
- sync repo `.env` with `~/.config/ghat/.env` so the global CLI can run outside the repo

You can also run the same flow with:

```bash
make setup
```

or:

```bash
pnpm run bootstrap
```

```bash
git clone https://github.com/maximilianfalco/github-activity-tracker.git
cd github-activity-tracker
make setup
```

Then open [localhost:4731](http://localhost:4731) and sign in with GitHub.

When `ghat` loads configuration, it uses this precedence:

1. existing process environment variables
2. repo-local `.env` in the current working directory
3. global fallback `~/.config/ghat/.env`

That keeps the CLI aligned with the web app when you're inside the repo, while still letting the globally installed binary work from anywhere else.

If you need to resync those files later, run:

```bash
make sync-config
```

or:

```bash
pnpm run sync-config
```

That merge is two-way, but repo-local `.env` wins on conflicts.

## CLI Companion

This repo also ships with a local CLI companion called `ghat` that plugs into the same database, cached activity, settings, and GitHub credentials as the web app.

```bash
pnpm ghat
```

If you want to sign in directly from the terminal first, use:

```bash
pnpm ghat login
```

Run it and you get a menu-driven terminal version of the tracker:

- auto-detect your local GitHub-backed user from the shared database
- reuse the saved GitHub token if one already exists
- open GitHub OAuth in your browser from the terminal with device flow
- read and write the same cached activity and user settings as the web app
- give you arrow-key menus powered by Charm's `huh`
- use `lipgloss` styling for headings, status messages, and output sections

You can jump into:

- Login with GitHub
- Overview
- Commits
- Pull Requests
- Reviews
- Repos
- Recap
- Refresh GitHub data
- Settings
- Recap repo filtering in Settings so your standup only uses the repos you care about
- Switch user
- Logout everywhere

If you want to skip the menu, you can also call commands directly:

```bash
go run ./cmd/ghat login
go run ./cmd/ghat overview
go run ./cmd/ghat commits
go run ./cmd/ghat prs
go run ./cmd/ghat recap
go run ./cmd/ghat recap-context --hours 24 --json
go run ./cmd/ghat refresh
```

For external tools and coding agents, `ghat` also exposes recap context without calling OpenAI:

```bash
ghat recap-context --hours 24 --json
ghat recap-context --hours 48 --types commit,pr --repos owner/repo --json
```

That command returns the saved custom recap rule, the base recap instructions, the filtered activity items, and the preformatted activity text so another agent can generate the final recap itself.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (generate with `openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |
| `OPENAI_API_KEY` | OpenAI API key (used for AI recap generation) |

You'll need to create a GitHub OAuth app at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL set to `http://localhost:4731/api/auth/callback/github`. The same `AUTH_GITHUB_ID` is also used by the CLI device flow login.

</details>

## How it works

1. You sign in with GitHub OAuth (`repo`, `read:user`, `read:org` scopes)
2. The app fetches your commits, PRs, and reviews from the GitHub API — commits use a hybrid approach (Events API + Search API) for better coverage
3. Results get cached in Postgres with a 15-min TTL so you're not hammering the API
4. tRPC serves the data to the frontend where React Query handles caching, polling, and keeping things fresh
5. The recap page sends your filtered activity to an AI model (GPT-4o-mini) with your custom style instructions to generate a standup-ready summary you can copy or export as JSON

## Project Structure

```
cmd/
├── ghat/                 Go CLI entrypoint
internal/
├── ai/                   Recap generation client
├── app/                  CLI command flow, menus, and output rendering
├── auth/                 Shared local auth/user resolution
├── config/               Runtime env loading for the CLI
├── data/                 PostgreSQL reads/writes for users, settings, and cache
├── domain/               Activity filtering, summaries, and recap prep
└── github/               GitHub API + OAuth device flow client
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
| `pnpm ghat` | Launch the interactive GitHub Activity Tracker CLI |
| `pnpm ghat:test` | Run Go tests for the CLI companion |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm docker:dev` | Start dev containers (with hot reload) |
| `pnpm docker:prod` | Start production containers |
| `pnpm docker:build` | Build production Docker image |

## License

MIT
