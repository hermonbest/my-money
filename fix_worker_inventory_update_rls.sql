-- Fix Worker Inventory Update RLS Policies
-- This fixes the "PGRST116: Cannot coerce the result to a single JSON object" error
-- that occurs when workers try to update inventory quantities during sales

-- First, let's check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'inventory'
ORDER BY policyname;

-- Add UPDATE policy for workers to modify inventory in their assigned store
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

-- Add UPDATE policy for owners to modify inventory in their stores
CREATE POLICY "Owners can update inventory in their stores" 
ON inventory FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'owner'
    AND profiles.store_id = inventory.store_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'owner'
    AND profiles.store_id = inventory.store_id
  )
);

-- Add UPDATE policy for individual users to modify their own inventory
CREATE POLICY "Individual users can update their own inventory" 
ON inventory FOR UPDATE
USING (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'individual'
  )
)
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'individual'
  )
);

-- Verify the new policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'inventory' AND cmd = 'UPDATE'
ORDER BY policyname;

-- Test the UPDATE permission for current worker
-- This should return the inventory item if the worker has access
SELECT id, item_name, quantity, store_id, user_id
FROM inventory 
WHERE id = 'cc5c96e9-4a63-4b29-9040-0113177d0335';

-- Grant necessary permissions on the inventory table
GRANT SELECT, UPDATE ON inventory TO authenticated;
GRANT SELECT, UPDATE ON inventory TO anon;