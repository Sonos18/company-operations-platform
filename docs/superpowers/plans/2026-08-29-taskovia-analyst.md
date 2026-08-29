# Taskovia Analyst Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the approved Taskovia GPT analyst workflow as a repository-owned, locally installable plugin containing one tested skill.

**Architecture:** A repo marketplace points to a minimal `taskovia-analyst` plugin. The plugin contains one thin orchestration skill that loads canonical repository instructions and remote source rather than duplicating policy; Markdown evaluation evidence captures RED, GREEN, and REFACTOR behavior tests.

**Tech Stack:** OpenAI plugin manifest JSON, Agent Skill Markdown, `agents/openai.yaml`, Python scaffold and validation scripts, Git.

**Spec:** `docs/superpowers/specs/2026-08-29-taskovia-analyst-design.md`

## Global Constraints

- Base implementation on fetched `origin/main` at `f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`.
- Use branch `codex/taskovia-analyst-skill` in the current clean checkout.
- Do not create a worktree.
- Follow root `AGENTS.md`, except the Implementation Packet gate explicitly waived by Sơn for this private dev session.
- Use RED-GREEN-REFACTOR for the behavior-shaping skill.
- Keep `docs/ai-workflow/README.md` and its packet templates authoritative and unchanged.
- Do not change application source, dependencies, environment files, schema, migrations, or database configuration.
- Do not add MCP servers, apps, hooks, scripts, icons, or external dependencies to the plugin.
- Do not install, publish, merge, or deploy the plugin.
- Do not perform Cloud or production mutations.

---

## File Map

- Create `.agents/plugins/marketplace.json` — repository marketplace catalog containing the Taskovia Analyst plugin entry.
- Create `plugins/taskovia-analyst/.codex-plugin/plugin.json` — plugin identity, bundled skill path, and install-surface metadata.
- Create `plugins/taskovia-analyst/skills/taskovia-analyst/SKILL.md` — analyst workflow, decision boundaries, stop conditions, quick reference, rationalization counters, and one example.
- Create `plugins/taskovia-analyst/skills/taskovia-analyst/agents/openai.yaml` — display metadata, default prompt, and implicit invocation policy.
- Create `docs/ai-workflow/taskovia-analyst-eval.md` — reproducible pressure scenarios plus RED, GREEN, and REFACTOR evidence.
- Create `docs/superpowers/specs/2026-08-29-taskovia-analyst-design.md` — approved design and acceptance criteria.
- Create `docs/superpowers/plans/2026-08-29-taskovia-analyst.md` — this execution plan.

---

### Task 1: Persist RED evidence and scaffold the plugin

**Files:**
- Create: `docs/ai-workflow/taskovia-analyst-eval.md`
- Create: `.agents/plugins/marketplace.json`
- Create: `plugins/taskovia-analyst/.codex-plugin/plugin.json`
- Create: `plugins/taskovia-analyst/skills/`

**Interfaces:**
- Produces a repo marketplace entry whose local source is `./plugins/taskovia-analyst`.
- Produces a plugin manifest whose name matches the outer folder and whose skill root is `./skills/`.
- Produces exact baseline failures used by Task 2 and Task 3.

- [ ] **Step 1: Record the four baseline scenarios and exact responses**

Write the scenario prompts, choices, user-facing responses, and observed omissions to `docs/ai-workflow/taskovia-analyst-eval.md`. Mark this section `RED` and preserve the agents' wording verbatim.

- [ ] **Step 2: Confirm RED is behavioral, not merely an incorrect multiple-choice answer**

Check each response for actual intake evidence. The expected RED failures are future-tense source promises, missing SHA/source anchors/task class, unperformed remote review, and recommendations not grounded in current-state evidence.

- [ ] **Step 3: Scaffold the repo plugin and marketplace**

Run:

```powershell
python "C:\Users\NGUYEN HONG SON\.codex\skills\.system\plugin-creator\scripts\create_basic_plugin.py" taskovia-analyst --path "D:\work\company-operations-suite\company-operations-platform\plugins" --with-skills --with-marketplace --marketplace-path "D:\work\company-operations-suite\company-operations-platform\.agents\plugins\marketplace.json"
```

Expected: plugin manifest, empty `skills/` folder, and one marketplace entry are created without placeholders.

- [ ] **Step 4: Validate the initial plugin scaffold**

Run:

```powershell
python "C:\Users\NGUYEN HONG SON\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" "D:\work\company-operations-suite\company-operations-platform\plugins\taskovia-analyst"
```

Expected: PASS.

---

### Task 2: Implement the minimal GREEN skill

**Files:**
- Create: `plugins/taskovia-analyst/skills/taskovia-analyst/SKILL.md`
- Create: `plugins/taskovia-analyst/skills/taskovia-analyst/agents/openai.yaml`
- Modify: `plugins/taskovia-analyst/.codex-plugin/plugin.json`

**Interfaces:**
- Consumes the canonical workflow at `docs/ai-workflow/README.md` and applicable packet templates.
- Produces an analyst state machine with `intake`, `discovery`, `approval`, `handoff`, `remote review`, and `fix round` stages.
- Produces explicit stop conditions and outputs suitable for Sơn's approval decisions.

- [ ] **Step 1: Initialize the skill with product metadata**

Run:

