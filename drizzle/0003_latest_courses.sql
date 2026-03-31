ALTER TABLE "course" ADD COLUMN "artifact_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "snapshot" jsonb;
--> statement-breakpoint
UPDATE "course"
SET
	"title" = "course_version"."title",
	"artifact_count" = "course_version"."artifact_count",
	"snapshot" = "course_version"."snapshot",
	"updated_at" = GREATEST("course"."updated_at", "course_version"."created_at")
FROM "course_version"
WHERE "course_version"."course_id" = "course"."id"
  AND "course_version"."version_number" = "course"."latest_version_number";
--> statement-breakpoint
DELETE FROM "course" WHERE "snapshot" IS NULL;
--> statement-breakpoint
ALTER TABLE "course" ALTER COLUMN "snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "course" DROP COLUMN "latest_version_number";
--> statement-breakpoint
DROP TABLE "course_version";
