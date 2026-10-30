import type { DbSql } from "@/server/db/audit-repository";
import type { UserRole } from "@/server/db/enums";

export type UserRow = {
  id: string;
  username: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  mfa_secret: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
};

export async function selectUserByUsername(sql: DbSql, username: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, full_name, email, password_hash, role, is_active, mfa_secret,
           last_login_at, created_at, updated_at, version
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function selectUserById(sql: DbSql, id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, full_name, email, password_hash, role, is_active, mfa_secret,
           last_login_at, created_at, updated_at, version
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function selectActiveUsersByIds(sql: DbSql, ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await sql<UserRow[]>`
    SELECT id, username, full_name, email, password_hash, role, is_active, mfa_secret,
           last_login_at, created_at, updated_at, version
    FROM users
    WHERE id IN ${sql(ids)}
      AND is_active = true
  `;
  return rows;
}

export async function insertUser(
  sql: DbSql,
  input: {
    username: string;
    fullName: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  },
): Promise<UserRow> {
  const rows = await sql<UserRow[]>`
    INSERT INTO users (
      username, full_name, email, password_hash, role, is_active
    ) VALUES (
      ${input.username}, ${input.fullName}, ${input.email}, ${input.passwordHash},
      ${input.role}::user_role_enum, true
    )
    RETURNING id, username, full_name, email, password_hash, role, is_active, mfa_secret,
              last_login_at, created_at, updated_at, version
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("failed to insert user");
  }
  return row;
}

export async function updateUserLastLogin(sql: DbSql, userId: string): Promise<void> {
  await sql`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = ${userId}`;
}

export async function countActiveAdmins(sql: DbSql): Promise<number> {
  const rows = await sql<[{ count: string }]>`
    SELECT count(*)::text AS count
    FROM users
    WHERE role = 'admin' AND is_active = true
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function listUsers(sql: DbSql): Promise<UserRow[]> {
  return sql<UserRow[]>`
    SELECT id, username, full_name, email, password_hash, role, is_active, mfa_secret,
           last_login_at, created_at, updated_at, version
    FROM users
    ORDER BY username ASC
  `;
}

export async function updateUser(
  sql: DbSql,
  userId: string,
  expectedVersion: number,
  patch: {
    fullName?: string;
    email?: string;
    passwordHash?: string;
    role?: UserRole;
    isActive?: boolean;
  },
): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    UPDATE users SET
      full_name = COALESCE(${patch.fullName ?? null}, full_name),
      email = COALESCE(${patch.email ?? null}, email),
      password_hash = COALESCE(${patch.passwordHash ?? null}, password_hash),
      role = COALESCE(${patch.role ?? null}::user_role_enum, role),
      is_active = COALESCE(${patch.isActive ?? null}, is_active),
      updated_at = now(),
      version = version + 1
    WHERE id = ${userId} AND version = ${expectedVersion}
    RETURNING id, username, full_name, email, password_hash, role, is_active, mfa_secret,
              last_login_at, created_at, updated_at, version
  `;
  return rows[0] ?? null;
}

export function publicUser(row: UserRow): {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
} {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
    last_login_at: row.last_login_at === null ? null : row.last_login_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    version: row.version,
  };
}
