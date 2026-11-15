CREATE TABLE "admin_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" uuid,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resend_id" text,
	"error" text,
	"idempotency_key" text NOT NULL,
	"access_request_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_messages_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "admin_messages_status_check" CHECK ("admin_messages"."status" in ('pending', 'sent', 'failed')),
	CONSTRAINT "admin_messages_recipient_lowercase_check" CHECK ("admin_messages"."recipient" = lower("admin_messages"."recipient"))
);
--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_messages_request_idx" ON "admin_messages" USING btree ("access_request_id");--> statement-breakpoint
CREATE INDEX "admin_messages_created_idx" ON "admin_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_messages_recipient_idx" ON "admin_messages" USING btree (lower("recipient"));