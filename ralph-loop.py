#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import datetime
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


REPO_ROOT = Path(__file__).resolve().parent
TASKS_PATH = REPO_ROOT / "TASKS.md"
PROGRESS_PATH = REPO_ROOT / "PROGRESS.md"


Task = Dict[str, Any]


def now_utc() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def cast_scalar(raw: str) -> Any:
    raw = raw.strip()
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    if re.fullmatch(r"-?\d+", raw):
        try:
            return int(raw)
        except ValueError:
            pass
    return raw


def parse_list(raw: str) -> List[str]:
    raw = raw.strip()
    if raw == "[]":
        return []
    if not (raw.startswith("[") and raw.endswith("]")):
        return []
    inner = raw[1:-1].strip()
    if not inner:
        return []
    return [item.strip() for item in inner.split(",") if item.strip()]


def parse_tasks(path: Path) -> Tuple[List[Task], List[str]]:
    lines = path.read_text().splitlines(keepends=True)
    tasks: List[Task] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        start_match = re.match(r"^\s*- id:\s*(.+)$", line)
        if not start_match:
            i += 1
            continue

        task: Task = {
            "id": start_match.group(1).strip(),
            "status": None,
            "_start": i,
            "_status_line": None,
        }

        end = i + 1
        while end < len(lines):
            if re.match(r"^\s*- id:\s*.+$", lines[end]) and end != i:
                break
            end += 1

        j = i + 1
        while j < end:
            raw = lines[j].rstrip("\n")

            # Root level fields
            m = re.match(r"^(\s{2})([a-z_]+):\s*(.*)$", raw)
            if m:
                key = m.group(2)
                value = m.group(3).strip()
                if key == "status":
                    task["status"] = value or "pending"
                    task["_status_line"] = j
                elif key == "acceptance":
                    check_items: List[Dict[str, Any]] = []
                    k = j + 1
                    while k < end:
                        if re.match(r"^\s{4}-\s", lines[k]):
                            item_match = re.match(r"^\s{4}-\s*([a-z_]+):\s*(.*)$", lines[k])
                            if item_match:
                                check_item: Dict[str, Any] = {
                                    item_match.group(1): cast_scalar(item_match.group(2))
                                }
                                k += 1
                                while k < end:
                                    nested = lines[k].rstrip("\n")
                                    if re.match(r"^\s{4}-\s", nested):
                                        break
                                    if not nested.strip():
                                        k += 1
                                        continue
                                    m2 = re.match(r"^(\s{6})([a-z_]+):\s*(.*)$", nested)
                                    if not m2:
                                        k += 1
                                        continue
                                    nested_key = m2.group(2)
                                    nested_value = m2.group(3).strip()
                                    if nested_value == "|":
                                        nested_indent = len(m2.group(1))
                                        nested_lines: List[str] = []
                                        k += 1
                                        while k < end and len(lines[k]) - len(lines[k].lstrip()) > nested_indent:
                                            nested_lines.append(lines[k].rstrip("\n")[nested_indent + 2 :])
                                            k += 1
                                        check_item[nested_key] = "\n".join(
                                            [ln.rstrip() for ln in nested_lines]
                                        ).strip()
                                    else:
                                        check_item[nested_key] = cast_scalar(nested_value)
                                        k += 1
                                check_items.append(check_item)
                                continue
                        if re.match(r"^\s{2}[a-z_]+:\s*.*$", lines[k]) or re.match(r"^\s*$", lines[k]):
                            if not re.match(r"^\s{2}[a-z_]+:\s*.*$", lines[k]) or not lines[k].startswith("    "):
                                break
                        k += 1
                    task[key] = check_items
                    j = k - 1
                elif value == "|":
                    multiline_indent = len(m.group(1))
                    collected: List[str] = []
                    k = j + 1
                    while k < end and len(lines[k]) - len(lines[k].lstrip()) > multiline_indent:
                        collected.append(lines[k].rstrip("\n")[multiline_indent + 2 :].rstrip())
                        k += 1
                    task[key] = "\n".join(collected).rstrip()
                    j = k - 1
                elif value.startswith("[") and value.endswith("]") and key == "dependencies":
                    task[key] = parse_list(value)
                elif key == "priority":
                    task[key] = int(cast_scalar(value))
                else:
                    task[key] = cast_scalar(value)
            j += 1

        tasks.append(task)
        i = end

    return tasks, lines


def next_task(tasks: Sequence[Task]) -> Optional[Task]:
    status_by_id = {t["id"]: t.get("status") for t in tasks}
    candidates = []
    for task in tasks:
        if task.get("status") != "pending":
            continue
        deps = task.get("dependencies") or []
        blocked = False
        for dep in deps:
            if status_by_id.get(dep) != "done":
                blocked = True
                break
        if not blocked:
            candidates.append(task)
    if not candidates:
        return None
    return sorted(candidates, key=lambda t: int(t.get("priority", 10**9)))[0]