```powershell
python "C:\Users\NGUYEN HONG SON\.codex\skills\.system\skill-creator\scripts\init_skill.py" taskovia-analyst --path "D:\work\company-operations-suite\company-operations-platform\plugins\taskovia-analyst\skills" --interface "display_name=Taskovia Analyst" --interface "short_description=Analyze and hand off Taskovia project work" --interface "default_prompt=Use $taskovia-analyst to analyze this Taskovia task before any Codex handoff."
```

Expected: `SKILL.md` and `agents/openai.yaml` exist under the skill directory.

- [ ] **Step 2: Replace the generated template with the minimal behavior-shaping skill**

Write frontmatter containing only:

```yaml
---
name: taskovia-analyst
description: Use when Sơn assigns or discusses Taskovia project work that may require discovery, design, planning, a Codex handoff, remote implementation review, or a fix round.
---
```

The body must require actual source intake before substantive analysis, the approved analyst state machine, one-question-at-a-time material discovery, explicit approval before handoff, immutable-SHA remote review, Context7/OpenAI documentation boundaries, stop conditions, a quick-reference table, rationalization counters, red flags, and one compact handoff example.

- [ ] **Step 3: Complete plugin manifest metadata**

Set strict semver, a concise description, Taskovia author metadata, `skills: "./skills/"`, and required interface fields. Do not add manifest fields for components that do not exist.

- [ ] **Step 4: Run skill and plugin validators**

Run:

```powershell
python "C:\Users\NGUYEN HONG SON\.codex\skills\.system\skill-creator\scripts\quick_validate.py" "D:\work\company-operations-suite\company-operations-platform\plugins\taskovia-analyst\skills\taskovia-analyst"
python "C:\Users\NGUYEN HONG SON\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" "D:\work\company-operations-suite\company-operations-platform\plugins\taskovia-analyst"
python -m json.tool ".agents/plugins/marketplace.json" | Out-Null
python -m json.tool "plugins/taskovia-analyst/.codex-plugin/plugin.json" | Out-Null
```

Expected: all commands pass.

- [ ] **Step 5: Run description micro-tests**

Present at least five mixed requests containing positive triggers, near misses, casual conversation, implementation-only work, and remote review work. Verify the skill description selects only Taskovia analyst responsibilities. Record results in the evaluation document.

---

### Task 3: Pressure-test GREEN and close loopholes

**Files:**
- Modify: `docs/ai-workflow/taskovia-analyst-eval.md`
- Modify: `plugins/taskovia-analyst/skills/taskovia-analyst/SKILL.md`

**Interfaces:**
- Consumes the four RED scenarios from Task 1.
- Produces evidence that an agent with the skill performs source intake and respects the analyst/reviewer boundary under combined pressure.

- [ ] **Step 1: Run the original scenarios with the skill available**

Dispatch fresh subagents with minimal context, provide the complete skill, and rerun the same urgency, authority, token, confidence, and deadline pressures.

Expected: responses perform or explicitly block on source intake; they do not merely promise later verification or invent missing facts.

- [ ] **Step 2: Capture every new rationalization verbatim**

Append each new excuse or shortcut to the evaluation document. Typical categories to inspect are “the task is obvious,” “the report is enough,” “the user waived the rule,” and “I can fill in reasonable defaults.”

- [ ] **Step 3: Add explicit counters and red flags**

For every observed loophole, update the skill's rationalization table and red-flag list. Keep the guidance operational and concise.

- [ ] **Step 4: Re-run the failing scenarios**

Use fresh agents and the updated skill. Expected: no unresolved rationalization remains and agents cite the applicable skill boundary.

- [ ] **Step 5: Meta-test clarity**

For any prior violation, ask how the skill should have been clearer. Update organization or wording only when the response identifies a documentation gap, then rerun that case.

---

### Task 4: Final verification and remote delivery

**Files:**
- Review all files listed in the File Map.

**Interfaces:**
- Produces a remotely verifiable branch for independent GPT review.

- [ ] **Step 1: Re-run focused validators**

Run the four validation commands from Task 2 Step 4 and confirm fresh PASS results.

- [ ] **Step 2: Run repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
git diff --name-only origin/main...HEAD
```

Expected: no whitespace errors; only approved plugin, marketplace, design, plan, and evaluation files changed.

- [ ] **Step 3: Self-review scope and content**

Read the entire skill, plugin manifest, marketplace, design, plan, and evaluation evidence. Confirm no placeholders, secrets, unsupported manifest fields, duplicated canonical workflow, alternative infrastructure assumptions, application changes, or external side effects.

- [ ] **Step 4: Commit the bounded change**

Run:

```powershell
git add .agents/plugins/marketplace.json plugins/taskovia-analyst docs/ai-workflow/taskovia-analyst-eval.md docs/superpowers/specs/2026-08-29-taskovia-analyst-design.md docs/superpowers/plans/2026-08-29-taskovia-analyst.md
git commit -m "feat: add Taskovia analyst plugin"
```

- [ ] **Step 5: Fetch, check drift, push, and verify remote HEAD**

Run:

```powershell
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
git push -u origin codex/taskovia-analyst-skill
git rev-parse HEAD
git ls-remote --heads origin codex/taskovia-analyst-skill
```

Expected: no material drift invalidates the approved design, push succeeds, and remote branch SHA equals local HEAD.
