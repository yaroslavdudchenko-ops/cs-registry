import type { DbSql } from "@/server/db/audit-repository";

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  ip: string | null;
  user_agent: string | null;
};

export async function insertSession(
  sql: DbSql,
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<SessionRow> {
  const rows = await sql<SessionRow[]>`
    INSERT INTO sessions (
      user_id, token_hash, expires_at, ip, user_agent
    ) VALUES (
      ${input.userId},
      ${input.tokenHash},
      ${input.expiresAt.toISOString()}::timestamptz,
      ${input.ip},
      ${input.userAgent}
    )
    RETURNING
      id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at,
      host(ip)::text AS ip, user_agent
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("failed to insert session");
  }
  return row;
}

export async function selectSessionByTokenHash(
  sql: DbSql,
  tokenHash: string,
): Promise<SessionRow | null> {
  const rows = await sql<SessionRow[]>`
    SELECT
      id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at,
      host(ip)::text AS ip, user_agent
    FROM sessions
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function touchSession(sql: DbSql, sessionId: string): Promise<void> {
  await sql`
    UPDATE sessions SET last_seen_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL
  `;
}

export async function revokeSession(sql: DbSql, sessionId: string): Promise<void> {
  await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE id = ${sessionId} AND revoked_at IS NULL
  `;
}

export async function revokeSessionsForUser(sql: DbSql, userId: string): Promise<number> {
  const rows = await sql<[{ count: string }]>`
    WITH updated AS (
      UPDATE sessions SET revoked_at = now()
      WHERE user_id = ${userId} AND revoked_at IS NULL
      RETURNING id
    )
    SELECT count(*)::text AS count FROM updated
  `;
  return Number(rows[0]?.count ?? 0);
}
