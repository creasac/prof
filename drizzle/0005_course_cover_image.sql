ALTER TABLE "course" ADD COLUMN "cover_image_key" text;
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "cover_image_mime_type" text;
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "cover_image_prompt" text;
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "cover_image_alt_text" text;
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "cover_image_updated_at" timestamp with time zone;
