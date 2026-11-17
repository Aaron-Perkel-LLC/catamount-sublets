ALTER TABLE "listings" ADD COLUMN "visibility_chosen_at" timestamp with time zone;--> statement-breakpoint
-- Hand-appended: 0010 made every listing posted before it signed-in only, and
-- until this deploy only the poster could undo that (the My post switch or the
-- post form; there was no admin control). So a listing posted before 0010 that
-- is public now was switched by its poster, at or before its updated_at (both
-- paths stamp it). Record that as their choice. Listings switched public and
-- back again leave no trace here; they are found in the logs instead. The
-- literal is PUBLIC_BY_DEFAULT_SINCE in src/lib/visibility-rollout.ts.
UPDATE "listings" SET "visibility_chosen_at" = "updated_at" WHERE NOT "signed_in_only" AND "posted_at" < '2026-11-17T04:50:00Z';
