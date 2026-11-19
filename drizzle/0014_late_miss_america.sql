CREATE TABLE "email_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"user_id" uuid,
	"address" text,
	"greeted_as" text,
	"posted" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"test" boolean DEFAULT false NOT NULL,
	"overridden" boolean DEFAULT false NOT NULL,
	"provider_id" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_status_check" CHECK ("email_deliveries"."status" in ('queued', 'sending', 'sent', 'failed', 'left_out'))
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"audience" jsonb NOT NULL,
	"to_label" text,
	"access_request_id" integer,
	"resolve" text,
	"sender" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "emails_status_check" CHECK ("emails"."status" in ('draft', 'sending', 'sent')),
	CONSTRAINT "emails_resolve_check" CHECK ("emails"."resolve" is null or "emails"."resolve" in ('approve', 'decline')),
	CONSTRAINT "emails_sender_check" CHECK ("emails"."sender" is null or "emails"."sender" in ('personal', 'group'))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "no_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "no_email_source" text;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_once" ON "email_deliveries" USING btree ("email_id","address") WHERE "email_deliveries"."test" = false;--> statement-breakpoint
CREATE INDEX "email_deliveries_email_idx" ON "email_deliveries" USING btree ("email_id","status");--> statement-breakpoint
CREATE INDEX "email_deliveries_user_idx" ON "email_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emails_created_idx" ON "emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "emails_request_idx" ON "emails" USING btree ("access_request_id");--> statement-breakpoint
-- Hand-written from here. Every one-off email in admin_messages becomes an email with one recipient row, under the same id, before the old table goes.
INSERT INTO "emails" ("id", "status", "subject", "body", "audience", "to_label", "access_request_id", "sender", "created_by", "created_at", "updated_at", "sent_at", "finished_at")
SELECT m."id", 'sent', m."subject", m."body", jsonb_build_object('kind', 'address', 'email', lower(m."recipient")), lower(m."recipient"), m."access_request_id", 'personal', m."sender_id", m."created_at", m."attempted_at", m."created_at", m."attempted_at"
FROM "admin_messages" m ORDER BY m."id";--> statement-breakpoint
-- A row still pending was never known to have gone: it is carried over as a failure, which is what the daily sweep would have made it.
INSERT INTO "email_deliveries" ("email_id", "user_id", "address", "status", "reason", "provider_id", "attempts", "last_attempt_at", "sent_at", "created_at")
SELECT m."id", (SELECT u."id" FROM "user" u WHERE u."email" = lower(m."recipient")), lower(m."recipient"),
  CASE m."status" WHEN 'sent' THEN 'sent' ELSE 'failed' END,
  CASE m."status" WHEN 'sent' THEN NULL WHEN 'failed' THEN m."error" ELSE 'Interrupted before it was known to have gone.' END,
  m."resend_id", 1, m."attempted_at", CASE m."status" WHEN 'sent' THEN m."attempted_at" END, m."created_at"
FROM "admin_messages" m ORDER BY m."id";--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('emails', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "emails"), 1), (SELECT COUNT(*) > 0 FROM "emails"));--> statement-breakpoint
-- Stop email was only ever set by the admin until now; when is not known.
UPDATE "user" SET "no_email_source" = 'admin' WHERE "no_email";--> statement-breakpoint
DROP TABLE "admin_messages" CASCADE;
