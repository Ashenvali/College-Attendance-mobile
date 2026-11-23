import type { ApiEnvelope } from '../types';
import { sessionStore } from './session';

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const REQUEST_TIMEOUT_MS = 20000;
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStore.get();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  // A request that never settles would leave the sign-in button spinning forever, which reads as
  // "nothing happens" on a flaky connection. Fail after 20s with a message the user can act on.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, headers, signal: init.signal ?? controller.signal }); }
  catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new ApiError('The server took too long to respond. Check your connection and try again.', 0);
    throw new ApiError('Network connection failed. Check that the BITS Kurnool API is running.', 0);
  }
  finally { clearTimeout(timeout); }
  const payload = await response.json().catch(() => ({ success: false, message: 'The server returned an unreadable response.' }));
  if (!response.ok || payload.success === false) {
    if (response.status === 401) {
      try { window.dispatchEvent(new Event('bits-session-expired')); } catch { /* non-browser render */ }
    }
    throw new ApiError(payload.message || `Request failed (${response.status})`, response.status);
  }
  return (payload as ApiEnvelope<T>).data;
}
