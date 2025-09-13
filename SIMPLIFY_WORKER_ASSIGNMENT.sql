-- Simplify Worker Assignment System
-- This script removes the store_workers table and updates RLS policies to use only profiles.store_id

-- =====================================================
-- 1. DROP REDUNDANT TABLES AND VIEWS
-- =====================================================

-- Drop the store_workers_with_profiles view first (depends on store_workers table)
DROP VIEW IF EXISTS store_workers_with_profiles CASCADE;

-- Drop the store_workers table
DROP TABLE IF EXISTS store_workers CASCADE;

-- =====================================================
-- 2. UPDATE RLS POLICIES TO USE ONLY PROFILES TABLE
-- =====================================================

-- Update inventory policies to use only profiles table
DROP POLICY IF EXISTS "inventory_worker_view" ON inventory;
CREATE POLICY "inventory_worker_view" ON inventory
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'worker' 
    AND profiles.store_id = inventory.store_id
  )
);

-- Update sales policies to use only profiles table
DROP POLICY IF EXISTS "sales_worker_view" ON sales;
CREATE POLICY "sales_worker_view" ON sales
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'worker' 
    AND profiles.store_id = sales.store_id
  )
);

-- Update sale_items policies to use only profiles table
DROP POLICY IF EXISTS "sale_items_worker_view" ON sale_items;
CREATE POLICY "sale_items_worker_view" ON sale_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'worker' 
    AND profiles.store_id = (
      SELECT store_id FROM sales 
      WHERE sales.id = sale_items.sale_id
    )
  )
);

-- Update expenses policies to use only profiles table
DROP POLICY IF EXISTS "expenses_worker_view" ON expenses;
CREATE POLICY "expenses_worker_view" ON expenses
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'worker' 
    AND profiles.store_id = expenses.store_id
  )
);

-- =====================================================
-- 3. ADD WORKER UPDATE POLICIES (if not already exist)
-- =====================================================

-- Add UPDATE policy for workers to modify inventory in their assigned store
DROP POLICY IF EXISTS "Workers can update inventory in their store" ON inventory;
CREATE POLICY "Workers can update inventory in their store" 
ON inventory FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = inventory.store_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = inventory.store_id
  )
);

-- Add UPDATE policy for workers to modify sales in their assigned store
DROP POLICY IF EXISTS "Workers can update sales in their store" ON sales;
CREATE POLICY "Workers can update sales in their store" 
ON sales FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = sales.store_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = sales.store_id
  )
);

-- Add INSERT policy for workers to create sales in their assigned store
DROP POLICY IF EXISTS "Workers can create sales in their store" ON sales;
CREATE POLICY "Workers can create sales in their store" 
ON sales FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = sales.store_id
  )
);

-- Add INSERT policy for workers to create sale_items in their assigned store
DROP POLICY IF EXISTS "Workers can create sale_items in their store" ON sale_items;
CREATE POLICY "Workers can create sale_items in their store" 
ON sale_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = (
      SELECT store_id FROM sales 
      WHERE sales.id = sale_items.sale_id
    )
  )
);

-- Add INSERT policy for workers to create expenses in their assigned store
DROP POLICY IF EXISTS "Workers can create expenses in their store" ON expenses;
CREATE POLICY "Workers can create expenses in their store" 
ON expenses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'worker'
    AND profiles.store_id = expenses.store_id
  )
);

-- =====================================================
-- 4. VERIFY CHANGES
-- =====================================================

-- Check that store_workers table is removed
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'store_workers';

-- Check updated policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('inventory', 'sales', 'sale_items', 'expenses')
AND policyname LIKE '%worker%'
ORDER BY tablename, policyname;

-- =====================================================
-- 5. SUMMARY
-- =====================================================

-- This script simplifies the worker assignment system by:
-- 1. Removing the redundant store_workers table
-- 2. Updating all RLS policies to use only profiles.store_id
-- 3. Ensuring workers can only access data for their assigned store
-- 4. Maintaining all existing functionality with a simpler architecture

-- The worker assignment now works as follows:
-- - Workers are assigned to stores via profiles.store_id
-- - All RLS policies check profiles.store_id for worker access
-- - Single source of truth for worker assignments
-- - Simpler and more maintainable codebase
