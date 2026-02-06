// Migration: Add thumbnail_url to collections and backfill from first item
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const supabase = createClient(
  config.supabaseUrl!,
  config.supabaseSecretKey!,
  { auth: { persistSession: false } }
);

async function migrate() {
  console.log('Starting migration: add-collection-thumbnails');

  // Step 1: Check if column exists by trying to select it
  const { error: checkError } = await supabase
    .from('collections')
    .select('thumbnail_url')
    .limit(1);

  if (checkError && checkError.message.includes('thumbnail_url')) {
    console.log('Column thumbnail_url does not exist. Please run this SQL first:');
    console.log('ALTER TABLE collections ADD COLUMN thumbnail_url TEXT;');
    process.exit(1);
  }

  console.log('Column thumbnail_url exists.');

  // Step 2: Get all collections without thumbnails
  const { data: collections, error: fetchError } = await supabase
    .from('collections')
    .select('id')
    .is('thumbnail_url', null);

  if (fetchError) {
    console.error('Error fetching collections:', fetchError.message);
    process.exit(1);
  }

  console.log(`Found ${collections?.length || 0} collections without thumbnails.`);

  if (!collections || collections.length === 0) {
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  // Step 3: For each collection, get the first item and generate thumbnail
  let updated = 0;
  let skipped = 0;

  for (const collection of collections) {
    const { data: items, error: itemError } = await supabase
      .from('items')
      .select('source_id, source_type, url')
      .eq('collection_id', collection.id)
      .order('added_at', { ascending: true })
      .limit(1);

    if (itemError) {
      console.error(`Error fetching items for ${collection.id}:`, itemError.message);
      skipped++;
      continue;
    }

    if (!items || items.length === 0) {
      skipped++;
      continue;
    }

    const item = items[0];
    let thumbnailUrl: string;

    if (item.source_type === 'youtube') {
      thumbnailUrl = `https://img.youtube.com/vi/${item.source_id}/mqdefault.jpg`;
    } else {
      // Extract domain from URL
      try {
        const domain = new URL(item.url).hostname;
        thumbnailUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      } catch {
        skipped++;
        continue;
      }
    }

    // Update collection with thumbnail
    const { error: updateError } = await supabase
      .from('collections')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', collection.id);

    if (updateError) {
      console.error(`Error updating ${collection.id}:`, updateError.message);
      skipped++;
    } else {
      updated++;
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

migrate().catch(console.error);
