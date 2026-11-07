/**
 * Session storage that cannot throw.
 *
 * Embedded previews, privacy modes and sandboxed iframes can make `sessionStorage` access throw a
 * SecurityError. An unguarded read/write there crashes the React tree on sign-in (blank screen), so
 * every access goes through here and falls back to an in-memory map: the session then lives for the
 * lifetime of the tab instead of the tab's storage.
 */
const KEY = 'bits-token';
const memory = new Map<string, string>();
let storageAvailable: boolean | null = null;

function store(): Storage | null {
  if (storageAvailable === false) return null;
  try {
    // Touching the property itself throws in a blocked context, before any get/set.
    const candidate = window.sessionStorage;
    const probe = '__bits_probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    storageAvailable = true;
    return candidate;
  } catch {
    storageAvailable = false;
    return null;
  }
}

export const sessionStore = {
  get(): string | null {
    const backing = store();
    if (backing) {
      try { return backing.getItem(KEY) ?? memory.get(KEY) ?? null; } catch { /* fall through */ }
    }
    return memory.get(KEY) ?? null;
  },
  set(token: string): void {
    memory.set(KEY, token);
    try { store()?.setItem(KEY, token); } catch { /* memory copy is enough */ }
  },
  clear(): void {
    memory.delete(KEY);
    try { store()?.removeItem(KEY); } catch { /* memory copy is enough */ }
  },
  /** False when the browser refuses storage, so the UI can say the session is tab-only. */
  get isPersistent(): boolean {
    return store() !== null;
  },
};

export const TOKEN_KEY = KEY;
