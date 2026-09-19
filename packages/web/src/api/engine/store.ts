import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export type Settings = typeof schema.settings.$inferSelect;

/** Настройки движка: одна строка с id = 1, создаётся при первом обращении. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  const existing = rows[0];
  if (existing) return existing;
  const [created] = await db.insert(schema.settings).values({ id: 1 }).returning();
  return created!;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  await getSettings();
  const [row] = await db
    .update(schema.settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .returning();
  return row!;
}

export async function addSubscriber(chatId: string, title?: string) {
  const existing = await db
    .select()
    .from(schema.subscribers)
    .where(eq(schema.subscribers.chatId, chatId));
  if (existing[0]) {
    if (!existing[0].isActive) {
      await db
        .update(schema.subscribers)
        .set({ isActive: true })
        .where(eq(schema.subscribers.chatId, chatId));
    }
    return existing[0];
  }
  const [row] = await db
    .insert(schema.subscribers)
    .values({ chatId, title: title ?? null })
    .returning();
  return row!;
}

export async function deactivateSubscriber(chatId: string) {
  await db
    .update(schema.subscribers)
    .set({ isActive: false })
    .where(eq(schema.subscribers.chatId, chatId));
}

export async function activeSubscribers() {
  return db
    .select()
    .from(schema.subscribers)
    .where(eq(schema.subscribers.isActive, true));
}
