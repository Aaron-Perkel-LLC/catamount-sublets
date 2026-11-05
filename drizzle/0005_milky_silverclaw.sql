CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"used" text NOT NULL,
	"outcome" text,
	"overall" smallint NOT NULL,
	"useful" text[] DEFAULT '{}' NOT NULL,
	"signin" text,
	"vs_legacy" text,
	"problems" text DEFAULT '' NOT NULL,
	"missing" text DEFAULT '' NOT NULL,
	"recommend" smallint,
	"lejer" text,
	"followup" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_responses_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "survey_responses_used_check" CHECK ("survey_responses"."used" in ('posted', 'looked', 'both', 'browsed', 'not_yet')),
	CONSTRAINT "survey_responses_outcome_check" CHECK ("survey_responses"."outcome" is null or "survey_responses"."outcome" in ('found', 'filled', 'still_looking', 'no_longer_needed', 'too_early')),
	CONSTRAINT "survey_responses_overall_check" CHECK ("survey_responses"."overall" between 1 and 5),
	CONSTRAINT "survey_responses_useful_check" CHECK ("survey_responses"."useful" <@ array['grid', 'map', 'filters', 'photos', 'share_link', 'email_code', 'contact_poster', 'mobile']::text[]),
	CONSTRAINT "survey_responses_signin_check" CHECK ("survey_responses"."signin" is null or "survey_responses"."signin" in ('easy', 'fine', 'annoying', 'could_not')),
	CONSTRAINT "survey_responses_vs_legacy_check" CHECK ("survey_responses"."vs_legacy" is null or "survey_responses"."vs_legacy" in ('better', 'same', 'worse', 'never_used')),
	CONSTRAINT "survey_responses_recommend_check" CHECK ("survey_responses"."recommend" is null or "survey_responses"."recommend" between 1 and 5),
	CONSTRAINT "survey_responses_lejer_check" CHECK ("survey_responses"."lejer" is null or "survey_responses"."lejer" in ('would_try', 'not_for_me', 'already_use'))
);
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;