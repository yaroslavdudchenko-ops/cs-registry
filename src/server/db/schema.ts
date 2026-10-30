import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  SYSTEM_TYPES,
  USER_ROLES,
  VALIDATION_STATUSES,
} from "./enums";

export const userRoleEnum = pgEnum("user_role_enum", USER_ROLES);
export const systemTypeEnum = pgEnum("system_type_enum", SYSTEM_TYPES);
export const hostingTypeEnum = pgEnum("hosting_type_enum", HOSTING_TYPES);
export const dataClassificationEnum = pgEnum("data_class_enum", DATA_CLASSIFICATIONS);
export const criticalityEnum = pgEnum("criticality_enum", CRITICALITIES);
export const lifecycleEnum = pgEnum("lifecycle_enum", LIFECYCLE_STATUSES);
export const validationEnum = pgEnum("validation_enum", VALIDATION_STATUSES);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull(),
    mfaSecret: text("mfa_secret"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("users_username_uidx").on(table.username),
    uniqueIndex("users_email_uidx").on(table.email),
  ],
);

export const systems = pgTable(
  "systems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    vendor: text("vendor"),
    productVersion: text("product_version"),
    description: text("description"),
    systemType: systemTypeEnum("system_type").notNull(),
    businessProcess: text("business_process"),
    processOwnerId: uuid("process_owner_id")
      .notNull()
      .references(() => users.id),
    systemOwnerId: uuid("system_owner_id")
      .notNull()
      .references(() => users.id),
    qualityOwnerId: uuid("quality_owner_id").references(() => users.id),
    site: text("site"),
    hostingType: hostingTypeEnum("hosting_type").notNull(),
    hostingProvider: text("hosting_provider"),
    dataClassification: dataClassificationEnum("data_classification").notNull(),
    isGxpRelevant: boolean("is_gxp_relevant").notNull(),
    criticality: criticalityEnum("criticality").notNull(),
    lifecycleStatus: lifecycleEnum("lifecycle_status").notNull(),
    validationStatus: validationEnum("validation_status").notNull(),
    validatedAt: date("validated_at", { mode: "string" }),
    nextReviewAt: date("next_review_at", { mode: "string" }),
    authModel: text("auth_model"),
    backupRpoHours: integer("backup_rpo_hours"),
    backupRtoHours: integer("backup_rto_hours"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("systems_code_uidx").on(table.code),
    index("systems_system_type_idx").on(table.systemType),
    index("systems_criticality_idx").on(table.criticality),
    index("systems_lifecycle_status_idx").on(table.lifecycleStatus),
    index("systems_process_owner_id_idx").on(table.processOwnerId),
    index("systems_next_review_at_idx").on(table.nextReviewAt),
    index("systems_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
    index("systems_vendor_trgm_idx").using("gin", sql`${table.vendor} gin_trgm_ops`),
    index("systems_code_trgm_idx").using("gin", sql`${table.code} gin_trgm_ops`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    actorId: uuid("actor_id"),
    actorUsername: text("actor_username").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    changedFields: text("changed_fields").array(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    requestId: text("request_id").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (table) => [
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_actor_id_idx").on(table.actorId),
    index("audit_events_entity_idx").on(table.entityType, table.entityId, table.id),
    index("audit_events_action_idx").on(table.action),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);
