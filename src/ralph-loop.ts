#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Status = "pending" | "in_progress" | "blocked" | "done" | "failed";
type CheckType = "command" | "file_exists";

interface Check {
  type?: CheckType | string;
  command?: string;
  path?: string;
  required?: boolean;
  timeout_seconds?: number;
  [key: string]: unknown;
}

interface Task {
  id: string;
  title?: string;
  status: Status;
  priority: number;
  dependencies: string[];
  owner?: string;
  objective?: string;
  acceptance: Check[];
  notes?: string;
  rawStatusLine?: number;
}

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  exit_code: number;
  required: boolean;
  command?: string;
  path?: string;
  output: string;
}

interface ProgressEntry {
  timestamp_utc: string;
  task_id: string;
  agent_prompt: string;
  result: "success" | "fail";
  checks: CheckResult[];
  stdout_excerpt: string;
  next: string | null;
  notes: string;
}

const REPO_ROOT = resolve(process.cwd());
const TASKS_PATH = `${REPO_ROOT}/TASKS.md`;
const PROGRESS_PATH = `${REPO_ROOT}/PROGRESS.md`;

function nowUtc(): string {
  const now = new Date();
  return `${now.toISOString().split(".")[0]}Z`;
}

function castScalar(raw: string): unknown {
  const value = raw.trim();
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  const numberMatch = /^-?\d+$/.test(value);
  if (numberMatch) return Number.parseInt(value, 10);
  return value;
}

function parseList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((it) => it.trim()).filter(Boolean);
}

function parseValue(line: string, lines: string[], idx: number, end: number): [unknown, number] {
  const valueMatch = line.match(/^\s{2,}[a-zA-Z0-9_]+:\s*(.*)$/);
  if (!valueMatch) return ["", idx];
  const value = valueMatch[1] ?? "";
  if (value !== "|") return [castScalar(value), idx];

  const headerIndent = line.search(/\S/);
  const contentIndent = headerIndent + 2;
  const out: string[] = [];
  let i = idx + 1;
  while (i < end) {
    const candidate = lines[i];
    const candidateIndent = candidate.search(/\S/);
    if (candidateIndent <= headerIndent) break;
    if (candidate.trim() === "") {
      out.push("");
    } else {
      out.push(candidate.slice(contentIndent));
    }
    i += 1;
  }
  return [out.join("\n").replace(/\n+$/u, ""), i - 1];
}

function parseAcceptance(lines: string[], start: number, end: number): [Check[], number] {
  const checks: Check[] = [];
  let i = start + 1;
  while (i < end) {
    const line = lines[i];
    if (/^\s{4}-\s+[a-zA-Z0-9_]+:\s*/.test(line)) {
      const check: Check = {};
      const itemMatch = line.match(/^\s{4}-\s+([a-zA-Z0-9_]+):\s*(.*)$/);
      if (!itemMatch) {
        i += 1;
        continue;
      }
      const firstKey = itemMatch[1];
      check[firstKey] = castScalar(itemMatch[2]);
      i += 1;
      while (i < end) {
        const nested = lines[i];
        if (/^\s{4}-\s+/.test(nested)) break;
        if (/^\s{2}[a-zA-Z0-9_]+:\s*/.test(nested)) break;
        if (!nested.trim()) {
          i += 1;
          continue;
        }
        const nestedMatch = nested.match(/^\s{6}([a-zA-Z0-9_]+):\s*(.*)$/);
        if (!nestedMatch) {
          i += 1;
          continue;
        }
        const nestedKey = nestedMatch[1];
        if (nestedMatch[2] === "|") {
          const [value, consumed] = parseValue(nested, lines, i, end);
          check[nestedKey] = value as string;
          i = consumed;
        } else {
          check[nestedKey] = castScalar(nestedMatch[2]);
        }
        i += 1;
      }
      checks.push(check);
      continue;
    }
    if (/^\s{2}[a-zA-Z0-9_]+:\s*/.test(line)) break;
    i += 1;
  }
  return [checks, i - 1];
}

