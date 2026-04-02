CREATE TABLE "usage_access_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_key" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_access_grant_campaign_not_blank" CHECK (char_length(btrim("usage_access_grant"."campaign_key")) > 0),
	CONSTRAINT "usage_access_grant_scope_valid" CHECK ("usage_access_grant"."scope" in ('all', 'live', 'text')),
	CONSTRAINT "usage_access_grant_window_valid" CHECK ("usage_access_grant"."expires_at" > "usage_access_grant"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "usage_access_grant" ADD CONSTRAINT "usage_access_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_access_grant_user_campaign_unique" ON "usage_access_grant" USING btree ("user_id","campaign_key");--> statement-breakpoint
CREATE INDEX "usage_access_grant_user_expires_at_idx" ON "usage_access_grant" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "usage_access_grant_user_revoked_at_idx" ON "usage_access_grant" USING btree ("user_id","revoked_at");