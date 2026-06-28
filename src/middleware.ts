import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/api/sub", // subscription links must be public
  "/api/cron", // cron jobs use Bearer token auth
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Always allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
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
    return response;
  }

  // 3. If they don't have the path_auth cookie, block access (return 404)
  if (secretPath && pathAuthCookie?.value !== "valid") {
    return new NextResponse("404 Not Found", { status: 404 });
  }

  // --- User has passed the secret path gate ---

  // 4. Handle Username/Password Auth for protected admin routes
  const adminAuthCookie = request.cookies.get("admin_auth");

  // Allow access to login page
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (!adminAuthCookie || adminAuthCookie.value !== process.env.AUTH_SECRET) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
