import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the Service Role Key.
 * Use this in Server Actions, API Routes, and Cron Jobs.
 * NEVER import this in client components — it has full DB access.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