def compute_next_after(tasks: Sequence[Task], done_id: str) -> Optional[str]:
    remaining = [t for t in tasks if t["id"] != done_id and t.get("status") != "done"]
    if not remaining:
        return None
    status_by_id = {t["id"]: t.get("status") for t in tasks}
    candidates = []
    for task in remaining:
        if task.get("status") != "pending":
            continue
        deps = task.get("dependencies") or []
        if all(status_by_id.get(dep) == "done" for dep in deps):
            candidates.append(task)
    if not candidates:
        return None
    return sorted(candidates, key=lambda t: int(t.get("priority", 10**9)))[0]["id"]


def update_task_status(task_id: str, status: str, lines: List[str]) -> None:
    in_task = False
    for idx, line in enumerate(lines):
        task_match = re.match(rf"^\\s*- id:\\s*{re.escape(task_id)}\\s*$", line.rstrip("\n"))
        if task_match:
            in_task = True
            continue
        if in_task and re.match(r"^\s{2}status:\s*", line):
            lines[idx] = re.sub(
                r"^(\s{2}status:)\s*.*$",
                lambda m: f"{m.group(1)} {status}",
                line,
            )
            break
        if in_task and re.match(r"^\s*- id:\s*.+$", line):
            raise RuntimeError(f"Malformed TASKS.md: status missing for task {task_id}")
    else:
        raise RuntimeError(f"Task not found: {task_id}")


def write_tasks(path: Path, lines: List[str]) -> None:
    path.write_text("".join(lines))


def run_command(command: str, timeout: int = 120, cwd: Path = REPO_ROOT) -> Dict[str, Any]:
    try:
        cp = subprocess.run(
            command,
            cwd=str(cwd),
            shell=True,
            executable="/bin/bash",
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "status": "pass" if cp.returncode == 0 else "fail",
            "exit_code": cp.returncode,
            "output": (cp.stdout or "") + (cp.stderr or ""),
        }
    except subprocess.TimeoutExpired:
        return {"status": "fail", "exit_code": 124, "output": f"Timed out after {timeout}s"}
    except Exception as exc:  # pragma: no cover
        return {"status": "fail", "exit_code": 1, "output": str(exc)}


def run_check(check: Dict[str, Any]) -> Dict[str, Any]:
    check_type = check.get("type")
    required = bool(check.get("required", True))
    name = check_type
    if check_type == "command":
        command = str(check.get("command", ""))
        timeout = int(check.get("timeout_seconds", 120))
        result = run_command(command, timeout=timeout)
        return {
            "name": name,
            "status": result["status"] if required else result["status"] if result["status"] == "pass" else "skip",
            "exit_code": result["exit_code"],
            "command": command,
            "required": required,
            "output": result["output"],
        }
    if check_type == "file_exists":
        path = str(check.get("path", "")).strip()
        exists = bool(path) and Path(path).exists()
        return {
            "name": name,
            "status": "pass" if exists else ("skip" if not required else "fail"),
            "exit_code": 0 if exists else 1,
            "path": path,
            "required": required,
            "output": f"exists={exists}",
        }
    return {
        "name": str(check_type),
        "status": "skip" if not required else "fail",
        "exit_code": 1 if required else 0,
        "required": required,
        "output": f"Unsupported check type: {check_type}",
    }


def yaml_block_scalar(value: str, indent: int) -> List[str]:
    ind = " " * indent
    if "\n" not in value and len(value) < 200:
        return [f"{ind}{value}\n"]
    safe = value.replace("\n", "\n" + ind + "  ")
    return [f"{ind}|-\n", f"{ind}  {safe}\n"]


def append_progress(entry: Dict[str, Any]) -> None:
    lines = [
        f"- timestamp_utc: {entry['timestamp_utc']}\n",
        f"  task_id: {entry['task_id']}\n",
        f"  agent_prompt: {entry.get('agent_prompt', '').replace(chr(10), ' ')}\n",
        f"  result: {entry['result']}\n",
        "  checks:\n",
    ]
    for check in entry.get("checks", []):
        lines.append(f"    - name: {check['name']}\n")
        lines.append(f"      status: {check['status']}\n")
        lines.append(f"      exit_code: {check['exit_code']}\n")
        if "command" in check:
            lines.append(f"      command: {check['command']}\n")
        if "path" in check:
            lines.append(f"      path: {check['path']}\n")
        lines.append(f"      required: {str(check.get('required', True)).lower()}\n")
    summary = entry.get("stdout_excerpt", "").rstrip()
    if summary:
        lines.append("  stdout_excerpt: |\n")
        for ln in summary.split("\n"):
            lines.append(f"    {ln}\n")
    else:
        lines.append("  stdout_excerpt: \"\"\n")
    lines.append(f"  next: {entry.get('next') or 'none'}\n")
    lines.append("  notes: |\n")
    for ln in str(entry.get("notes", "")).split("\n"):
        lines.append(f"    {ln}\n")

    with PROGRESS_PATH.open("a", encoding="utf-8") as fp:
        if PROGRESS_PATH.exists() and PROGRESS_PATH.stat().st_size > 0:
            fp.write("\n")
        fp.writelines(lines)


