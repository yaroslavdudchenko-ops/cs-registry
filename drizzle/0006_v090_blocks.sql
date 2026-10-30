-- CS Registry 0.9.0: 8 блоков карточки, домены, SYS-<ДОМЕН>-NNNN,
-- таблицы людей/компаний/документов/интеграций, GxP-критичность и GAMP.
-- Миграция только дополняет схему. Старые события аудита продолжают читаться.

CREATE TYPE "public"."system_domain_enum" AS ENUM('QC', 'QA', 'PROD', 'RnD', 'LOG', 'ADM', 'IT');--> statement-breakpoint
CREATE TYPE "public"."gamp_category_enum" AS ENUM('1', '3', '4', '5');--> statement-breakpoint
CREATE TYPE "public"."person_role_enum" AS ENUM(
  'process_owner',
  'system_owner',
  'release_manager',
  'key_user',
  'support',
  'project_manager',
  'analyst',
  'developer',
  'tester'
);--> statement-breakpoint
CREATE TYPE "public"."company_code_enum" AS ENUM('BE', 'BI', 'PRO', 'PROR', 'PROD_CO', 'AR');--> statement-breakpoint
CREATE TYPE "public"."server_type_enum" AS ENUM('physical', 'virtual', 'cloud', 'container', 'other');--> statement-breakpoint
CREATE TYPE "public"."backup_frequency_enum" AS ENUM('hourly', 'daily', 'weekly', 'monthly', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_kind_enum" AS ENUM('internal', 'vendor');--> statement-breakpoint

-- Новые поля систем. Старые SYS-NNNN получают домен по типу, новые — SYS-<ДОМЕН>-NNNN.
ALTER TABLE "systems" ADD COLUMN "domain" "system_domain_enum";--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "release" text;--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "release_manager_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "release_manager_name" text;--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "system_owner_name_text" text;--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "gxp_criticality" "criticality_enum";--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "gamp_category" "gamp_category_enum";--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "server" text;--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "server_type" "server_type_enum";--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "backup_frequency" "backup_frequency_enum";--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "integrations" text[] NOT NULL DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "devops" text;--> statement-breakpoint

-- Миграция данных: домен по типу системы (владелец согласовал категоризацию).
UPDATE "systems" SET "domain" = CASE
  WHEN system_type IN ('LIMS', 'LES', 'ELN', 'LMS') THEN 'QC'
  WHEN system_type IN ('QMS') THEN 'QA'
  WHEN system_type IN ('MES', 'EBR', 'SCADA', 'EMS', 'BMS', 'CMMS', 'APS') THEN 'PROD'
  WHEN system_type IN ('EDC', 'CTMS', 'RIM') THEN 'RnD'
  WHEN system_type IN ('WMS', 'TMS', 'SRM') THEN 'LOG'
  WHEN system_type IN ('ERP', 'CRM', 'HRIS', 'EHS', 'PLM', 'ACC', 'EPM', 'LEGAL', 'CONTRACT', 'PAYROLL') THEN 'ADM'
  WHEN system_type IN ('DMS', 'ITSM', 'IAM', 'SIEM', 'MDM', 'BI') THEN 'IT'
  ELSE 'IT'
END::system_domain_enum
WHERE "domain" IS NULL;--> statement-breakpoint
ALTER TABLE "systems" ALTER COLUMN "domain" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "systems_domain_idx" ON "systems" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "systems_gamp_category_idx" ON "systems" USING btree ("gamp_category");--> statement-breakpoint
CREATE INDEX "systems_gxp_criticality_idx" ON "systems" USING btree ("gxp_criticality");--> statement-breakpoint

-- Процессный владелец и системный владелец теперь могут быть nullable
-- (авторитетный источник — таблица system_people). Старые FK оставлены
-- как денормализованная "основная" ссылка для совместимости с чтением.
ALTER TABLE "systems" ALTER COLUMN "process_owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "systems" ALTER COLUMN "system_owner_id" DROP NOT NULL;--> statement-breakpoint

CREATE TABLE "system_people" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "system_id" uuid NOT NULL REFERENCES "systems"("id") ON DELETE CASCADE,
  "role" "person_role_enum" NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "full_name" text,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "system_people_one_of" CHECK (
    ("user_id" IS NOT NULL AND "full_name" IS NULL)
    OR ("user_id" IS NULL AND "full_name" IS NOT NULL AND length(trim("full_name")) > 0)
  )
);--> statement-breakpoint
CREATE INDEX "system_people_system_role_idx" ON "system_people" USING btree ("system_id", "role", "position");--> statement-breakpoint

CREATE TABLE "system_companies" (
  "system_id" uuid NOT NULL REFERENCES "systems"("id") ON DELETE CASCADE,
  "company" "company_code_enum" NOT NULL,
  PRIMARY KEY ("system_id", "company")
);--> statement-breakpoint
CREATE INDEX "system_companies_company_idx" ON "system_companies" USING btree ("company");--> statement-breakpoint

CREATE TABLE "system_documents" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "system_id" uuid NOT NULL REFERENCES "systems"("id") ON DELETE CASCADE,
  "kind" "document_kind_enum" NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "system_documents_title_nonempty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "system_documents_url_nonempty" CHECK (length(trim("url")) > 0),
  -- http/https или UNC-путь вида \\server\share (regex: две обратные косые в начале).
  CONSTRAINT "system_documents_url_scheme" CHECK (
    "url" ~* '^https?://'
    OR "url" ~ '^\\\\'
  )
);--> statement-breakpoint
CREATE INDEX "system_documents_system_idx" ON "system_documents" USING btree ("system_id", "kind", "position");--> statement-breakpoint

-- Миграция данных: существующих владельцев процессов и систем —
-- в system_people, чтобы новая форма видела их как первую позицию списка.
INSERT INTO "system_people" ("system_id", "role", "user_id", "position")
SELECT s.id, 'process_owner'::person_role_enum, s.process_owner_id, 0
FROM "systems" s
WHERE s.process_owner_id IS NOT NULL;--> statement-breakpoint

INSERT INTO "system_people" ("system_id", "role", "user_id", "position")
SELECT s.id, 'system_owner'::person_role_enum, s.system_owner_id, 0
FROM "systems" s
WHERE s.system_owner_id IS NOT NULL;--> statement-breakpoint

-- Миграция данных: демо-компании не задаются (справочник новый, записи выбирает владелец).

-- Права прикладной роли на новые таблицы.
GRANT SELECT, INSERT, UPDATE, DELETE ON "system_people" TO cs_registry_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "system_companies" TO cs_registry_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "system_documents" TO cs_registry_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE system_people_id_seq TO cs_registry_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE system_documents_id_seq TO cs_registry_app;
