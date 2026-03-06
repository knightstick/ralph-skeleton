const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_INTERVAL_SECONDS = 10;

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.replace(/\/$/, "");
}

function getNumberEnv(name, defaultValue) {
  const rawValue = process.env[name];
  if (!rawValue) return defaultValue;

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable ${name}: ${rawValue}`);
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ralph-deploy-smoke",
    },
  });
  const text = await response.text();
  return { response, text };
}

async function verifyBackend(baseUrl) {
  const { response, text } = await fetchText(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Backend health returned HTTP ${response.status}: ${text}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Backend health returned invalid JSON: ${String(error)}`);
  }

  if (payload.service !== "ralph-api") {
    throw new Error(`Backend service mismatch: ${JSON.stringify(payload)}`);
  }
  if (payload.status !== "ok") {
    throw new Error(`Backend status mismatch: ${JSON.stringify(payload)}`);
  }
}

async function verifyFrontend(baseUrl) {
  const { response, text } = await fetchText(baseUrl);
  if (!response.ok) {
    throw new Error(`Frontend returned HTTP ${response.status}`);
  }
  if (!text.includes("Production skeleton is live.")) {
    throw new Error("Frontend response did not include the expected heading.");
  }
  if (!text.includes("Backend status")) {
    throw new Error("Frontend response did not render backend status details.");
  }
  if (!text.includes("ralph-api")) {
    throw new Error("Frontend response did not include the live backend service name.");
  }
}

async function main() {
  const backendUrl = getRequiredEnv("BACKEND_PROD_URL");
  const frontendUrl = getRequiredEnv("FRONTEND_PROD_URL");
  const timeoutSeconds = getNumberEnv("SMOKE_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS);
  const intervalSeconds = getNumberEnv("SMOKE_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS);
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    try {
      await verifyBackend(backendUrl);
      await verifyFrontend(frontendUrl);
      console.log(`deploy-smoke:ok backend=${backendUrl} frontend=${frontendUrl}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`deploy-smoke:retry ${message}`);
      await sleep(intervalSeconds * 1000);
    }
  }

  throw new Error(`Deployment smoke check timed out after ${timeoutSeconds} seconds.`);
}

await main();
