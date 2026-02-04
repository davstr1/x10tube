import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

if (!config.supabaseUrl || !config.supabaseSecretKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
}

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  { auth: { persistSession: false } }
);

/**
 * Verify Supabase connection is working
 * Call this at startup to fail fast if DB is unreachable
 */
export async function checkSupabaseConnection(): Promise<void> {
  const { error } = await supabase.from('collections').select('id').limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
}
