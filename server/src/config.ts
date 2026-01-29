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
};
