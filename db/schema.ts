import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const footballRooms=sqliteTable('football_rooms',{
  code:text('code').primaryKey(),
  revision:integer('revision').notNull().default(0),
  state:text('state').notNull(),
  expiresAt:integer('expires_at').notNull(),
},table=>[index('football_rooms_expiry').on(table.expiresAt)]);
