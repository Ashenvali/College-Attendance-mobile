import * as SecureStore from 'expo-secure-store';

/**
 * Session-token storage for native builds (iOS keychain / Android keystore via expo-secure-store).
 * The web build uses storage.web.ts instead, because SecureStore has no web implementation.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    try { return await SecureStore.getItemAsync(key, OPTIONS); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  },
  async removeItem(key: string): Promise<void> {
    try { await SecureStore.deleteItemAsync(key, OPTIONS); } catch { /* already gone */ }
  },
};

/** True when tokens live in the browser (web demo build) rather than an OS keychain. */
export const usesSecureKeychain = true;
