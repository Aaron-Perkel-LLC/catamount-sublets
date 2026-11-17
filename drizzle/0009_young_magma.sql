CREATE TABLE "digest_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"week" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"searches" smallint DEFAULT 0 NOT NULL,
	"matches" smallint DEFAULT 0 NOT NULL,
	"resend_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_sends_user_week_key" UNIQUE("user_id","week"),
	CONSTRAINT "digest_sends_status_check" CHECK ("digest_sends"."status" in ('pending', 'sent', 'empty', 'failed')),
	CONSTRAINT "digest_sends_window_check" CHECK ("digest_sends"."window_start" <= "digest_sends"."window_end")
);
--> statement-breakpoint
CREATE TABLE "digest_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"disabled_via" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_subscriptions_disabled_via_check" CHECK ("digest_subscriptions"."disabled_via" is null or "digest_subscriptions"."disabled_via" in ('account', 'link'))
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_user_query_key" UNIQUE("user_id","query"),
	CONSTRAINT "saved_searches_name_check" CHECK (length("saved_searches"."name") between 1 and 60),
	CONSTRAINT "saved_searches_query_check" CHECK (length("saved_searches"."query") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_subscriptions" ADD CONSTRAINT "digest_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digest_sends_week_status_idx" ON "digest_sends" USING btree ("week","status");