def run_task(task: Task, tasks: List[Task], args: argparse.Namespace) -> Tuple[str, List[Dict[str, Any]]]:
    checks: List[Dict[str, Any]] = []

    agent_command = args.agent_cmd or task.get("agent_command")
    if agent_command:
        result = run_command(agent_command, timeout=int(args.timeout), cwd=REPO_ROOT)
        checks.append(
            {
                "name": "agent_command",
                "status": result["status"],
                "exit_code": result["exit_code"],
                "command": agent_command,
                "required": True,
                "output": result["output"],
            }
        )
        if result["status"] == "fail":
            return "fail", checks

    for check in task.get("acceptance", []) or []:
        checks.append(run_check(check))

    result = "pass"
    for check in checks:
        if check["status"] in {"fail"}:
            result = "fail"
            break
    return result, checks


def summarize_task(task: Task) -> str:
    objective = task.get("objective", "(no objective)").replace("\n", " ")
    return f"{task.get('id')}: {objective}"


def status_report(tasks: Sequence[Task]) -> str:
    counts = {"pending": 0, "in_progress": 0, "done": 0, "failed": 0, "blocked": 0, "other": 0}
    for task in tasks:
        status = task.get("status", "other")
        if status in counts:
            counts[status] += 1
        else:
            counts["other"] += 1
    nxt = next_task(tasks)
    lines = [
        f"Pending: {counts['pending']}",
        f"In Progress: {counts['in_progress']}",
        f"Done: {counts['done']}",
        f"Failed: {counts['failed']}",
        f"Blocked: {counts['blocked']}",
        f"Next: {nxt['id'] if nxt else 'none'}",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ralph loop controller")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status_parser = subparsers.add_parser("status", help="show task queue status")
    status_parser.set_defaults(func="status")

    run_parser = subparsers.add_parser("run", help="run one task iteration")
    run_parser.add_argument("--task-id", help="run a specific task id")
    run_parser.add_argument(
        "--agent-cmd",
        help="agent command to execute for this task",
    )
    run_parser.add_argument("--timeout", default="120", help="agent timeout in seconds")
    run_parser.set_defaults(func="run")

    args = parser.parse_args()
    tasks, lines = parse_tasks(TASKS_PATH)

    if args.func == "status":
        print(status_report(tasks))
        return 0

    task = None
    if args.task_id:
        for candidate in tasks:
            if candidate.get("id") == args.task_id:
                task = candidate
                break
        if task is None:
            print(f"Task not found: {args.task_id}")
            return 2
        if task.get("status") != "pending":
            print(f"Task {args.task_id} is not pending (status={task.get('status')})")
            return 2
    else:
        task = next_task(tasks)
        if task is None:
            print("No executable pending task")
            return 0

    update_task_status(task["id"], "in_progress", lines)
    write_tasks(TASKS_PATH, lines)
    print(f"Running: {summarize_task(task)}")

    result, checks = run_task(task, tasks, args)
    checks_status = ["pass" if c["status"] == "pass" else "fail" for c in checks]

    next_status = "done" if all(s == "pass" for s in checks_status) else "failed"
    final = "success" if next_status == "done" else "fail"

    # reload task status lines for update
    tasks_after, updated_lines = parse_tasks(TASKS_PATH)
    update_task_status(task["id"], next_status, updated_lines)
    write_tasks(TASKS_PATH, updated_lines)

    failed = [c for c in checks if c["status"] != "pass"]
    excerpt = failed[0]["output"] if failed else ""
    if not excerpt:
        excerpt = " ".join(f"{c['name']}={c['status']}" for c in checks)

    next_candidate = compute_next_after(tasks_after, task["id"])
    append_progress(
        {
            "timestamp_utc": now_utc(),
            "task_id": task["id"],
            "agent_prompt": task.get("objective", ""),
            "result": final,
            "checks": checks,
            "stdout_excerpt": excerpt[:1200],
            "next": next_candidate,
            "notes": "Completed via ralph-loop.py",
        }
    )

    print(f"Result: {final}")
    if next_candidate:
        print(f"Next task: {next_candidate}")
    return 0 if final == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
