-- GAMP 5 Second Edition §6.1.2: владелец процесса и владелец системы — разные роли.
-- owner_id → process_owner_id; system_owner_id обязателен; technical_owner_id снимается.
-- Индекс systems_owner_id_idx — btree (не unique); имя переименовывается вместе с колонкой.

ALTER TABLE "systems" RENAME COLUMN "owner_id" TO "process_owner_id";
--> statement-breakpoint
ALTER INDEX "systems_owner_id_idx" RENAME TO "systems_process_owner_id_idx";
--> statement-breakpoint
ALTER TABLE "systems" RENAME CONSTRAINT "systems_owner_id_users_id_fk" TO "systems_process_owner_id_users_id_fk";
--> statement-breakpoint
-- system_owner_id добавляется nullable. NOT NULL — сразу, если таблица пуста.
-- При наличии строк потребуется backfill, затем ALTER COLUMN SET NOT NULL;
-- backfill этой миграцией не выполняется — осознанное решение для стадии до первого наполнения.
DO $$
BEGIN
  ALTER TABLE "systems" ADD COLUMN "system_owner_id" uuid;
  IF EXISTS (SELECT 1 FROM "systems") THEN
    RAISE EXCEPTION 'systems содержит строки: заполните system_owner_id и затем ALTER COLUMN SET NOT NULL. Backfill этой миграцией не выполняется — осознанное решение для стадии до первого наполнения.';
  END IF;
  ALTER TABLE "systems" ALTER COLUMN "system_owner_id" SET NOT NULL;
END
$$;
--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_system_owner_id_users_id_fk" FOREIGN KEY ("system_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "systems" DROP COLUMN "technical_owner_id";
