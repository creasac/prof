CREATE TABLE "course" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"latest_version_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_version" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" text,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"artifact_count" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_version" ADD CONSTRAINT "course_version_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_version" ADD CONSTRAINT "course_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "course_owner_id_idx" ON "course" USING btree ("owner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "course_owner_slug_unique" ON "course" USING btree ("owner_id","slug");
--> statement-breakpoint
CREATE INDEX "course_updated_at_idx" ON "course" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "course_version_course_id_idx" ON "course_version" USING btree ("course_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "course_version_course_version_unique" ON "course_version" USING btree ("course_id","version_number");
--> statement-breakpoint
CREATE INDEX "course_version_parent_version_id_idx" ON "course_version" USING btree ("parent_version_id");
--> statement-breakpoint
CREATE INDEX "course_version_created_at_idx" ON "course_version" USING btree ("created_at");
