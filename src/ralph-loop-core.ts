import yaml from "js-yaml";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export type Status = "pending" | "in_progress" | "blocked" | "done" | "failed";
export type CheckType = "command" | "file_exists";
export type FailureCategory = "validation" | "execution" | "environment" | "agent" | "unsupported_check" | "none";

export interface Check {
  type?: CheckType | string;
  command?: string;
  path?: string;
  required?: boolean;
  timeout_seconds?: number;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  title: string;
  status: Status;
  priority: number;
  dependencies: string[];
  owner: string;
  objective: string;
  acceptance: Check[];
  notes?: string;
}

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  exit_code: number;
  required: boolean;
  failure_category: FailureCategory;
  command?: string;
  path?: string;
  output: string;
}

function ensureString(value: unknown, field: string, lineRef?: number): string {
  if (typeof value !== "string" || !value.trim()) {
    const location = typeof lineRef === "number" ? ` at line ${lineRef}` : "";
    throw new Error(`Invalid ${field}${location}: expected non-empty string`);
  }
  return value.trim();
}

function ensureInteger(value: unknown, field: string, lineRef?: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    const location = typeof lineRef === "number" ? ` at line ${lineRef}` : "";
    throw new Error(`Invalid ${field}${location}: expected integer`);
  }
  return value;
}

function ensureStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}: expected array`);
  }
  return value.map((item, idx) => {
    if (typeof item !== "string") {
      throw new Error(`Invalid ${field}[${idx}]: expected string`);
    }
    return item;
  });
}

function ensureCheckArray(value: unknown, taskId: string): Check[] {
  if (!Array.isArray(value)) throw new Error(`Invalid acceptance for task ${taskId}: expected array`);
  return value as Check[];
}

function validateCheck(check: Check, taskId: string): void {
  const type = ensureString(check.type ?? "command", `acceptance.type for ${taskId}`);
  if (!["command", "file_exists"].includes(type)) {
    throw new Error(`Invalid check type "${type}" for task ${taskId}: unsupported`);
  }
  if (type === "command") {
    ensureString(check.command, `acceptance.command for ${taskId}`);
  }
  if (type === "file_exists") {
    ensureString(check.path, `acceptance.path for ${taskId}`);
  }
  if (check.required !== undefined && typeof check.required !== "boolean") {
    throw new Error(`Invalid acceptance.required for task ${taskId}: expected boolean`);
  }
}

function validateTask(rawTask: Record<string, unknown>, lineRef: number): Task {
  const id = ensureString(rawTask.id, "id", lineRef);
  const title = ensureString(rawTask.title, "title", lineRef);
  const status = ensureString(rawTask.status, "status", lineRef) as Status;
  if (!["pending", "in_progress", "blocked", "done", "failed"].includes(status)) {
    throw new Error(`Invalid status "${status}" for task ${id}`);
  }

  const priority = ensureInteger(rawTask.priority, "priority", lineRef);
  const dependencies = ensureStringArray(rawTask.dependencies ?? [], `dependencies for ${id}`);
  const owner = ensureString(rawTask.owner, "owner", lineRef);
  const objective = ensureString(rawTask.objective, "objective", lineRef);
  const acceptance = ensureCheckArray(rawTask.acceptance, id);
  for (const check of acceptance) validateCheck(check, id);
  const notes = typeof rawTask.notes === "string" ? rawTask.notes : "";

  return {
    id,
    title,
    status,
    priority,
    dependencies,
    owner,
    objective,
    acceptance,
    notes,
  };
}

export function parseTasks(path: string): [Task[], string[]] {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  const tasks: Task[] = [];

  const tasksHeader = lines.findIndex((line) => line.trim() === "Tasks");
  if (tasksHeader === -1) throw new Error("Could not find 'Tasks' section in TASKS.md");

  let firstTask = -1;
  for (let i = tasksHeader + 1; i < lines.length; i += 1) {
    if (/^\- id:\s*/.test(lines[i])) {
      firstTask = i;
      break;
    }
  }
  if (firstTask === -1) return [[], lines];

  const taskStarts: number[] = [];
  for (let i = firstTask; i < lines.length; i += 1) {
    if (/^\- id:\s*/.test(lines[i])) taskStarts.push(i);
  }

  for (let i = 0; i < taskStarts.length; i += 1) {
    const start = taskStarts[i]!;
    const end = taskStarts[i + 1] ?? lines.length;
    const block = lines.slice(start, end).join("\n");
    const loadedNode = yaml.load(block);
    const loaded = Array.isArray(loadedNode)
      ? (loadedNode.length === 1 ? loadedNode[0] : null)
      : loadedNode;

    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      throw new Error(`Invalid task block near line ${start + 1}: not a mapping`);
    }
    tasks.push(validateTask(loaded as Record<string, unknown>, start + 1));
  }

  return [tasks, lines];
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
      e.code === "ENOENT" ||
      String(e.message ?? "").includes("not found") ||
      String(e.message ?? "").includes("command not found");
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

export function runCheck(check: Check): CheckResult {
  const type = ensureString(check.type ?? "command", `acceptance.type`);
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
      failure_category: exists ? "none" : required ? "execution" : "none",
      path,
      output: `exists=${exists}`,
    };
  }
  return {
    name: String(type),
    status: required ? "fail" : "skip",
    exit_code: required ? 1 : 0,
    required,
    failure_category: required ? "unsupported_check" : "none",
    output: `Unsupported check type: ${String(type)}`,
  };
}
