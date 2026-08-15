# Supabase Cloud and Vercel Production

## Cloud DEV link

1. Create a dedicated VQH Cloud DEV project in Supabase Cloud.
2. Copy its project ref from the Dashboard project URL.
3. Authenticate and link from the repository root:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <cloud-dev-project-ref>
pnpm db:dev:status
```

The CLI is linked to Cloud DEV; không dùng project DEV hoặc link hiện tại để triển khai Vercel Production. The access token and database password must stay outside Git, and the CLI link metadata under `supabase/.temp/` is ignored.

## Deliver a Cloud DEV database migration

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:types
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
