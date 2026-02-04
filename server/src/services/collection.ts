// Collection CRUD operations - Simple One-to-Many
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { supabase } from '../supabase.js';

// ============================================
// Types
// ============================================

export interface Collection {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  title: string | null;
  pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  collection_id: string;
  source_id: string;
  source_type: 'youtube' | 'webpage';
  url: string;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}

export interface CollectionWithItems extends Collection {
  items: Item[];
  tokenCount: number;
}

export interface PreExtractedItem {
  url: string;
  title: string;
  type: 'youtube' | 'webpage';
  content: string;
  youtube_id?: string;
  channel?: string;
  duration?: number;
}

// ============================================
// Helpers
// ============================================

function generateId(): string {
  return nanoid(8);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function calculateTokenCount(items: Item[]): number {
  return items.reduce((sum, item) => {
    return sum + estimateTokens(item.transcript || '');
  }, 0);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// ============================================
// Read operations
// ============================================

export async function getCollectionById(id: string): Promise<CollectionWithItems | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('id', id)
    .order('added_at', { referencedTable: 'items', ascending: false })
    .single();

  if (error || !data) return null;

  return {
    ...data,
    items: data.items || [],
    tokenCount: calculateTokenCount(data.items || [])
  };
}

export async function getCollectionsForAnonymous(anonymousId: string): Promise<CollectionWithItems[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('anonymous_id', anonymousId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(c => ({
    ...c,
    items: c.items || [],
    tokenCount: calculateTokenCount(c.items || [])
  }));
}

export async function getCollectionsForUser(userId: string): Promise<CollectionWithItems[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(c => ({
    ...c,
    items: c.items || [],
    tokenCount: calculateTokenCount(c.items || [])
  }));
}

// Get any item by source_id (for cache check before extraction)
export async function getItemBySourceId(sourceId: string): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('source_id', sourceId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ============================================
// Create operations
// ============================================

export async function createCollectionWithPreExtractedItem(
  content: PreExtractedItem,
  anonymousId: string
): Promise<CollectionWithItems> {
  const collectionId = generateId();
  const itemId = generateId();
  const now = new Date().toISOString();
  const sourceId = content.youtube_id || hashUrl(content.url);
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // If content is empty, try to reuse transcript from existing item with same source_id
  let transcript = content.content;
  let title = content.title;
  let channel = content.channel || null;
  let duration = durationStr;

  if (!transcript) {
    const cached = await getItemBySourceId(sourceId);
    if (cached) {
      transcript = cached.transcript || '';
      title = title || cached.title || '';
      channel = channel || cached.channel;
      duration = duration || cached.duration;
    }
  }

  // Create collection
  const { error: collectionError } = await supabase
    .from('collections')
    .insert({
      id: collectionId,
      user_id: null,
      anonymous_id: anonymousId,
      title: title,
      created_at: now,
      updated_at: now
    });

  if (collectionError) throw new Error(collectionError.message);

  // Create item
  const item: Item = {
    id: itemId,
    collection_id: collectionId,
    source_id: sourceId,
    source_type: content.type,
    url: content.url,
    title: title,
    channel: channel,
    duration: duration,
    transcript: transcript,
    added_at: now
  };

  const { error: itemError } = await supabase
    .from('items')
    .insert(item);

  if (itemError) throw new Error(itemError.message);

  return {
    id: collectionId,
    user_id: null,
    anonymous_id: anonymousId,
    title: title,
    pre_prompt: null,
    created_at: now,
    updated_at: now,
    items: [item],
    tokenCount: estimateTokens(transcript)
  };
}

export async function addPreExtractedItemToCollection(
  collectionId: string,
  content: PreExtractedItem
): Promise<Item> {
  const itemId = generateId();
  const now = new Date().toISOString();
  const sourceId = content.youtube_id || hashUrl(content.url);
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // If content is empty, try to reuse transcript from existing item with same source_id
  let transcript = content.content;
  let title = content.title;
  let channel = content.channel || null;
  let duration = durationStr;

  if (!transcript) {
    const cached = await getItemBySourceId(sourceId);
    if (cached) {
      transcript = cached.transcript || '';
      title = title || cached.title || '';
      channel = channel || cached.channel;
      duration = duration || cached.duration;
    }
  }

  const item: Item = {
    id: itemId,
    collection_id: collectionId,
    source_id: sourceId,
    source_type: content.type,
    url: content.url,
    title: title,
    channel: channel,
    duration: duration,
    transcript: transcript,
    added_at: now
  };

  const { error } = await supabase
    .from('items')
    .insert(item);

  if (error) throw new Error(error.message);

  // Update collection's updated_at
  await supabase
    .from('collections')
    .update({ updated_at: now })
    .eq('id', collectionId);

  return item;
}

// ============================================
// Update operations
// ============================================

export async function updateCollectionTitle(id: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('collections')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

export async function updateCollectionPrePrompt(id: string, prePrompt: string | null): Promise<boolean> {
  const { error } = await supabase
    .from('collections')
    .update({ pre_prompt: prePrompt, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

// ============================================
// Delete operations
// ============================================

export async function removeItemFromCollection(collectionId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId)
    .eq('collection_id', collectionId);

  if (error) return false;

  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collectionId);

  return true;
}

export async function deleteCollection(id: string): Promise<boolean> {
  // Items are deleted automatically via ON DELETE CASCADE
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id);

  return !error;
}

// ============================================
// Check operations
// ============================================

export async function checkItemInAnonymousCollections(
  anonymousId: string,
  sourceId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, items!inner(source_id)')
    .eq('anonymous_id', anonymousId)
    .eq('items.source_id', sourceId);

  if (error || !data) return [];
  return data.map(c => c.id);
}

export async function checkItemInUserCollections(
  userId: string,
  sourceId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, items!inner(source_id)')
    .eq('user_id', userId)
    .eq('items.source_id', sourceId);

  if (error || !data) return [];
  return data.map(c => c.id);
}

// ============================================
// Fork / Auth operations
// ============================================

export async function forkCollection(originalId: string, newUserId: string): Promise<CollectionWithItems | null> {
  const original = await getCollectionById(originalId);
  if (!original) return null;

  const newId = generateId();
  const now = new Date().toISOString();

  // Copy collection
  const { error: collectionError } = await supabase
    .from('collections')
    .insert({
      id: newId,
      user_id: newUserId,
      anonymous_id: null,
      title: original.title,
      pre_prompt: original.pre_prompt,
      created_at: now,
      updated_at: now
    });

  if (collectionError) return null;

  // Copy items (create new items with new IDs)
  for (const item of original.items) {
    await supabase.from('items').insert({
      id: generateId(),
      collection_id: newId,
      source_id: item.source_id,
      source_type: item.source_type,
      url: item.url,
      title: item.title,
      channel: item.channel,
      duration: item.duration,
      transcript: item.transcript,
      added_at: now
    });
  }

  return getCollectionById(newId);
}

export async function claimCollection(id: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('collections')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('user_id', null)
    .select();

  return !error && data && data.length > 0;
}
