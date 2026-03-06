export const APP_HEALTH_STATUS = "ok" as const;

export interface AppHealth {
  service: string;
  status: typeof APP_HEALTH_STATUS;
}

export function getAppHealth(): AppHealth {
  return {
    service: "ralph-app",
    status: APP_HEALTH_STATUS,
  };
}
