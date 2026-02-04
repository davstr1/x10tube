-- ============================================
-- SHARED ITEMS MIGRATION - Phase 5: Finalize
-- Run this AFTER validating the migration is successful
-- ============================================

-- Step 1: Rename old table (keep as backup)
ALTER TABLE items RENAME TO items_old;

-- Step 2: Rename new table to items
-- Note: The FK in collection_items still references items_new, which is fine
-- Or we can update it:
ALTER TABLE items_new RENAME TO items;

-- Step 3: Update the FK reference (optional, if you renamed)
-- ALTER TABLE collection_items DROP CONSTRAINT collection_items_item_id_fkey;
-- ALTER TABLE collection_items ADD CONSTRAINT collection_items_item_id_fkey
--   FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

SELECT 'Migration finalized! Old data in items_old table.' as status;

-- ============================================
-- CLEANUP (run AFTER 1 week of successful operation)
-- ============================================
-- DROP TABLE items_old;
