# Taskovia Supabase Runtime Design

## Goal

Add a dedicated Taskovia Control/Auth Supabase configuration without replacing or weakening the current VQH company-data Supabase configuration.

## Boundaries

- Keep the existing generic `NUXT_PUBLIC_SUPABASE_*` and `NUXT_SUPABASE_SERVICE_ROLE_KEY` variables for the VQH data plane.
- Add Taskovia-specific variables under a `TASKOVIA` namespace.
- Expose only the Taskovia project URL and publishable/anon key through Nuxt public runtime config.
- Keep the Taskovia service-role key in private server runtime config.
- Keep Supabase Personal Access Tokens outside application runtime configuration.
- Preserve all existing values in the ignored `.env.local`; add only missing empty entries.
- Do not change the canonical VQH Cloud DEV project ref or any `db:dev:*` target.

## Environment contract

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_TASKOVIA_SUPABASE_URL` | Browser and server | Taskovia Control/Auth project URL. |
| `NUXT_PUBLIC_TASKOVIA_SUPABASE_ANON_KEY` | Browser and server | Taskovia publishable/anon key. |
| `NUXT_TASKOVIA_SUPABASE_SERVICE_ROLE_KEY` | Server only | Taskovia administrative operations, when implemented. |

The Taskovia variables are configuration-only in this change. Authentication and tenant routing will consume them in a later implementation.
