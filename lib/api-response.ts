/** Never display a framework HTML document as a JSON parsing error. */
export async function readApiResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    if (response.redirected || response.status === 401) throw new Error("Your session may have expired. Sign in again and retry.");
    throw new Error(`The server did not return an API response (HTTP ${response.status}). Refresh the page and retry. If it continues, restart or redeploy the server.`);
  }
  try { return await response.json() as T; }
  catch { throw new Error("The server returned an unreadable response. Refresh the page and retry."); }
}
