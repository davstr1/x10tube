// User settings service (migrated to Supabase)
import { supabase } from '../supabase.js';

export interface UserSettings {
  user_code: string;
  default_pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_PRE_PROMPT = 'Summarize the content. What do we learn?';

// Get the default pre-prompt constant
export function getDefaultPrePromptText(): string {
  return DEFAULT_PRE_PROMPT;
}

// Get user settings (create if not exists)
export async function getUserSettings(userCode: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_code', userCode)
    .single();

  if (data) return data;

  // Create if not exists
  const now = new Date().toISOString();
  const newSettings: UserSettings = {
    user_code: userCode,
    default_pre_prompt: DEFAULT_PRE_PROMPT,
    created_at: now,
    updated_at: now
  };

  const { error: insertError } = await supabase
    .from('user_settings')
    .insert(newSettings);

  if (insertError) {
    console.error('[Settings] Error creating user settings:', insertError);
  }

  return newSettings;
}

// Update user's default pre-prompt
export async function updateDefaultPrePrompt(userCode: string, prePrompt: string): Promise<UserSettings> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_code: userCode,
      default_pre_prompt: prePrompt,
      updated_at: now
    });

  if (error) {
    console.error('[Settings] Error updating pre-prompt:', error);
  }

  return getUserSettings(userCode);
}
