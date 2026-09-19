import { createClerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

type ClerkProfile = {
  email: string | null;
  displayName: string | null;
};

function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

async function loadClerkProfile(clerkId: string): Promise<ClerkProfile> {
  const client = clerkClient();
  if (!client) return { email: null, displayName: null };

  try {
    const clerkUser = await client.users.getUser(clerkId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
    const displayName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      null;
    return { email: primaryEmail, displayName };
  } catch {
    return { email: null, displayName: null };
  }
}

async function findByClerkId(clerkId: string): Promise<User | undefined> {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.clerkId, clerkId),
  });
}

/**
 * Maps the authenticated Clerk user onto a local `career_users` row so
 * resume and analysis records stay scoped to that account.
 */
export async function getOrCreateUser(clerkId: string): Promise<User> {
  const profile = await loadClerkProfile(clerkId);
  const existing = await findByClerkId(clerkId);

  if (existing) {
    const email = profile.email ?? existing.email;
    const displayName = profile.displayName ?? existing.displayName;
    if (email === existing.email && displayName === existing.displayName) {
      return existing;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ email, displayName })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return updated;
  }

  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        clerkId,
        email: profile.email,
        displayName: profile.displayName,
      })
      .returning();
    return created;
  } catch {
    const raced = await findByClerkId(clerkId);
    if (raced) return raced;
    throw new Error("Unable to persist authenticated user");
  }
}
