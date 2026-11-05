CREATE TABLE "access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"school" text,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	CONSTRAINT "access_requests_kind_check" CHECK ("access_requests"."kind" in ('school', 'access'))
);
