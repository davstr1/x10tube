// Collection CRUD operations (Many-to-Many architecture with shared items)
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

// Item in the shared items_new table
export interface Item {
  id: string;
  source_id: string;
  source_type: 'youtube' | 'webpage';
  url: string;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

// Item with position info (from junction table)
export interface CollectionItem extends Item {
  position: number;
  added_at: string;
}

export interface CollectionWithItems extends Collection {
  items: CollectionItem[];
  tokenCount: number;
}

export interface PreExtractedItem {
  url: string;
  title: string;
  type: 'youtube' | 'webpage';
  content: string;
  youtube_id?: string;
  channel?: string;
  duration?: number;  // in seconds
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

function calculateTokenCount(items: CollectionItem[]): number {
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

// Hash URL to create stable source_id for webpages
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// Get source_id from content
function getSourceId(type: 'youtube' | 'webpage', youtubeId?: string, url?: string): string {
  if (type === 'youtube' && youtubeId) {
    return youtubeId;
  }
  return hashUrl(url || '');
}

// ============================================
// Read operations
// ============================================

export async function getCollectionById(id: string): Promise<CollectionWithItems | null> {
  // 1. Get the collection
  const { data: collection, error: collError } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .single();

  if (collError || !collection) return null;

  // 2. Get items via junction table
  const { data: links, error: linkError } = await supabase
    .from('collection_items')
    .select(`
      position,
      added_at,
      item:items_new (*)
    `)
    .eq('collection_id', id)
    .order('position', { ascending: false }); // Most recent first (by position desc)

  if (linkError) return null;

  // 3. Transform to CollectionItem[]
  const items: CollectionItem[] = (links || [])
    .filter(link => link.item) // Filter out any null items
    .map(link => ({
      ...(link.item as unknown as Item),
      position: link.position,
      added_at: link.added_at
    }));

  return {
    ...collection,
    items,
    tokenCount: calculateTokenCount(items)
  };
}

export async function getCollectionsForAnonymous(anonymousId: string): Promise<CollectionWithItems[]> {
  // Single query: get collections with their items via junction table
  const { data: collections, error: collError } = await supabase
    .from('collections')
    .select(`
      *,
      collection_items (
        position,
        added_at,
        item:items_new (*)
      )
    `)
    .eq('anonymous_id', anonymousId)
    .order('updated_at', { ascending: false });

  if (collError || !collections) return [];

  return collections.map(collection => {
    const items: CollectionItem[] = (collection.collection_items || [])
      .filter((link: { item: unknown }) => link.item)
      .sort((a: { position: number }, b: { position: number }) => b.position - a.position)
      .map((link: { item: unknown; position: number; added_at: string }) => ({
        ...(link.item as unknown as Item),
        position: link.position,
        added_at: link.added_at
      }));

    // Remove collection_items from the result (it's internal)
    const { collection_items: _, ...collectionData } = collection;

    return {
      ...collectionData,
      items,
      tokenCount: calculateTokenCount(items)
    };
  });
}

export async function getCollectionsForUser(userId: string): Promise<CollectionWithItems[]> {
  // Single query: get collections with their items via junction table
  const { data: collections, error: collError } = await supabase
    .from('collections')
    .select(`
      *,
      collection_items (
        position,
        added_at,
        item:items_new (*)
      )
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (collError || !collections) return [];

  return collections.map(collection => {
    const items: CollectionItem[] = (collection.collection_items || [])
      .filter((link: { item: unknown }) => link.item)
      .sort((a: { position: number }, b: { position: number }) => b.position - a.position)
      .map((link: { item: unknown; position: number; added_at: string }) => ({
        ...(link.item as unknown as Item),
        position: link.position,
        added_at: link.added_at
      }));

    const { collection_items: _, ...collectionData } = collection;

    return {
      ...collectionData,
      items,
      tokenCount: calculateTokenCount(items)
    };
  });
}

// Get item by source_id (for check-before-extract)
export async function getItemBySourceId(sourceId: string): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  if (error || !data) return null;
  return data as Item;
}

// ============================================
// Create operations
// ============================================

export async function createCollectionWithPreExtractedItem(
  content: PreExtractedItem,
  anonymousId: string
): Promise<CollectionWithItems> {
  const collectionId = generateId();
  const now = new Date().toISOString();
  const sourceId = getSourceId(content.type, content.youtube_id, content.url);
  const sourceType = content.type;
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // 1. Create collection
  const { error: collectionError } = await supabase
    .from('collections')
    .insert({
      id: collectionId,
      user_id: null,
      anonymous_id: anonymousId,
      title: content.title,
      created_at: now,
      updated_at: now
    });

  if (collectionError) throw new Error(collectionError.message);

  // 2. Check if item already exists
  let { data: existingItem } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  let itemId: string;
  let item: Item;

  if (existingItem) {
    itemId = existingItem.id;
    item = existingItem as Item;
    console.log(`[Collection] Reusing existing item ${itemId} for source ${sourceId}`);
  } else {
    // Create new item
    itemId = generateId();
    item = {
      id: itemId,
      source_id: sourceId,
      source_type: sourceType,
      url: content.url,
      title: content.title,
      channel: content.channel || null,
      duration: durationStr,
      transcript: content.content,
      created_at: now,
      updated_at: now
    };

    const { error: itemError } = await supabase
      .from('items_new')
      .insert(item);

    if (itemError) {
      // Handle race condition - item may have been created by another request
      if (itemError.code === '23505') {
        const { data: raceItem } = await supabase
          .from('items_new')
          .select('*')
          .eq('source_id', sourceId)
          .single();
        if (raceItem) {
          itemId = raceItem.id;
          item = raceItem as Item;
        } else {
          throw new Error(itemError.message);
        }
      } else {
        throw new Error(itemError.message);
      }
    }
    console.log(`[Collection] Created new item ${itemId} for source ${sourceId}`);
  }

  // 3. Create link
  const { error: linkError } = await supabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      item_id: itemId,
      position: 0,
      added_at: now
    });

  if (linkError) throw new Error(linkError.message);

  return {
    id: collectionId,
    user_id: null,
    anonymous_id: anonymousId,
    title: content.title,
    pre_prompt: null,
    created_at: now,
    updated_at: now,
    items: [{ ...item, position: 0, added_at: now }],
    tokenCount: estimateTokens(content.content)
  };
}

export async function addPreExtractedItemToCollection(
  collectionId: string,
  content: PreExtractedItem
): Promise<CollectionItem> {
  const now = new Date().toISOString();
  const sourceId = getSourceId(content.type, content.youtube_id, content.url);
  const sourceType = content.type;
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // 1. Check if item already exists (by source_id)
  let { data: existingItem } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  let itemId: string;
  let item: Item;

  if (existingItem) {
    // Item exists - reuse it
    itemId = existingItem.id;
    item = existingItem as Item;
    console.log(`[Collection] Reusing existing item ${itemId} for source ${sourceId}`);
  } else {
    // Create new item
    itemId = generateId();
    item = {
      id: itemId,
      source_id: sourceId,
      source_type: sourceType,
      url: content.url,
      title: content.title,
      channel: content.channel || null,
      duration: durationStr,
      transcript: content.content,
      created_at: now,
      updated_at: now
    };

    const { error: insertError } = await supabase
      .from('items_new')
      .insert(item);

    if (insertError) {
      // Handle race condition
      if (insertError.code === '23505') {
        const { data: raceItem } = await supabase
          .from('items_new')
          .select('*')
          .eq('source_id', sourceId)
          .single();
        if (raceItem) {
          itemId = raceItem.id;
          item = raceItem as Item;
        } else {
          throw new Error(insertError.message);
        }
      } else {
        throw new Error(insertError.message);
      }
    }
    console.log(`[Collection] Created new item ${itemId} for source ${sourceId}`);
  }

  // 2. Check if link already exists
  const { data: existingLink } = await supabase
    .from('collection_items')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('item_id', itemId)
    .single();

  if (existingLink) {
    // Already in this collection
    return {
      ...item,
      position: existingLink.position,
      added_at: existingLink.added_at
    };
  }

  // 3. Get next position
  const { data: maxPos } = await supabase
    .from('collection_items')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPos?.position ?? -1) + 1;

  // 4. Create link
  const { error: linkError } = await supabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      item_id: itemId,
      position: nextPosition,
      added_at: now
    });

  if (linkError) throw new Error(linkError.message);

  // 5. Update collection's updated_at
  await supabase
    .from('collections')
    .update({ updated_at: now })
    .eq('id', collectionId);

  return {
    ...item,
    position: nextPosition,
    added_at: now
  };
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
  // Delete the link (not the item itself - it may be in other collections)
  const { error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('item_id', itemId);

  if (error) return false;

  // Update collection's updated_at
  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collectionId);

  return true;
}

export async function deleteCollection(id: string): Promise<boolean> {
  // Links are deleted automatically via ON DELETE CASCADE
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
  sourceId: string  // youtube_id or hashed URL
): Promise<string[]> {
  // 1. Find item by source_id
  const { data: item } = await supabase
    .from('items_new')
    .select('id')
    .eq('source_id', sourceId)
    .single();

  if (!item) return [];

  // 2. Find collections of this user that contain this item
  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id, collections!inner(anonymous_id)')
    .eq('item_id', item.id)
    .eq('collections.anonymous_id', anonymousId);

  if (error || !data) return [];
  return data.map(d => d.collection_id);
}

export async function checkItemInUserCollections(
  userId: string,
  sourceId: string
): Promise<string[]> {
  const { data: item } = await supabase
    .from('items_new')
    .select('id')
    .eq('source_id', sourceId)
    .single();

  if (!item) return [];

  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id, collections!inner(user_id)')
    .eq('item_id', item.id)
    .eq('collections.user_id', userId);

  if (error || !data) return [];
  return data.map(d => d.collection_id);
}

// ============================================
// Fork / Auth operations
// ============================================

export async function forkCollection(originalId: string, newUserId: string): Promise<CollectionWithItems | null> {
  const original = await getCollectionById(originalId);
  if (!original) return null;

  const newId = generateId();
  const now = new Date().toISOString();

  // 1. Copy collection
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

  // 2. Create LINKS to the same items (no data duplication!)
  for (let i = 0; i < original.items.length; i++) {
    const item = original.items[i];
    await supabase.from('collection_items').insert({
      collection_id: newId,
      item_id: item.id,
      position: i,
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
