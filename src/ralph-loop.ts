#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CheckResult, FailureCategory, Status, Task, parseTasks, runCheck } from "./ralph-loop-core";

interface ProgressEntry {
  timestamp_utc: string;
  task_id: string;
  agent_prompt: string;
  result: "success" | "fail";
  failure_category: FailureCategory;
  checks: CheckResult[];
  stdout_excerpt: string;
  ready_after: string[];
  notes: string;
}

interface RunSummary {
  result: "pass" | "fail";
  checks: CheckResult[];
  failureCategory: FailureCategory;
}

type SelectionMode = "pending" | "retry";
const AUTO_RETRY_MESSAGE = "Execution failed; automatically retried once.";
const AGENT_SELECTION_TIMEOUT_SECONDS = 300;

const REPO_ROOT = resolve(process.cwd());
const TASKS_PATH = `${REPO_ROOT}/TASKS.md`;
const PROGRESS_PATH = `${REPO_ROOT}/PROGRESS.md`;
const AGENT_EXECUTABLE = "codex";
const AGENT_MODEL = "gpt-5.4";
const AGENT_REASONING_EFFORT = "high";
const AGENT_SANDBOX_MODE = "workspace-write";
const AGENT_APPROVAL_POLICY = "never";
const AGENT_TIMEOUT_SECONDS = 1800;
const AGENT_BOOTSTRAP_PROMPT = `You are the Ralph coding agent.
Use repository memory files as the source of truth:
- TASKS.md for queue state and acceptance checks
- PROGRESS.md for execution history
- RUNBOOK.md for control flow
- ARCHITECTURE.md for module intent

Run exactly one selected task per invocation and then stop.
Do not change unrelated files.
Do not mark done unless all required acceptance checks pass.`;

function nowUtc(): string {
  const now = new Date();
  return `${now.toISOString().split(".")[0]}Z`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStatusIndex(tasks: Task[]): Map<string, Status> {
  const statusById = new Map<string, Status>();
  for (const task of tasks) statusById.set(task.id, task.status);
  return statusById;
}

function byPriority(a: Task, b: Task): number {
  return a.priority - b.priority;
}

function isReady(task: Task, statusById: Map<string, Status>): boolean {
  return task.dependencies.every((dependency) => statusById.get(dependency) === "done");
}

function executableTasks(tasks: Task[]): Task[] {
  const statusById = buildStatusIndex(tasks);
  return [...tasks]
    .filter((task) => ["pending", "blocked", "failed"].includes(task.status) && isReady(task, statusById))
    .sort(byPriority);
}

function formatReadyList(tasks: Task[]): string {
  if (tasks.length === 0) return "none";
  return tasks.map((task) => `${task.id} (${task.status})`).join(", ");
}

function selectionModeFor(task: Task): SelectionMode {
  return task.status === "pending" ? "pending" : "retry";
}

function extractSelectedTaskId(output: string, candidates: Task[]): string | null {
  const candidateIds = new Set(candidates.map((task) => task.id));
  const matches = output.match(/\b[A-Z]+-\d+\b/g) ?? [];
  const selectedIds = [...new Set(matches.filter((id) => candidateIds.has(id)))];
  if (selectedIds.length === 1) return selectedIds[0]!;
  if (selectedIds.length === 0 && candidates.length === 1) return candidates[0]!.id;
  return null;
}

function updateTaskStatus(taskId: string, status: Status, lines: string[]): void {
  const idMatcher = new RegExp(`^- id:\\s*${escapeRegExp(taskId)}\\s*$`);
  let inTask = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (idMatcher.test(lines[i])) {
      inTask = true;
      continue;
    }
    if (inTask && /^\s{2}status:\s*/.test(lines[i])) {
      lines[i] = `  status: ${status}`;
      return;
    }
    if (inTask && /^\- id:\s*/.test(lines[i])) {
      throw new Error(`Malformed TASKS.md: status missing for task ${taskId}`);
    }
  }
  throw new Error(`Task not found: ${taskId}`);
}

function writeTasks(lines: string[]): void {
  writeFileSync(TASKS_PATH, `${lines.join("\n")}\n`);
}

function normalizeCommandOutput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Buffer) return value.toString("utf8");
  return String(value);
}

