import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Call this at the top of every Server Action to ensure the caller is
 * an authenticated admin.  Throws if the session is invalid so the
 * action short-circuits without doing anything.
 */
export async function requireAuth(): Promise<void> {
  const cookieStore = await cookies();
  const adminAuthCookie = cookieStore.get("admin_auth");
  const authSecret = process.env.AUTH_SECRET;

  if (!authSecret) {
    throw new Error("AUTH_SECRET is not configured.");
  }

  if (!adminAuthCookie?.value) {
    throw new Error("Unauthorized: no session cookie.");
  }

  // Timing-safe comparison to prevent timing attacks
  const cookieBuf = Buffer.from(adminAuthCookie.value, "utf8");
  const secretBuf = Buffer.from(authSecret, "utf8");

  // buffers must be the same length for timingSafeEqual
  if (
    cookieBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(cookieBuf, secretBuf)
  ) {
    throw new Error("Unauthorized: invalid session.");
  }
}
