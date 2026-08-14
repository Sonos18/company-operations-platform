# Supabase Cloud and Vercel production

## One-time Supabase Cloud link

1. Create the VQH project in Supabase Cloud.
2. Copy its project ref from the Dashboard project URL.
3. Authenticate and link from the repository root:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm db:cloud:status
```

The access token and database password must stay outside Git. The CLI link metadata under `supabase/.temp/` is ignored.

## Deploy a database migration

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:local:reset
pnpm db:local:test
pnpm verify:backend
pnpm db:cloud:status
pnpm db:cloud:dry-run
pnpm db:cloud:push
pnpm db:cloud:status
```

Never run `supabase db reset --linked` and never add `--include-seed` for this Cloud project.

## Configure Vercel Production

Add these variables to the Vercel project with the `Production` scope:

- `NUXT_PUBLIC_SUPABASE_URL`: the Cloud project URL.
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`: the Cloud public/anon key.

Redeploy Production after changing either value. Do not add a service-role key to any `NUXT_PUBLIC_*` variable. Preview deployments receive no Cloud configuration unless the same variables are deliberately added to the `Preview` scope.

## Verify after deployment

Check `/api/health`, authentication/session resolution, company-context access for a VQH member, and denial for a user outside that company. Review Supabase logs and Vercel runtime logs without copying tokens into issues or commits.
