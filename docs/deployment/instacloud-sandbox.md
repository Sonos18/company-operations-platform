# InstaCloud agent sandbox

## Purpose

Taskovia uses InstaCloud as a disposable compute/runtime sandbox for coding agents. InstaCloud does **not** replace Supabase in this stage.

The canonical development data plane remains Supabase Cloud DEV:

- Project ref: `gtgljlnhwvhqdnwrfdfj`
- Database, Auth, RLS, RPC, Storage, and migrations stay on Supabase Cloud DEV.
- Do not provision an InstaCloud Postgres service for Taskovia application data in this stage.
- Never place Production Supabase credentials in an InstaCloud sandbox.

The sandbox container fails closed before Nitro starts unless its Supabase URL and key shapes match the canonical Cloud DEV target.

## Architecture

```text
Git feature branch
        |
        v
InstaCloud branch
  compute/app
        |
        | canonical DEV credentials only
        v
Supabase Cloud DEV
  Postgres / Auth / RLS / Storage
        |
        v
verification -> review -> PR -> merge
```

InstaCloud branches isolate compute runtime. They do **not** isolate Taskovia database state in this stage because all sandbox branches deliberately target the same external Supabase Cloud DEV project.

Therefore:

- runtime-only or frontend work may use more than one InstaCloud branch;
- any work that mutates Cloud DEV schema or shared DEV data must remain serialized;
- a database-mutating task may start only when no other database-mutating task is using Cloud DEV.

## One-time bootstrap

Run from the repository root on an authorized developer machine:

```bash
npx -y insta@latest agent setup
insta login
insta project create company-operations-platform
insta service add compute app
```

Set the three Supabase Cloud DEV values interactively. Do not place secret values in command arguments, source control, tickets, logs, or chat:

```bash
insta secrets set NUXT_PUBLIC_SUPABASE_URL --service compute/app
insta secrets set NUXT_PUBLIC_SUPABASE_ANON_KEY --service compute/app
insta secrets set NUXT_SUPABASE_SERVICE_ROLE_KEY --service compute/app
```

Build and deploy the sandbox:

```bash
insta build .
insta deploy . --port 3000
```

After the first public sandbox URL is known, configure `NUXT_PUBLIC_APP_URL` for Auth redirect behaviour if the task exercises browser authentication:

```bash
insta secrets set NUXT_PUBLIC_APP_URL --service compute/app
```

Then redeploy the compute service.

The project link written to `.insta/project.json` is project metadata and may be committed. Machine-local InstaCloud state must remain ignored.

## Verify the bootstrap

First inspect the target locally without printing any secret:

```bash
pnpm instacloud:sandbox:guard
```

Then verify the deployed service:

```text
GET <sandbox-url>/api/health
expected HTTP 200 with status = "ok"
```

Inspect the effective agent policy before allowing agents to operate the project:

```bash
insta --agent agent policy get --json
```

Do not guess policy mutation commands. Use the installed CLI's current `--help` output before changing governance.

## Per-task workflow

Use the same safe feature identifier for Git and InstaCloud when practical:

```bash
git switch -c feat/example
insta --agent branch create feat-example
insta --agent branch switch feat-example
insta --agent deploy . --port 3000
```

The coding agent then:

1. implements only the task scope;
2. deploys the feature runtime to the matching InstaCloud branch;
3. runs `pnpm verify:app`;
4. runs relevant guarded `db:dev:*` checks only when the current task explicitly authorizes Cloud DEV access or mutation;
5. checks the sandbox health endpoint and task-specific integration/E2E behaviour;
6. fixes failures in the feature branch;
7. opens a PR only after the required gates pass.

After merge, delete the disposable InstaCloud feature branch using the current CLI command discovered with `insta branch --help`.

## Safety invariants

- Supabase Cloud DEV ref `gtgljlnhwvhqdnwrfdfj` is the only database target allowed from InstaCloud sandboxes.
- Production credentials are forbidden in InstaCloud development sandboxes.
- The sandbox runtime guard must execute before the Nuxt/Nitro server process.
- Cloud DEV mutations still require explicit authorization and the repository's guarded `db:dev:*` commands.
- No remote reset, seed, migration repair, or destructive database operation is implied by sandbox access.
- Shared Cloud DEV means database-changing agent tasks are sequential until Taskovia adopts isolated database branches.
