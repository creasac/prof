ALTER TABLE "user" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;
--> statement-breakpoint
ALTER TABLE "learn_session" ADD COLUMN "course_id" text;
--> statement-breakpoint
UPDATE "learn_session" SET "course_id" = "id" WHERE "course_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" USING btree ("username");
--> statement-breakpoint
CREATE INDEX "learn_session_course_id_idx" ON "learn_session" USING btree ("course_id");
