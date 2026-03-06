import Fastify from "fastify";

const APP_SERVICE_NAME = "ralph-api" as const;
const APP_HEALTH_STATUS = "ok" as const;
const DEFAULT_PORT = 3001;

interface HealthPayload {
  service: typeof APP_SERVICE_NAME;
  status: typeof APP_HEALTH_STATUS;
  version: string;
  timestamp: string;
}

function resolvePort(): number {
  const rawPort = process.env.PORT;
  if (!rawPort) return DEFAULT_PORT;

  const parsedPort = Number.parseInt(rawPort, 10);
  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return parsedPort;
}

function resolveVersion(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.npm_package_version ||
    "0.1.0"
  );
}

export function getHealthPayload(): HealthPayload {
  return {
    service: APP_SERVICE_NAME,
    status: APP_HEALTH_STATUS,
    version: resolveVersion(),
    timestamp: new Date().toISOString(),
  };
}

export function buildServer() {
  const server = Fastify({
    logger: false,
  });

  server.get("/health", async () => getHealthPayload());
  server.get("/", async () => ({
    service: APP_SERVICE_NAME,
    docs: "/health",
  }));

  return server;
}

export async function startServer() {
  const server = buildServer();
  const port = resolvePort();
  const host = "0.0.0.0";

  await server.listen({ host, port });
  return server;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