export function parseTasks(path: string): [Task[], string[]] {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  const tasks: Task[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const taskMatch = line.match(/^- id:\s*(.+)$/);
    if (!taskMatch) {
      i += 1;
      continue;
    }

    const task: Task = {
      id: taskMatch[1].trim(),
      status: "pending",
      priority: 999,
      dependencies: [],
      acceptance: [],
    };

    let end = i + 1;
    while (end < lines.length) {
      if (/^- id:\s*(.+)$/.test(lines[end])) break;
      end += 1;
    }

    let j = i + 1;
    while (j < end) {
      const raw = lines[j];
      const rootMatch = raw.match(/^\s{2}([a-zA-Z0-9_]+):\s*(.*)$/);
      if (rootMatch) {
        const key = rootMatch[1];
        const value = rootMatch[2] ?? "";
        if (key === "status") {
          task.status = castScalar(value || "pending") as Status;
          task.rawStatusLine = j;
        } else if (key === "priority") {
          const parsed = castScalar(value);
          task.priority = typeof parsed === "number" ? parsed : 999;
        } else if (key === "dependencies") {
          task.dependencies = parseList(value);
        } else if (key === "acceptance") {
          const [checks, consumed] = parseAcceptance(lines, j, end);
          task.acceptance = checks;
          j = consumed;
        } else if (key === "objective" || key === "notes") {
          if (value === "|") {
            const [multi, consumed] = parseValue(raw, lines, j, end);
            if (key === "objective") task.objective = multi as string;
            if (key === "notes") task.notes = multi as string;
            j = consumed;
          } else {
            if (key === "objective") task.objective = String(castScalar(value));
            if (key === "notes") task.notes = String(castScalar(value));
          }
        } else {
          const parsed = castScalar(value);
          if (key === "title" && typeof parsed === "string") task.title = parsed;
          if (key === "owner" && typeof parsed === "string") task.owner = parsed;
        }
      }
      j += 1;
    }

    tasks.push(task);
    i = end;
  }

  return [tasks, lines];
}

function nextTask(tasks: Task[]): Task | null {
  const statusById = new Map<string, string>();
  for (const task of tasks) statusById.set(task.id, task.status);

  const ready: Task[] = [];
  for (const task of tasks) {
    if (task.status !== "pending") continue;
    let blocked = false;
    for (const dependency of task.dependencies) {
      if (statusById.get(dependency) !== "done") {
        blocked = true;
        break;
      }
    }
    if (!blocked) ready.push(task);
  }
  if (!ready.length) return null;
  ready.sort((a, b) => a.priority - b.priority);
  return ready[0] ?? null;
}

function computeNextAfter(tasks: Task[], doneId: string): string | null {
  const statusById = new Map<string, string>();
  for (const task of tasks) statusById.set(task.id, task.status);
  const ready: Task[] = [];
  for (const task of tasks) {
    if (task.id === doneId) continue;
    if (task.status !== "pending") continue;
    if (task.dependencies.every((d) => statusById.get(d) === "done")) ready.push(task);
  }
  if (!ready.length) return null;
  ready.sort((a, b) => a.priority - b.priority);
  return ready[0].id;
}

function updateTaskStatus(taskId: string, status: Status, lines: string[]): void {
  let inTask = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- id:\s*/.test(lines[i]) && lines[i].includes(taskId)) {
      inTask = true;
      continue;
    }
    if (inTask && /^\s{2}status:\s*/.test(lines[i])) {
      lines[i] = `  status: ${status}`;
      return;
    }
    if (inTask && /^\s*- id:\s*/.test(lines[i])) {
      throw new Error(`Malformed TASKS.md: status missing for task ${taskId}`);
    }
  }
  throw new Error(`Task not found: ${taskId}`);
}

function writeTasks(lines: string[]): void {
  writeFileSync(TASKS_PATH, `${lines.join("\n")}\n`);
}

function runCommand(command: string, timeoutSeconds = 120): CheckResult {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      timeout: timeoutSeconds * 1000,
      stdio: "pipe",
      encoding: "utf8",
      shell: true,
    }) as string;
    return {
      name: "command",
      status: "pass",
      exit_code: 0,
      required: true,
      command,
      output: String(output ?? ""),
    };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      name: "command",
      status: "fail",
      exit_code: e.status ?? 1,
      required: true,
      command,
      output: [e.stdout ?? "", e.stderr ?? "", e.message ?? ""].filter(Boolean).join("\n"),
    };
  }
}

function runCheck(check: Check): CheckResult {
  const type = check.type ?? "command";
  const required = check.required ?? true;
  if (type === "command") {
    const command = String(check.command ?? "");
    const timeout = Number.isFinite(check.timeout_seconds as number) ? Number(check.timeout_seconds) : 120;
    const result = runCommand(command, timeout);
    if (!required && result.status === "fail") result.status = "skip";
    result.required = required;
    return result;
  }
  if (type === "file_exists") {
    const path = String(check.path ?? "");
    const exists = Boolean(path) && existsSync(path);
    return {
      name: String(type),
      status: exists ? "pass" : required ? "fail" : "skip",
      exit_code: exists ? 0 : 1,
      required,
      path,
      output: `exists=${exists}`,
    };
  }
  return {
    name: String(type),
    status: required ? "fail" : "skip",
    exit_code: required ? 1 : 0,
    required,
    output: `Unsupported check type: ${String(type)}`,
  };
}

