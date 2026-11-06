// No fallback host: builds must set EXPO_PUBLIC_API_URL (see eas.json / apps/mobile/.env.example). Release builds must use https.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
if (!API_BASE_URL) console.warn('EXPO_PUBLIC_API_URL is not set; API requests will fail.');

let accessToken: string | null = null;
export function setToken(next: string | null) { accessToken = next; }
export function getToken() { return accessToken; }

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string; error?: { code?: string; message?: string } };

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) throw new Error('The app is not configured with an API address. Contact the college administrator.');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      ...options,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Could not connect to BITS Kurnool. Check your network and API address.');
  }

  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success || body.data === undefined) {
    throw new ApiError(body?.message || body?.error?.message || `Request failed (${response.status})`, response.status, body?.error?.code);
  }
  return body.data;
}
