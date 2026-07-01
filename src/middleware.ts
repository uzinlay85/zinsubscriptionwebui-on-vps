import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/api/sub", // subscription links must be public
  "/api/cron", // cron jobs use Bearer token auth
];

/** Timing-safe string comparison using Web Crypto (Edge Runtime safe). */
function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const enc = new TextEncoder();
    const aBuf = enc.encode(a);
    const bBuf = enc.encode(b);
    if (aBuf.length !== bBuf.length) return false;
    // XOR every byte; result is 0 only if all bytes match
    let diff = 0;
    for (let i = 0; i < aBuf.length; i++) {
      diff |= aBuf[i] ^ bBuf[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/** Attach security headers to every response. */
function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Always allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return withSecurityHeaders(NextResponse.next());
  }

  const secretPath = process.env.ADMIN_SECRET_PATH;
  const pathAuthCookie = request.cookies.get("path_auth");

  // 2. If the user hits the exact secret path
  if (secretPath && pathname === `/${secretPath}`) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    // Set cookie to remember they passed the secret gate
    response.cookies.set("path_auth", "valid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return withSecurityHeaders(response);
  }

  // 3. If they don't have the path_auth cookie, block access (return 404)
  if (secretPath && !timingSafeStringEqual(pathAuthCookie?.value ?? "", "valid")) {
    return withSecurityHeaders(
      new NextResponse("404 Not Found", { status: 404 })
    );
  }

  // --- User has passed the secret path gate ---

  // 4. Handle Username/Password Auth for protected admin routes
  const adminAuthCookie = request.cookies.get("admin_auth");
  const authSecret = process.env.AUTH_SECRET ?? "";

  // Allow access to login page and auth API
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (
    !adminAuthCookie ||
    !timingSafeStringEqual(adminAuthCookie.value, authSecret)
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png).*)",
  ],
};
