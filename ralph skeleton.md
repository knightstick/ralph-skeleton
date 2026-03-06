# Ralph Loop Harness — Design Notes

## Purpose

We want to build a **general harness for Ralph loops** that can reliably take a rough idea and produce a **running skeleton application** deployed to the internet.

This harness should:

- orchestrate coding agents
    
- maintain durable state across fresh sessions
    
- verify outcomes automatically
    
- minimize human orchestration
    

The goal is not to build a product but to **reduce the friction between "idea" and "production-like deployment."**

---

# The Problem

LLM coding agents have three fundamental limitations:

### 1. Context is fragile

Agents forget earlier decisions and drift.

### 2. Long tasks degrade performance

Large scopes cause hallucinations and partial completion.

### 3. Self-evaluation is unreliable

Agents often claim success when systems do not actually run.

Because of these constraints, **traditional long-context workflows fail**.

Ralph loops address this by restructuring the problem.

---

# What Ralph Loops Actually Are

A Ralph loop is an **outer orchestration loop** that repeatedly invokes a coding agent in **short-lived sessions**.

Each iteration:

1. selects a small task
    
2. invokes the coding agent
    
3. verifies results
    
4. persists state
    
5. resets the agent
    

The defining characteristics are:

### Fresh context

Every agent invocation starts with **minimal context**.

### Durable memory in the repo

State is externalized to files, not the agent.

Examples:

```
TASKS.md
PROGRESS.md
RUNBOOK.md
```

### Objective completion checks

Success is verified with deterministic signals:

- tests
    
- lint
    
- health endpoints
    
- deployment success
    
- smoke checks
    

The agent **does not decide success**.

The harness does.

---

# Why This Works

The approach exploits several properties of LLM behavior.

### Small scoped tasks perform dramatically better

Agents excel at **incremental edits**, not large builds.

### Statelessness prevents drift

Context resets eliminate compounding errors.

### Files are reliable memory

LLMs read structured files consistently.

### Deterministic checks anchor progress

Tests and scripts provide objective feedback loops.

---

# First Principles for Harness Design

The harness should follow several core principles.

---

## Principle 1 — The repo is the memory

Agents should not rely on conversation context.

Instead the repository should contain structured artefacts:

```
TASKS.md
PROGRESS.md
RUNBOOK.md
ARCHITECTURE.md
```

These files define the system state.

Agents must read them at the beginning of each loop.

---

## Principle 2 — Tasks must be atomic

A task should be:

- independently verifiable
    
- small enough to finish in one agent session
    
- narrow in scope
    

Bad example:

```
Add authentication
```

Good example:

```
Add /health endpoint returning 200
```

---

## Principle 3 — Verification must be mechanical

The harness should run automated checks such as:

```
lint
typecheck
tests
build
deploy
smoke test
```

A task is complete only when checks pass.

---

## Principle 4 — Deployment happens early

A major friction point in software projects is the delay between:

```
local code
→ deployed environment
```

The harness should prioritize:

```
deployable skeleton first
features second
```

This validates infrastructure early.

---

## Principle 5 — State transitions must be explicit

Every loop iteration should record:

```
what was attempted
what succeeded
what failed
next task
```

Example:

```
PROGRESS.md
```

This enables fresh sessions to resume work.

---

# The Harness Itself

The Ralph loop harness is conceptually a **controller**.

The controller orchestrates:

```
task selection
agent invocation
verification
state updates
```

---

## Basic Loop

Conceptually:

```
while incomplete:

  task = select_next_task()

  run_agent(task)

  run_checks()

  if checks_pass:
      mark_task_complete()

  else:
      record_failure()
```

---

# Core Harness Responsibilities

The harness must solve four problems.

---

## Task Selection

Choose the next task.

Possible strategies:

- sequential tasks
    
- dependency graph
    
- priority scoring
    

Open question:

Should the harness allow the agent to **propose new tasks**?

---

## Agent Invocation

Start a fresh agent session.

Provide:

```
AGENT.md
RUNBOOK.md
TASKS.md
PROGRESS.md
```

Plus the selected task.

Important constraints:

- limit context size
    
- avoid large files
    
- avoid irrelevant history
    

---

## Verification

The harness should run checks outside the agent.

Examples:

```
pnpm test
pnpm build
pnpm lint
curl health endpoint
```

For deployment loops:

```
verify deploy success
call production endpoint
```

---

## State Updates

The harness must persist outcomes.

Examples:

```
update TASKS.md
append to PROGRESS.md
create commit
```

Git history itself becomes part of the memory.

---

# Deployment-Oriented Loops

For skeleton apps the most valuable loop sequence often is:

```
scaffold repo
→ boot app
→ deploy backend
→ deploy frontend
→ connect services
→ add minimal data flow
```

This sequence validates the full system early.

---

# Rough Architecture Options

There are several ways the harness itself could be built.

---

## Option A — Bash loop

Simplest possible approach.

```
while true
do
  run_agent
  run_checks
done
```

Advantages:

- trivial
    
- transparent
    

Disadvantages:

- limited logic
    
- poor observability
    

---

## Option B — Node orchestration

A TypeScript CLI tool controls the loop.

Responsibilities:

- read tasks
    
- invoke agent CLI
    
- run checks
    
- update files
    

Advantages:

- flexible
    
- easier integrations
    

Disadvantages:

- more complexity
    

---

## Option C — Agent-driven orchestration

The coding agent itself runs the loop.

Example:

```
agent reads tasks
agent executes commands
agent verifies results
```

Advantages:

- minimal harness
    

Disadvantages:

- less reliable verification
    

---

# Observability

The harness should expose progress.

Useful signals:

```
task completion rate
failed iterations
deployment success
time per task
```

This helps refine task sizing.

---

# Failure Modes

Common failure patterns include:

### task too large

Agents stall or partially complete work.

### verification too weak

Tasks appear complete but system is broken.

### insufficient runbook detail

Fresh sessions lack operational context.

### hidden infrastructure dependencies

Deployments fail due to missing configuration.

---

# Design Questions

These are unresolved areas worth exploring.

### How should tasks be generated?

Human authored vs agent proposed.

---

### Should the harness commit automatically?

Automatic commits create clear checkpoints but may introduce noise.

---

### How should deployments be triggered?

Options include:

```
CI pipelines
local scripts
agent commands
```

---

### How should failures be handled?

Possibilities:

```
retry loop
break task into subtasks
escalate to human
```

---

# Target Outcome

If successful, the harness enables this workflow:

```
idea
↓
seed repo
↓
run Ralph loop
↓
skeleton deployed
↓
iterate
```

The time from idea to deployed skeleton should ideally be **under one hour**.

---

# Immediate Goal

The immediate goal is to build **the harness**, not the application.

The harness should:

1. orchestrate Ralph loops
    
2. manage task state
    
3. invoke coding agents
    
4. verify results automatically
    

Once the harness works, it can be reused for any project.