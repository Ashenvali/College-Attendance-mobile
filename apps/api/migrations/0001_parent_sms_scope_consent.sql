ALTER TABLE "sms_campaigns" ADD COLUMN "target_department_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "target_section_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "parent_sms_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_target_department_id_departments_id_fk" FOREIGN KEY ("target_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_target_section_id_sections_id_fk" FOREIGN KEY ("target_section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_recipients" ADD CONSTRAINT "sms_recipients_student_id_student_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_campaigns_target_department_idx" ON "sms_campaigns" USING btree ("target_department_id");--> statement-breakpoint
CREATE INDEX "sms_campaigns_target_section_idx" ON "sms_campaigns" USING btree ("target_section_id");--> statement-breakpoint
CREATE INDEX "sms_recipients_campaign_student_idx" ON "sms_recipients" USING btree ("campaign_id","student_id");