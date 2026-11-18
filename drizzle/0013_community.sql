CREATE TABLE "poster_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer,
	"poster_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resend_id" text,
	"error" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poster_messages_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "poster_messages_status_check" CHECK ("poster_messages"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tier" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "accepts_outside_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_events" ADD COLUMN "viewer_tier" text;--> statement-breakpoint
ALTER TABLE "notice_events" ADD COLUMN "viewer_tier" text;--> statement-breakpoint
ALTER TABLE "poster_messages" ADD CONSTRAINT "poster_messages_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_messages" ADD CONSTRAINT "poster_messages_poster_id_user_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_messages" ADD CONSTRAINT "poster_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poster_messages_sender_idx" ON "poster_messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "poster_messages_listing_idx" ON "poster_messages" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "poster_messages_poster_idx" ON "poster_messages" USING btree ("poster_id");--> statement-breakpoint
CREATE INDEX "poster_messages_created_idx" ON "poster_messages" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tier_check" CHECK ("user"."tier" in ('student', 'community'));--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_viewer_tier_check" CHECK ("listing_events"."viewer_tier" is null or "listing_events"."viewer_tier" in ('anonymous', 'community', 'student'));--> statement-breakpoint
ALTER TABLE "notice_events" ADD CONSTRAINT "notice_events_viewer_tier_check" CHECK ("notice_events"."viewer_tier" is null or "notice_events"."viewer_tier" in ('anonymous', 'community', 'student'));--> statement-breakpoint
-- Backfill (hand-written). Every account that exists before 0013 was created under the old rule
-- (netid@uvm.edu, the admin, or an address the admin approved), so every one is a student. Accounts
-- created after this runs get their tier from assertEmailAllowed(); one created by the old code
-- between this migration and the deploy gets the column default, community, and is put right by
-- `npm run backfill-tiers -- --apply` after the deploy.
UPDATE "user" SET "tier" = 'student';--> statement-breakpoint
UPDATE "listing_events" SET "viewer_tier" = CASE WHEN "signed_out" THEN 'anonymous' ELSE 'student' END;--> statement-breakpoint
UPDATE "notice_events" SET "viewer_tier" = CASE WHEN "signed_out" THEN 'anonymous' ELSE 'student' END;
