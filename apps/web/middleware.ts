import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protected routes that require authentication
 */
const protectedRoutes = ["/dashboard", "/checkout", "/teacher"];

/**
 * Auth routes that should redirect if already authenticated
 */
const authRoutes = ["/login", "/register", "/forgot-password"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Get auth token from cookie (set by Firebase client SDK)
    const authToken = request.cookies.get("__session")?.value;

    // Check if accessing protected route without auth
    const isProtectedRoute = protectedRoutes.some((route) =>
        pathname.startsWith(route)
    );

    if (isProtectedRoute && !authToken) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Check if accessing auth routes while authenticated
    const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

    if (isAuthRoute && authToken) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (images, etc)
         */
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)",
    ],
};
