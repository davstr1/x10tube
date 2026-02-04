// Migration script: Convert from one-to-many to many-to-many (shared items)
// Run this AFTER creating the new tables in Supabase
// Run from server directory: npm run migrate:shared-items

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  }
} catch (e) {
  console.error('Could not load .env file from', envPath);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Generate a stable source_id for a URL (SHA256 hash)
function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// Determine source_id based on type
function getSourceId(item: { youtube_id: string | null; url: string; type: string }): string {
  if (item.type === 'youtube' && item.youtube_id) {
    return item.youtube_id;
  }
  return hashUrl(item.url);
}

interface OldItem {
  id: string;
  collection_id: string;
  url: string;
  type: string;
  youtube_id: string | null;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}

async function migrate() {
  console.log('='.repeat(60));
  console.log('Migration: One-to-Many → Many-to-Many (Shared Items)');
  console.log('='.repeat(60));

  // 1. Fetch all existing items
  console.log('\n[1/5] Fetching existing items...');
  const { data: oldItems, error: fetchError } = await supabase
    .from('items')
    .select('*')
    .order('added_at', { ascending: true });

  if (fetchError || !oldItems) {
    throw new Error(`Failed to fetch items: ${fetchError?.message}`);
  }

  console.log(`    Found ${oldItems.length} items to migrate`);

  if (oldItems.length === 0) {
    console.log('\n✓ No items to migrate. Done!');
    return;
  }

  // 2. Deduplicate by source_id
  console.log('\n[2/5] Deduplicating items by source...');
  const uniqueItems = new Map<string, OldItem & { source_id: string; source_type: string }>();
  const itemMapping = new Map<string, string>(); // old_id -> new_item_id

  for (const item of oldItems as OldItem[]) {
    const sourceId = getSourceId(item);
    const sourceType = (item.type === 'youtube' && item.youtube_id) ? 'youtube' : 'webpage';

    if (!uniqueItems.has(sourceId)) {
      uniqueItems.set(sourceId, {
        ...item,
        source_id: sourceId,
        source_type: sourceType
      });
    }

    // Map the old ID to the first item's ID for this source
    const firstItem = uniqueItems.get(sourceId)!;
    itemMapping.set(item.id, firstItem.id);
  }

  const duplicatesSaved = oldItems.length - uniqueItems.size;
  console.log(`    Deduplicated to ${uniqueItems.size} unique items`);
  console.log(`    (${duplicatesSaved} duplicates will be removed)`);

  // 3. Insert unique items into items_new
  console.log('\n[3/5] Inserting unique items into items_new...');
  const newItems = Array.from(uniqueItems.values()).map(item => ({
    id: item.id,
    source_id: item.source_id,
    source_type: item.source_type,
    url: item.url,
    title: item.title,
    channel: item.channel,
    duration: item.duration,
    transcript: item.transcript,
    created_at: item.added_at,
    updated_at: item.added_at
  }));

  // Insert in batches of 100
  let insertedCount = 0;
  for (let i = 0; i < newItems.length; i += 100) {
    const batch = newItems.slice(i, i + 100);
    const { error } = await supabase.from('items_new').insert(batch);
    if (error) {
      console.error(`    Error inserting batch ${i}:`, error.message);
      // Continue with other batches
    } else {
      insertedCount += batch.length;
      process.stdout.write(`    Inserted ${insertedCount}/${newItems.length}\r`);
    }
  }
  console.log(`    Inserted ${insertedCount}/${newItems.length} items`);

  // 4. Build source_id -> new_item_id mapping
  console.log('\n[4/5] Building collection_items links...');
  const { data: insertedItems } = await supabase
    .from('items_new')
    .select('id, source_id');

  const sourceToNewId = new Map<string, string>();
  for (const item of insertedItems || []) {
    sourceToNewId.set(item.source_id, item.id);
  }

  // Create links
  const links: { collection_id: string; item_id: string; position: number; added_at: string }[] = [];
  const positionCounters = new Map<string, number>();
  const seenLinks = new Set<string>(); // Dedupe collection_id:item_id pairs

  for (const oldItem of oldItems as OldItem[]) {
    const sourceId = getSourceId(oldItem);
    const newItemId = sourceToNewId.get(sourceId);

    if (!newItemId) {
      console.warn(`    Warning: No new item found for source_id: ${sourceId}`);
      continue;
    }

    const linkKey = `${oldItem.collection_id}:${newItemId}`;
    if (seenLinks.has(linkKey)) {
      continue; // Skip duplicate links
    }
    seenLinks.add(linkKey);

    // Increment position for this collection
    const pos = positionCounters.get(oldItem.collection_id) || 0;
    positionCounters.set(oldItem.collection_id, pos + 1);

    links.push({
      collection_id: oldItem.collection_id,
      item_id: newItemId,
      position: pos,
      added_at: oldItem.added_at
    });
  }

  console.log(`    Creating ${links.length} collection_items links`);

  // 5. Insert links in batches
  console.log('\n[5/5] Inserting collection_items links...');
  let linksInserted = 0;
  for (let i = 0; i < links.length; i += 100) {
    const batch = links.slice(i, i + 100);
    const { error } = await supabase.from('collection_items').insert(batch);
    if (error) {
      console.error(`    Error inserting links batch ${i}:`, error.message);
    } else {
      linksInserted += batch.length;
      process.stdout.write(`    Inserted ${linksInserted}/${links.length}\r`);
    }
  }
  console.log(`    Inserted ${linksInserted}/${links.length} links`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60));
  console.log(`\nSummary:`);
  console.log(`  Items: ${oldItems.length} → ${uniqueItems.size} (saved ${duplicatesSaved} duplicates)`);
  console.log(`  Links created: ${linksInserted}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify data in Supabase dashboard`);
  console.log(`  2. Deploy updated server code`);
  console.log(`  3. After validation, rename tables:`);
  console.log(`     ALTER TABLE items RENAME TO items_old;`);
  console.log(`     ALTER TABLE items_new RENAME TO items;`);
}

migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
