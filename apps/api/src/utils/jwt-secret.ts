const APP_JWT_SECRET_NAME = 'BITSKNL_AUTH_SIGNING_SECRET';
const DEVELOPMENT_JWT_SECRET = 'dev-only-bits-kurnool-secret-change-me';
const isDevLike = () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export function getJwtSecret(): string {
  const appSecret = process.env[APP_JWT_SECRET_NAME];
  if (appSecret && appSecret.length >= 32 && appSecret !== DEVELOPMENT_JWT_SECRET && !appSecret.startsWith('replace-with')) return appSecret;
  // The built-in development secret is allowed ONLY when NODE_ENV is explicitly "development" or "test".
  if (isDevLike()) return appSecret || process.env.JWT_SECRET || DEVELOPMENT_JWT_SECRET;
  throw new Error(`${APP_JWT_SECRET_NAME} must be set to a unique value of at least 32 characters (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}).`);
}

/** Fail fast at startup in every environment except explicit development/test. */
export function assertProductionJwtSecret(): void { getJwtSecret(); }
