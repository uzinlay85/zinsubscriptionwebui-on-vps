import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter
// Limits each IP to MAX_ATTEMPTS login attempts within WINDOW_MS.
// NOTE: This resets on server restart.  For production, use an external store
// like Upstash Redis.  This is still significantly better than no limiting.
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const attemptMap = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // Start fresh window
    attemptMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clearAttempts(ip: string) {
  attemptMap.delete(ip);
}

/** Timing-safe string comparison. */
function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Determine caller IP (works behind Vercel / standard proxies)
  // Use the LAST entry in x-forwarded-for — this is appended by our trusted
  // reverse proxy/CDN and cannot be spoofed by the client.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    (forwardedFor ? forwardedFor.split(",").at(-1)?.trim() : null) ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { username, password } = body;

  const validUsername = process.env.ADMIN_USERNAME ?? "";
  const validPassword = process.env.ADMIN_PASSWORD ?? "";
  const authSecret = process.env.AUTH_SECRET ?? "";

  if (!validUsername || !validPassword || !authSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 }
    );
  }

  const usernameOk = safeEqual(username ?? "", validUsername);
  const passwordOk = safeEqual(password ?? "", validPassword);

  if (!usernameOk || !passwordOk) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Successful login — clear rate limit counter for this IP
  clearAttempts(ip);

  const response = NextResponse.json({ success: true });

  // Set secure HTTP-only cookie
  response.cookies.set("admin_auth", authSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
