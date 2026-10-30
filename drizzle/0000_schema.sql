CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE TYPE "public"."criticality_enum" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."data_class_enum" AS ENUM('public', 'internal', 'confidential', 'personal');--> statement-breakpoint
CREATE TYPE "public"."hosting_type_enum" AS ENUM('on_prem', 'cloud', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_enum" AS ENUM('planned', 'active', 'maintenance', 'retired');--> statement-breakpoint
CREATE TYPE "public"."system_type_enum" AS ENUM('LIMS', 'ERP', 'MES', 'QMS', 'SCADA', 'DMS', 'EDC', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'editor', 'viewer', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."validation_enum" AS ENUM('not_validated', 'in_validation', 'validated', 'not_required');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_username" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"entity_label" text,
	"changed_fields" text[],
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"request_id" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"product_version" text,
	"description" text,
	"system_type" "system_type_enum" NOT NULL,
	"business_process" text,
	"owner_id" uuid NOT NULL,
	"technical_owner_id" uuid,
	"quality_owner_id" uuid,
	"site" text,
	"hosting_type" "hosting_type_enum" NOT NULL,
	"hosting_provider" text,
	"data_classification" "data_class_enum" NOT NULL,
	"is_gxp_relevant" boolean NOT NULL,
	"criticality" "criticality_enum" NOT NULL,
	"lifecycle_status" "lifecycle_enum" NOT NULL,
	"validation_status" "validation_enum" NOT NULL,
	"validated_at" date,
	"next_review_at" date,
	"auth_model" text,
	"backup_rpo_hours" integer,
	"backup_rto_hours" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role_enum" NOT NULL,
	"is_active" boolean NOT NULL,
	"mfa_secret" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_technical_owner_id_users_id_fk" FOREIGN KEY ("technical_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_quality_owner_id_users_id_fk" FOREIGN KEY ("quality_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "systems_code_uidx" ON "systems" USING btree ("code");--> statement-breakpoint
CREATE INDEX "systems_system_type_idx" ON "systems" USING btree ("system_type");--> statement-breakpoint
CREATE INDEX "systems_criticality_idx" ON "systems" USING btree ("criticality");--> statement-breakpoint
CREATE INDEX "systems_lifecycle_status_idx" ON "systems" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE INDEX "systems_owner_id_idx" ON "systems" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "systems_next_review_at_idx" ON "systems" USING btree ("next_review_at");--> statement-breakpoint
CREATE INDEX "systems_name_trgm_idx" ON "systems" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "systems_vendor_trgm_idx" ON "systems" USING gin ("vendor" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "systems_code_trgm_idx" ON "systems" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uidx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");