export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function request(path, { method = "GET", body, token, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const isForm = body instanceof FormData;
  if (body != null && !isForm) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body == null ? undefined : isForm ? body : JSON.stringify(body),
      signal
    });
  } catch (error) {
    throw new ApiError("API ilə əlaqə qurulmadı. Backend-in 5199 portunda işlədiyini yoxla.", 0, error);
  }

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = typeof data === "object" && data !== null
      ? data.detail || data.title || data.message || "Sorğu uğursuz oldu."
      : String(data || "Sorğu uğursuz oldu.");
    throw new ApiError(message, response.status, data);
  }
  return data;
}
