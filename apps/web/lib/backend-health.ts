interface BackendHealthResponse {
  service: string;
  status: string;
  version: string;
  timestamp: string;
}

interface BackendHealthView {
  available: boolean;
  service: string;
  status: string;
  version: string;
  timestamp: string;
  source: string;
  message: string;
}

function normalizeBaseUrl(rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  if (!value) return null;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function unavailableView(message: string): BackendHealthView {
  return {
    available: false,
    service: "unavailable",
    status: "unavailable",
    version: "n/a",
    timestamp: "n/a",
    source: "API_BASE_URL",
    message,
  };
}

export async function getBackendHealthView(): Promise<BackendHealthView> {
  const baseUrl = normalizeBaseUrl(process.env.API_BASE_URL);
  if (!baseUrl) {
    return unavailableView("API_BASE_URL is not configured for this Vercel environment.");
  }

  const endpoint = `${baseUrl}/health`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
    });

    if (!response.ok) {
      return unavailableView(`Backend responded with HTTP ${response.status} from ${endpoint}.`);
    }

    const payload = (await response.json()) as Partial<BackendHealthResponse>;
    if (
      typeof payload.service !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.version !== "string" ||
      typeof payload.timestamp !== "string"
    ) {
      return unavailableView(`Backend payload shape was invalid at ${endpoint}.`);
    }

    return {
      available: true,
      service: payload.service,
      status: payload.status,
      version: payload.version,
      timestamp: payload.timestamp,
      source: endpoint,
      message: `Live backend status fetched successfully from ${endpoint}.`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailableView(`Backend request failed for ${endpoint}: ${message}`);
  }
}