function appendProgress(entry: ProgressEntry): void {
  const lines: string[] = [
    `- timestamp_utc: ${entry.timestamp_utc}`,
    `  task_id: ${entry.task_id}`,
    `  agent_prompt: ${entry.agent_prompt.replace(/\n/g, " ")}`,
    `  result: ${entry.result}`,
    "  checks:",
  ];
  for (const check of entry.checks) {
    lines.push(`    - name: ${check.name}`);
    lines.push(`      status: ${check.status}`);
    lines.push(`      exit_code: ${check.exit_code}`);
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
  return `${task.id}: ${(task.objective ?? "(no objective)").replace(/\n/g, " ")}`;
}

function runTask(task: Task, args: CLIArgs): [string, CheckResult[]] {
  const checks: CheckResult[] = [];

  if (args.agentCmd) {
    const result = runCommand(args.agentCmd, Number.parseInt(args.timeout, 10));
    checks.push({
      name: "agent_command",
      status: result.status,
      exit_code: result.exit_code,
      required: true,
      command: args.agentCmd,
      output: result.output,
    });
    if (result.status === "fail") return ["fail", checks];
  }

  for (const check of task.acceptance) checks.push(runCheck(check));

  const passed = checks.every((check) => check.status === "pass" || (check.status === "skip" && !check.required));
  return [passed ? "pass" : "fail", checks];
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
  const next = nextTask(tasks);
  return [
    `Pending: ${counts.pending}`,
    `In Progress: ${counts.in_progress}`,
    `Done: ${counts.done}`,
    `Failed: ${counts.failed}`,
    `Blocked: ${counts.blocked}`,
    `Next: ${next?.id ?? "none"}`,
  ].join("\n");
}

interface CLIArgs {
  command: "run" | "status";
  taskId?: string;
  agentCmd?: string;
  timeout: string;
}

function parseArgs(argv: string[]): CLIArgs | null {
  if (argv.length === 0 || (argv[0] !== "run" && argv[0] !== "status")) return null;
  const command = argv[0] as "run" | "status";
  if (command === "status") return { command };

  const args: CLIArgs = { command, timeout: "120" };
  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--task-id") {
      args.taskId = argv[i + 1];
      i += 1;
    } else if (arg === "--agent-cmd") {
      args.agentCmd = argv[i + 1];
      i += 1;
    } else if (arg === "--timeout") {
      args.timeout = argv[i + 1] ?? "120";
      i += 1;
    }
    i += 1;
  }
  return args;
}

function printUsage(): never {
  const help = `
Usage:
  npm run loop:status
  npm run loop:run
  npm run loop:run -- --task-id T-002
  npm run loop:run -- --agent-cmd "echo done"
  `.trim();
  console.log(help);
  process.exit(2);
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) return printUsage();

  const [tasks, rawLines] = parseTasks(TASKS_PATH);

  if (parsed.command === "status") {
    console.log(statusReport(tasks));
    return 0;
  }

  let task: Task | null;
  if (parsed.taskId) {
    task = tasks.find((item) => item.id === parsed.taskId) ?? null;
    if (!task) {
      console.log(`Task not found: ${parsed.taskId}`);
      return 2;
    }
    if (task.status !== "pending") {
      console.log(`Task ${parsed.taskId} is not pending (status=${task.status})`);
      return 2;
    }
  } else {
    task = nextTask(tasks);
    if (!task) {
      console.log("No executable pending task");
      return 0;
    }
  }

  const beforeRun = [...rawLines];
  updateTaskStatus(task.id, "in_progress", beforeRun);
  writeTasks(beforeRun);
  console.log(`Running: ${summarizeTask(task)}`);

  const [iterationResult, checks] = runTask(task, parsed);
  const newStatus: Status = iterationResult === "pass" ? "done" : "failed";
  const afterRun = (() => {
    const [tasksAfter, linesAfter] = parseTasks(TASKS_PATH);
    return [tasksAfter, linesAfter] as const;
  })();
  updateTaskStatus(task.id, newStatus, afterRun[1]);
  writeTasks(afterRun[1]);

  const failed = checks.filter((check) => check.status !== "pass");
  const excerpt = failed[0]?.output || checks.map((c) => `${c.name}=${c.status}`).join(" ");
  const next = computeNextAfter(afterRun[0], task!.id);
  appendProgress({
    timestamp_utc: nowUtc(),
    task_id: task.id,
    agent_prompt: task.objective ?? "",
    result: iterationResult === "pass" ? "success" : "fail",
    checks,
    stdout_excerpt: excerpt.slice(0, 1200),
    next,
    notes: "Completed via ralph-loop.ts",
  });

  console.log(`Result: ${iterationResult === "pass" ? "success" : "fail"}`);
  if (next) console.log(`Next task: ${next}`);

  return iterationResult === "pass" ? 0 : 1;
}

process.exit(main());
