CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_event_actor_present" CHECK (num_nonnulls("usage_event"."user_id", "usage_event"."guest_id") = 1),
	CONSTRAINT "usage_event_kind_valid" CHECK ("usage_event"."kind" in ('live', 'text'))
);
--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_event_user_kind_created_at_idx" ON "usage_event" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "usage_event_guest_kind_created_at_idx" ON "usage_event" USING btree ("guest_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "usage_event_created_at_idx" ON "usage_event" USING btree ("created_at");
