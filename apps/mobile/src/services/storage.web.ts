/**
 * Browser build of the session store. Metro resolves `storage` to this file for the web target,
 * so native builds keep using expo-secure-store (see storage.ts).
 *
 * This is for the evaluation build only: a browser has no keychain, so the token lives in
 * localStorage and is readable by any script on the origin. Production mobile builds use the
 * keychain/keystore variant.
 */
const PREFIX = 'bitsknl.';

export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    try { window.localStorage.setItem(PREFIX + key, value); } catch { /* storage blocked */ }
  },
  async removeItem(key: string): Promise<void> {
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* storage blocked */ }
  },
};

/** False on web: the demo build does not have an OS keychain. */
export const usesSecureKeychain = false;
