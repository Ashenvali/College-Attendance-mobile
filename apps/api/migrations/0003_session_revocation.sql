-- 0003: server-side session revocation. Idempotent.
-- Every token carries the user's session_version; incrementing it invalidates all previously
-- issued tokens for that user (sign-out, revoke-all, password change, admin password reset).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
