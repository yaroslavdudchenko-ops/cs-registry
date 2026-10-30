import postgres from "postgres";

export type ApplicationTable = "sessions" | "systems" | "users" | "audit_events";

export async function truncateApplicationTables(adminUrl: string): Promise<void> {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await sql`TRUNCATE TABLE sessions, system_documents, system_companies, system_people, systems, users, audit_events RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function countApplicationRows(
  adminUrl: string,
): Promise<Record<ApplicationTable, number>> {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    const [sessions] = await sql<[{ n: string }]>`SELECT count(*)::text AS n FROM sessions`;
    const [systems] = await sql<[{ n: string }]>`SELECT count(*)::text AS n FROM systems`;
    const [users] = await sql<[{ n: string }]>`SELECT count(*)::text AS n FROM users`;
    const [audit] = await sql<[{ n: string }]>`SELECT count(*)::text AS n FROM audit_events`;
    return {
      sessions: Number(sessions?.n ?? 0),
      systems: Number(systems?.n ?? 0),
      users: Number(users?.n ?? 0),
      audit_events: Number(audit?.n ?? 0),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
