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
  next: string | null;
  notes: string;
}

interface RunSummary {
  result: "pass" | "fail";
  checks: CheckResult[];
  failureCategory: FailureCategory;
}

type SelectionMode = "pending" | "retry";
const AUTO_RETRY_MESSAGE = "Execution failed; automatically retried once.";

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

function selectTask(tasks: Task[]): { task: Task; mode: SelectionMode } | null {
  const statusById = buildStatusIndex(tasks);
  const orderedTasks = [...tasks].sort(byPriority);

  for (const task of orderedTasks) {
    if (task.status === "pending" && isReady(task, statusById)) {
      return { task, mode: "pending" };
    }
  }

  for (const task of orderedTasks) {
    if ((task.status === "blocked" || task.status === "failed") && isReady(task, statusById)) {
      return { task, mode: "retry" };
    }
  }
  return null;
}

function computeNextAfter(tasks: Task[], doneId: string): string | null {
  const statusById = buildStatusIndex(tasks);
  for (const task of [...tasks].sort(byPriority)) {
    if (task.id === doneId) continue;
    if (task.status === "pending" && isReady(task, statusById)) return task.id;
  }
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

function buildAgentCommand(): string {
  return [
    AGENT_EXECUTABLE,
    "-m",
    AGENT_MODEL,
    "-c",
    `model_reasoning_effort="${AGENT_REASONING_EFFORT}"`,
    "-s",
    AGENT_SANDBOX_MODE,
    "-a",
    AGENT_APPROVAL_POLICY,
    "exec",
  ].join(" ");
}

function runAgent(task: Task, timeoutSeconds: number): CheckResult {
  const args = [
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
    starterPrompt(task),
  ];

  const result = spawnSync(AGENT_EXECUTABLE, args, {
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
      name: "agent_command",
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
      name: "agent_command",
      status: "pass",
      exit_code: 0,
      required: true,
      failure_category: "none",
      command: buildAgentCommand(),
      output,
    };
  }

  return {
    name: "agent_command",
    status: "fail",
    exit_code: result.status ?? 1,
    required: true,
    failure_category: "agent",
    command: buildAgentCommand(),
    output,
  };
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
  lines.push(`  next: ${entry.next ?? "none"}`);
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

  const selection = selectTask(tasks);
  const nextLabel = selection
    ? selection.mode === "pending"
      ? selection.task.id
      : `${selection.task.id} (retry ${selection.task.status})`
    : "none";
  return [
    `Pending: ${counts.pending}`,
    `In Progress: ${counts.in_progress}`,
    `Done: ${counts.done}`,
    `Failed: ${counts.failed}`,
    `Blocked: ${counts.blocked}`,
    `Next: ${nextLabel}`,
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
      next: null,
      notes: "Failed while parsing TASKS.md",
    });
    console.log(`Validation error: ${message}`);
    return 1;
  }

  if (command === "status") {
    console.log(statusReport(tasks));
    return 0;
  }

  const selected = selectTask(tasks);
  if (!selected) {
    console.log("No executable pending task");
    return 0;
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
  const next = computeNextAfter(tasksAfter, task.id);
  appendProgress({
    timestamp_utc: nowUtc(),
    task_id: task.id,
    agent_prompt: compactPrompt(task),
    result: summary.result === "pass" ? "success" : "fail",
    failure_category: finalFailureCategory,
    checks: summary.checks,
    stdout_excerpt: excerpt.slice(0, 1200),
    next,
    notes,
  });

  console.log(`Result: ${summary.result === "pass" ? "success" : "fail"}`);
  if (next) console.log(`Next task: ${next}`);
  return summary.result === "pass" ? 0 : 1;
}

process.exit(main());