function runCommand(command: string, timeoutSeconds = 120): CheckResult {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      timeout: timeoutSeconds * 1000,
      stdio: "pipe",
      encoding: "utf8",
    });
    return {
      name: "command",
      status: "pass",
      exit_code: 0,
      required: true,
      failure_category: "none",
      command,
      output: normalizeCommandOutput(output),
    };
  } catch (error) {
    const e = error as { status?: number; code?: string; stdout?: unknown; stderr?: unknown; message?: string };
    const isMissingDependency =
      e.code === "ENOENT" || String(e.message ?? "").includes("not found") || String(e.message ?? "").includes("command not found");
    return {
      name: "command",
      status: "fail",
      exit_code: e.status ?? 1,
      required: true,
      failure_category: isMissingDependency ? "environment" : "execution",
      command,
      output: [normalizeCommandOutput(e.stdout), normalizeCommandOutput(e.stderr), e.message ?? ""]
        .filter(Boolean)
        .join("\n"),
    };
  }
}

function deriveFailureCategoryFromChecks(checks: CheckResult[]): FailureCategory {
  if (checks.some((check) => check.failure_category === "environment")) return "environment";
  if (checks.some((check) => check.failure_category === "validation")) return "validation";
  if (checks.some((check) => check.failure_category === "unsupported_check")) return "unsupported_check";
  if (checks.some((check) => check.failure_category === "agent")) return "agent";
  if (checks.some((check) => check.failure_category === "execution")) return "execution";
  return "none";
}

function selectorPrompt(candidates: Task[]): string {
  const taskList = candidates
    .map((task) => {
      const objective = task.objective.replace(/\s+/g, " ").trim();
      return `- ${task.id} | status=${task.status} | priority=${task.priority} | title=${task.title} | objective=${objective}`;
    })
    .join("\n");

  return `You are the Ralph task selector.
Read the repository memory files before choosing:
- TASKS.md
- PROGRESS.md
- RUNBOOK.md
- ARCHITECTURE.md

Choose exactly one executable task to run next from this candidate set:
${taskList}

Rules:
- Re-prioritize fresh from current repo state.
- Do not rely on any previous iteration's next-task suggestion.
- You may choose a retry task if that is the highest-leverage move now.
- You must choose exactly one id from the candidate set above.

Output only the task id.`;
}

function buildCodexArgs(prompt: string): string[] {
  return [
    "-m",
    AGENT_MODEL,
    "-c",
    `model_reasoning_effort="${AGENT_REASONING_EFFORT}"`,
    "-s",
    AGENT_SANDBOX_MODE,
    "-a",
    AGENT_APPROVAL_POLICY,
    "-C",
    REPO_ROOT,
    "exec",
    prompt,
  ];
}

function buildAgentCommand(): string {
  return [AGENT_EXECUTABLE, ...buildCodexArgs("__PROMPT__").slice(0, -1)].join(" ");
}

function runCodexPrompt(prompt: string, timeoutSeconds: number, name: string): CheckResult {
  const result = spawnSync(AGENT_EXECUTABLE, buildCodexArgs(prompt), {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
  });

  const output = [result.stdout ?? "", result.stderr ?? "", result.error?.message ?? ""]
    .filter(Boolean)
    .join("\n");

  if (result.error) {
    const failureCategory: FailureCategory =
      (result.error as NodeJS.ErrnoException).code === "ENOENT" ? "environment" : "agent";
    return {
      name,
      status: "fail",
      exit_code: typeof result.status === "number" ? result.status : 1,
      required: true,
      failure_category: failureCategory,
      command: buildAgentCommand(),
      output,
    };
  }

  if (result.status === 0) {
    return {
      name,
      status: "pass",
      exit_code: 0,
      required: true,
      failure_category: "none",
      command: buildAgentCommand(),
      output,
    };
  }

  return {
    name,
    status: "fail",
    exit_code: result.status ?? 1,
    required: true,
    failure_category: "agent",
    command: buildAgentCommand(),
    output,
  };
}

