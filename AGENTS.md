<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Coding Rules & Guidelines

## 1. Supabase Database Integration
- Always use the clients from [supabase-server.ts](file:///c:/Users/zin/Downloads/Ai_WebCodes/zinsubscriptionwebui/src/lib/supabase-server.ts) for Server Components/API routes and [supabase.ts](file:///c:/Users/zin/Downloads/Ai_WebCodes/zinsubscriptionwebui/src/lib/supabase.ts) for Client Components.
- Implement strict access control checks on the server-side to ensure users only modify data they own.
- Catch database exceptions and return user-friendly error codes.

## 2. Tailwind CSS v4 Styling
- Use only standard Tailwind CSS v4 utility classes.
- Ensure dark mode and light mode tailwind variants are fully integrated (e.g. `dark:bg-slate-900 bg-white`).
- Maintain visual harmony with modern, glassmorphic, and dynamic design aesthetics.

## 3. Resiliency & Error Handling
- Never allow external API failures (such as Outline, Hysteria2, or 3x-ui timeouts) to crash backend server loops or main API endpoints.
- Enforce strict 5-second connection timeouts on all external requests.
- Log error details securely using server logs without exposing sensitive parameters or tokens.

