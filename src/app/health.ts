export const APP_HEALTH_STATUS = "ok" as const;
export const APP_SERVICE_NAME = "ralph-app" as const;

export interface AppHealth {
  service: string;
  status: typeof APP_HEALTH_STATUS;
}

export function getAppHealth(): AppHealth {
  return {
    service: APP_SERVICE_NAME,
    status: APP_HEALTH_STATUS,
  };
}

export function runAppHealthSmokeCheck(): AppHealth {
  const health = getAppHealth();

  if (health.service !== APP_SERVICE_NAME) {
    throw new Error(`Unexpected service name: ${health.service}`);
  }

  if (health.status !== APP_HEALTH_STATUS) {
    throw new Error(`Unexpected app health status: ${health.status}`);
  }

  return health;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const health = runAppHealthSmokeCheck();
  console.log(`${health.service}:${health.status}`);
}
