const API_BASE_URL = (window.UNIT_CONVERTER_API_BASE_URL || "").replace(/\/$/, "");

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (cause) {
    const error = new Error(
      "Could not reach the API adapter. Start the local Python service with `sh scripts/dev.sh` and reload the page.",
    );
    error.status = 0;
    error.code = "API_UNAVAILABLE";
    error.details = { cause: String(cause) };
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed.");
    error.status = response.status;
    error.code = payload?.error?.code || "REQUEST_FAILED";
    error.details = payload?.error?.details || {};
    throw error;
  }
  return payload;
}
