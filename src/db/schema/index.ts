import {sqliteTable, text, int} from 'drizzle-orm/sqlite-core';

/**
 * Users table — a minimal demo table storing a name and email per user.
 *
 * - `id`: auto-incrementing integer primary key.
 * - `name`: the user's display name.
 * - `email`: the user's email address, unique across the table.
 */
export const usersTable = sqliteTable('users_table', {
  id: int().primaryKey({autoIncrement: true}),
  name: text().notNull(),
  email: text().notNull().unique(),
});
