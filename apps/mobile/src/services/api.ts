declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
let token: string | null = null;
export function setToken(next: string | null) { token = next; }
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.message || `Request failed (${response.status})`);
  return body.data as T;
}