function chooseTaskWithAgent(tasks: Task[]): { task: Task; mode: SelectionMode; check: CheckResult } | null {
  const candidates = executableTasks(tasks);
  if (candidates.length === 0) return null;

  const selectionCheck = runCodexPrompt(selectorPrompt(candidates), AGENT_SELECTION_TIMEOUT_SECONDS, "agent_selector");
  if (selectionCheck.status === "fail") {
    return {
      task: candidates[0]!,
      mode: selectionModeFor(candidates[0]!),
      check: selectionCheck,
    };
  }

  const selectedId = extractSelectedTaskId(selectionCheck.output, candidates);
  if (!selectedId) {
    return {
      task: candidates[0]!,
      mode: selectionModeFor(candidates[0]!),
      check: {
        ...selectionCheck,
        status: "fail",
        exit_code: 1,
        failure_category: "agent",
        output: `Unable to extract a single executable task id from selector output.\n${selectionCheck.output}`,
      },
    };
  }

  const task = candidates.find((candidate) => candidate.id === selectedId)!;
  return {
    task,
    mode: selectionModeFor(task),
    check: selectionCheck,
  };
}

function runAgent(task: Task, timeoutSeconds: number): CheckResult {
  return runCodexPrompt(starterPrompt(task), timeoutSeconds, "agent_command");
}

function runTask(task: Task): RunSummary {
  const checks: CheckResult[] = [];
  const agentResult = runAgent(task, AGENT_TIMEOUT_SECONDS);
  checks.push(agentResult);
  if (agentResult.status === "fail") {
    return {
      result: "fail",
      checks,
      failureCategory: agentResult.failure_category,
    };
  }

  for (const check of task.acceptance) {
    checks.push(runCheck(check));
  }

  const failedChecks = checks.filter(
    (check) => check.status !== "pass" && !(check.status === "skip" && !check.required),
  );
  const failureCategory = deriveFailureCategoryFromChecks(failedChecks);
  return {
    result: failedChecks.length === 0 ? "pass" : "fail",
    checks,
    failureCategory: failedChecks.length === 0 ? "none" : failureCategory,
  };
}

function appendProgress(entry: ProgressEntry): void {
  const lines: string[] = [
    `- timestamp_utc: ${entry.timestamp_utc}`,
    `  task_id: ${entry.task_id}`,
    `  agent_prompt: ${entry.agent_prompt.replace(/\n/g, " ")}`,
    `  result: ${entry.result}`,
    `  failure_category: ${entry.failure_category}`,
    "  checks:",
  ];

  for (const check of entry.checks) {
    lines.push(`    - name: ${check.name}`);
    lines.push(`      status: ${check.status}`);
    lines.push(`      exit_code: ${check.exit_code}`);
    lines.push(`      failure_category: ${check.failure_category}`);
    if (check.command) lines.push(`      command: ${check.command}`);
    if (check.path) lines.push(`      path: ${check.path}`);
    lines.push(`      required: ${String(check.required)}`);
  }

  if (entry.stdout_excerpt) {
    lines.push("  stdout_excerpt: |");
    for (const ln of entry.stdout_excerpt.split("\n")) lines.push(`    ${ln}`);
  } else {
    lines.push('  stdout_excerpt: ""');
  }
  lines.push(`  ready_after: [${entry.ready_after.join(", ")}]`);
  lines.push("  notes: |");
  for (const ln of entry.notes.split("\n")) lines.push(`    ${ln}`);

  const payload = `${lines.join("\n")}\n\n`;
  if (existsSync(PROGRESS_PATH)) {
    writeFileSync(PROGRESS_PATH, `\n${payload}`, { flag: "a" });
  } else {
    writeFileSync(PROGRESS_PATH, payload);
  }
}

function summarizeTask(task: Task): string {
  return `${task.id}: ${task.objective.replace(/\n/g, " ")}`;
}

function starterPrompt(task: Task): string {
  return `${AGENT_BOOTSTRAP_PROMPT}
Task:
- id: ${task.id}
- title: ${task.title}
- priority: ${task.priority}
- objective: ${task.objective}`;
}

function compactPrompt(task: Task): string {
  return `Task ${task.id} | ${task.title} | ${task.objective.replace(/\n/g, " ")}`;
}

function statusReport(tasks: Task[]): string {
  const counts: Record<Status | "other", number> = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    failed: 0,
    other: 0,
  };

  for (const task of tasks) {
    if (task.status in counts) counts[task.status] += 1;
    else counts.other += 1;
  }

  const ready = executableTasks(tasks);
  return [
    `Pending: ${counts.pending}`,
    `In Progress: ${counts.in_progress}`,
    `Done: ${counts.done}`,
    `Failed: ${counts.failed}`,
    `Blocked: ${counts.blocked}`,
    `Ready: ${formatReadyList(ready)}`,
    "Next: chosen fresh by agent at run time",
  ].join("\n");
}

