// User settings service
import db, { UserSettings } from '../db.js';

const DEFAULT_PRE_PROMPT = 'Summarize the following content. What do we learn?';

// Get user settings (create if not exists)
export function getUserSettings(userCode: string): UserSettings {
  let settings = db.prepare('SELECT * FROM user_settings WHERE user_code = ?').get(userCode) as UserSettings | undefined;

  if (!settings) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_settings (user_code, default_pre_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(userCode, DEFAULT_PRE_PROMPT, now, now);

    settings = {
      user_code: userCode,
      default_pre_prompt: DEFAULT_PRE_PROMPT,
      created_at: now,
      updated_at: now
    };
  }

  return settings;
}

// Update user's default pre-prompt
export function updateDefaultPrePrompt(userCode: string, prePrompt: string): UserSettings {
  const now = new Date().toISOString();

  // Upsert
  db.prepare(`
    INSERT INTO user_settings (user_code, default_pre_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_code) DO UPDATE SET
      default_pre_prompt = excluded.default_pre_prompt,
      updated_at = excluded.updated_at
  `).run(userCode, prePrompt, now, now);

  return getUserSettings(userCode);
}

// Get the default pre-prompt constant
export function getDefaultPrePromptText(): string {
  return DEFAULT_PRE_PROMPT;
}
