import type { ApiEnvelope } from '../types';

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('bits-token');
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, headers }); }
  catch { throw new ApiError('Network connection failed. Check that the BITS Kurnool API is running.', 0); }
  const payload = await response.json().catch(() => ({ success: false, message: 'The server returned an unreadable response.' }));
  if (!response.ok || payload.success === false) {
    if (response.status === 401) window.dispatchEvent(new Event('bits-session-expired'));
    throw new ApiError(payload.message || `Request failed (${response.status})`, response.status);
  }
  return (payload as ApiEnvelope<T>).data;
}
