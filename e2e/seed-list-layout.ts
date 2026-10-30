import { loadEnvFile } from "node:process";

import postgres from "postgres";

import { applyTestDatabaseEnv } from "../src/server/test/database-isolation";

import { E2E_USERNAME } from "./credentials";

try {
  loadEnvFile(".env");
} catch {
  // переменные могут прийти из окружения
}

const LONG_NAME = "Юридический документооборот и претензионная работа";
const LONG_SITE = "Площадка Москва, корпус А";

type SeedRow = {
  code: string;
  name: string;
  systemType: string;
  site: string;
  criticality: string;
  lifecycle: string;
  validation: string;
};

const ROWS: SeedRow[] = [
  {
    code: "SYS-0101",
    name: LONG_NAME,
    systemType: "LEGAL",
    site: "Площадка Качество",
    criticality: "high",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0102",
    name: "Управление договорами поставки",
    systemType: "CONTRACT",
    site: LONG_SITE,
    criticality: "medium",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0103",
    name: "Лабораторный журнал",
    systemType: "LIMS",
    site: "Площадка Качество",
    criticality: "high",
    lifecycle: "active",
    validation: "in_validation",
  },
  {
    code: "SYS-0104",
    name: "Склад сырья",
    systemType: "WMS",
    site: "Склад-1",
    criticality: "medium",
    lifecycle: "active",
    validation: "not_validated",
  },
  {
    code: "SYS-0105",
    name: "Планирование ресурсов",
    systemType: "ERP",
    site: "Офис",
    criticality: "high",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0106",
    name: "Диспетчеризация линии А",
    systemType: "SCADA",
    site: "Цех 3",
    criticality: "high",
    lifecycle: "maintenance",
    validation: "validated",
  },
  {
    code: "SYS-0107",
    name: "Клинические данные",
    systemType: "EDC",
    site: "Клиника",
    criticality: "high",
    lifecycle: "active",
    validation: "in_validation",
  },
  {
    code: "SYS-0108",
    name: "Кадры и отпуска",
    systemType: "HRIS",
    site: "Офис",
    criticality: "low",
    lifecycle: "active",
    validation: "not_required",
  },
  {
    code: "SYS-0109",
    name: "Инциденты ИБ",
    systemType: "SIEM",
    site: "ЦОД",
    criticality: "high",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0110",
    name: "Учёт оборудования",
    systemType: "CMMS",
    site: "Цех 1",
    criticality: "medium",
    lifecycle: "planned",
    validation: "not_validated",
  },
  {
    code: "SYS-0111",
    name: "Обучение персонала",
    systemType: "LMS",
    site: "Офис",
    criticality: "low",
    lifecycle: "active",
    validation: "not_required",
  },
  {
    code: "SYS-0112",
    name: "Мастер-данные номенклатуры",
    systemType: "MDM",
    site: "ЦОД",
    criticality: "medium",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0113",
    name: "Транспорт готовой продукции",
    systemType: "TMS",
    site: "Логистика",
    criticality: "medium",
    lifecycle: "active",
    validation: "not_validated",
  },
  {
    code: "SYS-0114",
    name: "Бухгалтерский учёт",
    systemType: "ACC",
    site: "Офис",
    criticality: "high",
    lifecycle: "active",
    validation: "not_required",
  },
  {
    code: "SYS-0115",
    name: "Управление ИТ-услугами",
    systemType: "ITSM",
    site: "ЦОД",
    criticality: "medium",
    lifecycle: "active",
    validation: "validated",
  },
  {
    code: "SYS-0116",
    name: "Прочая учётная система",
    systemType: "other",
    site: "Филиал",
    criticality: "low",
    lifecycle: "retired",
    validation: "not_required",
  },
];

export async function seedListLayoutSystems(): Promise<number> {
  applyTestDatabaseEnv(process.env);
  const url = process.env["TEST_DATABASE_URL"];
  if (url === undefined || url.length === 0) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  const sql = postgres(url, { max: 1 });
  try {
    const owners = await sql<[{ id: string }]>`
      SELECT id FROM users WHERE username = ${E2E_USERNAME} LIMIT 1
    `;
    const owner = owners[0];
    if (owner === undefined) {
      throw new Error("e2e admin user is missing");
    }
    await sql`DELETE FROM systems`;
    for (const row of ROWS) {
      await sql`
        INSERT INTO systems (
          code, name, domain, system_type, hosting_type, data_classification, is_gxp_relevant,
          criticality, lifecycle_status, validation_status,
          process_owner_id, system_owner_id, site
        ) VALUES (
          ${row.code},
          ${row.name},
          ${"IT"}::system_domain_enum,
          ${row.systemType}::system_type_enum,
          ${"on_prem"}::hosting_type_enum,
          ${"internal"}::data_class_enum,
          true,
          ${row.criticality}::criticality_enum,
          ${row.lifecycle}::lifecycle_enum,
          ${row.validation}::validation_enum,
          ${owner.id},
          ${owner.id},
          ${row.site}
        )
      `;
    }
    return ROWS.length;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
