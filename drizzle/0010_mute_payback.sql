ALTER TABLE "listings" ADD COLUMN "signed_in_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "area_lat" double precision;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "area_lon" double precision;--> statement-breakpoint
ALTER TABLE "listing_events" ADD COLUMN "signed_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_area_check" CHECK (("listings"."area_lat" is null) = ("listings"."area_lon" is null));--> statement-breakpoint
-- Hand-appended: everyone who posted before signed-out browsing existed posted
-- for signed-in students only, so every existing listing stays that way until
-- its poster chooses otherwise. New rows take the column default (public).
UPDATE "listings" SET "signed_in_only" = true;
