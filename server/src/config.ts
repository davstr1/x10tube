import 'dotenv/config';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load root .env file (one level up from server/)
dotenvConfig({ path: path.resolve(process.cwd(), '..', '.env') });

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT) || 3000,
  baseUrl: isProd
    ? (process.env.PROD_URL || 'https://straighttoyour.ai')
    : (process.env.DEV_URL || 'http://localhost:3000'),
  brandName: process.env.BRAND_NAME || 'straighttoyour.ai',
  chromeExtensionUrl: process.env.CHROME_EXTENSION_URL || '#',
  // Analytics
  posthogApiKey: process.env.POSTHOG_API_KEY || '',
  // Supabase (no defaults - must be set in .env)
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
};
