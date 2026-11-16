CREATE TABLE "listing_outcome_asks" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester_code" text NOT NULL,
	"listing_id" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_outcome_asks_semester_listing_key" UNIQUE("semester_code","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_outcomes_listing_id_key" UNIQUE("listing_id"),
	CONSTRAINT "listing_outcomes_outcome_check" CHECK ("listing_outcomes"."outcome" in ('through_site', 'elsewhere', 'not_filled', 'still_available', 'skipped')),
	CONSTRAINT "listing_outcomes_source_check" CHECK ("listing_outcomes"."source" in ('delete', 'email')),
	CONSTRAINT "listing_outcomes_source_outcome_check" CHECK (("listing_outcomes"."source" = 'delete' and "listing_outcomes"."outcome" <> 'still_available') or ("listing_outcomes"."source" = 'email' and "listing_outcomes"."outcome" <> 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "confirmed_available_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "listing_outcome_asks_listing_idx" ON "listing_outcome_asks" USING btree ("listing_id");