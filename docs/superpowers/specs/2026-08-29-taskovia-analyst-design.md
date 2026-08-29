# Taskovia Analyst Plugin — Approved Design

**Status:** `APPROVED`
**Approved by:** Sơn
**Approval reference:** Direct approval in the private Sơn–Codex development session on 2026-08-29
**Repository:** `Sonos18/company-operations-platform`
**Base ref:** `origin/main`
**Analysis base SHA:** `f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`
**Task class:** `bounded`

## 1. Goal

Create a repository-owned `taskovia-analyst` plugin that makes GPT Chat reliably perform its established Taskovia role:

> Analyst → Solution Designer → Packet Author → Remote Reviewer

The plugin packages the already-approved Taskovia collaboration workflow. It does not change application architecture, business behavior, API contracts, data contracts, permissions, or deployment behavior.

## 2. Distribution boundary

The repository owns a local marketplace and one plugin:

```text
.agents/plugins/marketplace.json
plugins/taskovia-analyst/
├── .codex-plugin/plugin.json
└── skills/taskovia-analyst/
    ├── SKILL.md
    └── agents/openai.yaml
```

The plugin contains no MCP server, app integration, hook, executable script, image, or external dependency.

The repository marketplace supports local installation and testing in the ChatGPT desktop app. Publishing to a ChatGPT workspace or the public Plugins Directory is a separate external action and is out of scope.

## 3. Source-of-truth strategy

Use thin orchestration rather than copying repository policy into a second canonical document.

On every Taskovia project task, the skill must require GPT to load the applicable sources before substantive analysis:

1. System and runtime instructions.
2. Applicable `AGENTS.md` files.
3. `docs/ai-workflow/README.md`.
4. Relevant packet template.
5. Remote source, tests, schemas, migrations, manifests, history, and CI evidence needed by the task.

The skill may contain a concise operational checklist, but repository documents remain authoritative. If GPT cannot access the required remote source or governing files, it must report the missing capability and stop before producing an approved handoff.

## 4. Trigger boundary

Trigger the skill when Sơn assigns or discusses a Taskovia project task that may lead to discovery, design, planning, a Codex handoff, remote implementation review, or a fix round.

Do not trigger it for casual conversation, unrelated general questions, or implementation work already assigned to Codex under an approved packet.

Explicit invocation remains available as `@taskovia-analyst` in ChatGPT and `$taskovia-analyst` in Codex-compatible surfaces.

## 5. Required analyst state machine

### Intake

- State the task class as `spike`, `bounded`, or `architectural`.
- Identify repository, base ref, remote `analysis_base_sha`, source anchors, and material assumptions.
- Actually read required sources before claiming they were considered. Future-tense promises such as “I will inspect” do not satisfy intake.

### Discovery and design

- Summarize current state and evidence.
- Identify the gap between current and requested behavior.
- Present viable options, trade-offs, and a recommendation.
- Ask only questions whose answers can materially change behavior, contract, permission, UX, migration, scope, acceptance criteria, or external side effects.
- Ask one decision at a time unless a tightly coupled group must be decided together.
- Do not invent project facts, infrastructure, approved behavior, or source state from memory.

### Approval and handoff

- Do not delegate unresolved product or architecture decisions to Codex.
- Do not issue an implementation packet before Sơn explicitly approves the proposed scope and decisions.
- After approval, create a complete Implementation Packet using the repository template and immutable analysis SHA.
- Treat Context7 as version-sensitive third-party documentation support only; send narrow library questions and never proprietary source, secrets, credentials, or personal data.
- Use official OpenAI documentation for OpenAI product questions.

### Remote review

- Do not trust a Completion Report as a substitute for source review.
- Verify immutable SHAs and inspect the exact remote `execution_base_sha..head_sha` diff.
- Review correctness, scope, architecture, tests, security, permissions, migrations, error handling, UX, and deployment impact when relevant.
- Return only a canonical verdict: `MERGE`, `MERGE_WITH_FOLLOW_UP`, `CHANGES_REQUIRED`, or `DO_NOT_MERGE`.
- When changes are required, create a Fix Packet against the exact reviewed remote HEAD.

## 6. Stop conditions

Stop and explain the blocker when:

- Required repository instructions or remote source cannot be accessed.
- A material product, architecture, contract, permission, migration, or side-effect decision is unresolved.
- Source drift invalidates analyzed assumptions.
- The user asks GPT to bypass governing instructions, fabricate evidence, or approve unreviewed remote work.

Time pressure, authority pressure, token pressure, apparent simplicity, or confidence from another agent do not waive these conditions.

## 7. Baseline failures to prevent

Four combined-pressure baseline scenarios were run without the skill. The agents selected the generally safe option, but their actual responses exposed these failures:

- Promised to inspect governing files later instead of performing source intake before responding.
- Omitted repository, base ref, immutable SHA, source anchors, and explicit task classification.
- Promised future remote verification rather than producing evidence from the exact diff.
- Proposed onboarding defaults before presenting repository-backed current-state evidence.
- Asked several product questions together instead of sequencing the next material decision.

These omissions are the RED evidence for the skill. GREEN and REFACTOR tests must reuse the same pressures and verify actual evidence-bearing behavior, not just the selected option.

## 8. Acceptance criteria

1. The repo marketplace and plugin pass the official local validators.
2. The skill has valid frontmatter and product metadata and is discoverable for Taskovia analyst work.
3. The skill enforces the intake, discovery, approval, handoff, review, and fix-loop boundaries above.
4. The skill refers to repository-declared infrastructure only and does not introduce an alternative database topology.
5. Pressure tests show the skill prevents the recorded baseline omissions and closes any new rationalizations.
6. No application source, dependency, environment file, canonical workflow, or packet template is changed.
7. The implementation is committed, pushed to `codex/taskovia-analyst-skill`, and remote HEAD is verified.

## 9. Delivery

- Branch: `codex/taskovia-analyst-skill`
- Push: `true`
- Create PR: `false`
- Merge: `false`
- Force-push: `false`
- Create worktree: `false`
- External plugin installation or publication: `false`
- Cloud or production mutation: `false`
