CREATE TABLE "approvals" (
	"approval_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"required_role" text NOT NULL,
	"rule_ids" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoints_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "pii_vault" (
	"tenant_id" text NOT NULL,
	"token" text NOT NULL,
	"kind" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pii_vault_tenant_id_token_pk" PRIMARY KEY("tenant_id","token")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"graph_id" text NOT NULL,
	"graph_version" text NOT NULL,
	"status" text NOT NULL,
	"current_step" text,
	"state" jsonb NOT NULL,
	"usage" jsonb NOT NULL,
	"version" integer NOT NULL,
	"last_error" jsonb,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_queue_idx" ON "approvals" USING btree ("tenant_id","required_role","created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "audit_run_seq_uq" ON "audit_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "audit_tenant_type_idx" ON "audit_events" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_tenant_idempotency_uq" ON "runs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "runs_recoverable_idx" ON "runs" USING btree ("status","lease_expires_at");