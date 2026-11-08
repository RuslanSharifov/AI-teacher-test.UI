export class ApiError extends Error {
  constructor(message, status, data, { path = "", method = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.code = data?.code || "unknown_error";
    this.traceId = data?.traceId || "";
    this.errors = data && typeof data.errors === "object" && !Array.isArray(data.errors)
      ? data.errors : {};
    this.path = path;
    this.method = method;
  }
}

// Never log submitted credentials or uploaded file contents.
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
    if (error?.name === "AbortError") throw error;
    throw new ApiError("API-yə qoşulmaq olmadı. Backend və şəbəkə bağlantısını yoxlayın.",
      0, { code: "network_error", errors: {} }, { path, method });
  }

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = data && typeof data === "object"
      ? data.message || data.detail || data.title || "Sorğuda xəta var."
      : (typeof data === "string" && data.length < 400 ? data : "API sorğusu alınmadı.");
    throw new ApiError(message, response.status, data, { path, method });
  }
  return data;
}
