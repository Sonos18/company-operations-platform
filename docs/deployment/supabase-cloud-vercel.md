# Supabase Cloud and Vercel Production

## Cloud DEV link

Taskovia owns the one canonical Supabase Cloud DEV database. VQH is its first tenant/company; there is no separate VQH database.

1. Create a dedicated Taskovia Cloud DEV project in Supabase Cloud.
2. Copy its project ref from the Dashboard project URL.
3. Create `.supabase.dev.env.local` from the tracked blank `.supabase.dev.env.example`, put the DEV-project PAT in its single `SUPABASE_DEV_ACCESS_TOKEN=` assignment, then authenticate and link from the repository root:

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
pnpm db:dev:status
```

The ignored `.supabase.dev.env.local` PAT is authoritative for Cloud DEV CLI authorization. `pnpm db:dev:auth-check` silently confirms visibility of the canonical DEV ref and never prints project lists. The runner strips ambient Supabase access-token/database-password variables and maps only that PAT to the CLI. `SUPABASE_HOME` is isolated at `%LOCALAPPDATA%\SupabaseCLI\taskovia-dev` on Windows, with an XDG/HOME state-directory fallback on other platforms, for non-auth CLI state only. Do not use `db:dev:login`, `--profile`, or the machine-global CLI session.

The CLI is linked to Cloud DEV; không dùng project DEV hoặc link hiện tại để triển khai Vercel Production. The access token and database password must stay outside Git, and the CLI link metadata under `supabase/.temp/` is ignored.

Every `db:dev:*` linked command starts with the canonical DEV target guard. It fails closed unless the tracked DEV ref `gtgljlnhwvhqdnwrfdfj`, ignored CLI link state, and the local public Supabase URL agree; it never prints the URL or key.

## Deliver a Cloud DEV database migration

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:types
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

This daily Cloud DEV migration path is no-Docker and deliberately excludes `pnpm db:dev:test`. The Supabase CLI pgTAP runner requires a Docker/container-capable environment even for a linked project, so it is an optional check outside this workflow. Task 4 or any future Cloud DEV bootstrap guidance must not describe remote pgTAP as a no-Docker check.

Never run a remote reset or seed against Cloud DEV without a separate diagnosis and explicit decision.

## Configure Vercel Production

Add these variables to the Vercel project with the `Production` scope:

- `NUXT_PUBLIC_SUPABASE_URL`: the Vercel Production Supabase project URL.
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`: the Vercel Production public/anon key.

Redeploy Vercel Production after changing either value. Do not add a service-role key to any `NUXT_PUBLIC_*` variable. Preview deployments receive no Cloud configuration unless the same variables are deliberately added to the `Preview` scope.

## Production boundary

Production migration automation and CLI relinking are outside this plan. They must be designed separately before production data exists; do not repurpose the Cloud DEV link for a Vercel Production deployment.

## Verify after deployment

Check `/api/health`, authentication/session resolution, company-context access for a VQH member, and denial for a user outside that company. Review Supabase logs and Vercel runtime logs without copying tokens into issues or commits.