function parseCommand(argv: string[]): "run" | "status" | null {
  if (argv.length !== 1) return null;
  return argv[0] === "run" || argv[0] === "status" ? argv[0] : null;
}

function printUsage(): never {
  const help = `
Usage:
  npm run loop:status
  npm run loop:run
`.trim();
  console.log(help);
  process.exit(2);
}

function main(): number {
  const command = parseCommand(process.argv.slice(2));
  if (!command) return printUsage();

  let tasks: Task[] = [];
  let rawLines: string[] = [];
  try {
    [tasks, rawLines] = parseTasks(TASKS_PATH);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendProgress({
      timestamp_utc: nowUtc(),
      task_id: "unknown",
      agent_prompt: "TASKS.md validation",
      result: "fail",
      failure_category: "validation",
      checks: [],
      stdout_excerpt: message.slice(0, 1200),
      ready_after: [],
      notes: "Failed while parsing TASKS.md",
    });
    console.log(`Validation error: ${message}`);
    return 1;
  }

  if (command === "status") {
    console.log(statusReport(tasks));
    return 0;
  }

  const selected = chooseTaskWithAgent(tasks);
  if (!selected) {
    console.log("No executable task");
    return 0;
  }
  if (selected.check.status === "fail") {
    appendProgress({
      timestamp_utc: nowUtc(),
      task_id: "unknown",
      agent_prompt: "Select next executable task",
      result: "fail",
      failure_category: selected.check.failure_category,
      checks: [selected.check],
      stdout_excerpt: selected.check.output.slice(0, 1200),
      ready_after: executableTasks(tasks).map((item) => item.id),
      notes: "Fresh agent task selection failed before execution.",
    });
    console.log("Task selection failed.");
    return 1;
  }
  const task = selected.task;
  const selectionMode = selected.mode;

  const beforeRun = [...rawLines];
  updateTaskStatus(task.id, "in_progress", beforeRun);
  writeTasks(beforeRun);
  const attemptLabel = selectionMode === "retry" ? `Retrying: ${task.status} task` : "Running";
  console.log(`${attemptLabel}: ${summarizeTask(task)}`);
  console.log("\nStarter prompt:\n" + starterPrompt(task) + "\n");

  let summary = runTask(task);
  let attempts = 1;
  let notes = "Completed via ralph-loop.ts";

  const retriesAllowed = summary.failureCategory === "execution";
  if (summary.result === "fail" && retriesAllowed) {
    attempts += 1;
    console.log("Retrying execution once...");
    notes = `${AUTO_RETRY_MESSAGE}`;
    summary = runTask(task);
  }

  const finalFailureCategory = summary.result === "pass" ? "none" : summary.failureCategory;
  const newStatus: Status = summary.result === "pass" ? "done" : attempts > 1 ? "blocked" : "failed";
  const [, updatedLinesAfter] = parseTasks(TASKS_PATH);
  updateTaskStatus(task.id, newStatus, updatedLinesAfter);
  writeTasks(updatedLinesAfter);

  const failed = summary.checks.filter((check) => check.status !== "pass");
  const excerpt = failed[0]?.output || summary.checks.map((check) => `${check.name}=${check.status}`).join(" ");
  const tasksAfter = tasks.map((item) => (item.id === task?.id ? { ...item, status: newStatus } : item));
  const readyAfter = executableTasks(tasksAfter).map((item) => item.id);
  appendProgress({
    timestamp_utc: nowUtc(),
    task_id: task.id,
    agent_prompt: compactPrompt(task),
    result: summary.result === "pass" ? "success" : "fail",
    failure_category: finalFailureCategory,
    checks: [selected.check, ...summary.checks],
    stdout_excerpt: excerpt.slice(0, 1200),
    ready_after: readyAfter,
    notes,
  });

  console.log(`Result: ${summary.result === "pass" ? "success" : "fail"}`);
  console.log(`Ready after run: ${readyAfter.length > 0 ? readyAfter.join(", ") : "none"}`);
  return summary.result === "pass" ? 0 : 1;
}

process.exit(main());
