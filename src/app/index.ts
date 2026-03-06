import { runAppHealthSmokeCheck } from "./health";

export function startApp(): string {
  const health = runAppHealthSmokeCheck();
  return `${health.service}:${health.status}`;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  console.log(startApp());
}
