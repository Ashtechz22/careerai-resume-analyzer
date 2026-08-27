import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export async function getOrCreateUser(clerkId: string) {
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkId, clerkId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(usersTable)
    .values({ clerkId })
    .returning();
  return created;
}