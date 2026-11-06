-- 0002: security hardening + absent-student SMS support. All statements are idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "attendance_session_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_attendance_session_id_fk" FOREIGN KEY ("attendance_session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD COLUMN IF NOT EXISTS "message" text;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD COLUMN IF NOT EXISTS "error_detail" varchar(200);--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_campaigns_attendance_session_uq" ON "sms_campaigns" USING btree ("attendance_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_recipients_campaign_student_uq" ON "sms_recipients" USING btree ("campaign_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_recipients_status_idx" ON "sms_recipients" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_recipients_provider_idx" ON "sms_recipients" USING btree ("provider_id");--> statement-breakpoint
-- Row Level Security: the API connects with the database owner role (bypasses RLS). Supabase's public REST
-- API (anon / authenticated roles) gets NO access because no policies exist.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END $$;
