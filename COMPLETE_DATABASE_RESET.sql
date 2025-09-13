-- COMPLETE DATABASE RESET SCRIPT
-- Run this in Supabase SQL Editor to delete all demo data

-- Delete all data in correct order (respecting foreign keys)
DELETE FROM worker_assignments;
DELETE FROM sales;
DELETE FROM inventory;
DELETE FROM expenses;
DELETE FROM stores;
DELETE FROM profiles;

-- Delete all users from auth.users (this will cascade delete everything)
-- Note: You'll need to run this as a separate query with elevated permissions
-- DELETE FROM auth.users;

-- Reset sequences (optional - keeps IDs starting from 1)
-- ALTER SEQUENCE IF EXISTS profiles_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS stores_id_seq RESTART WITH 1;

-- Verify cleanup
SELECT 'profiles' as table_name, count(*) as remaining_records FROM profiles
UNION ALL
SELECT 'stores', count(*) FROM stores
UNION ALL
SELECT 'inventory', count(*) FROM inventory
UNION ALL
SELECT 'sales', count(*) FROM sales
UNION ALL
SELECT 'expenses', count(*) FROM expenses
UNION ALL
SELECT 'worker_assignments', count(*) FROM worker_assignments;
