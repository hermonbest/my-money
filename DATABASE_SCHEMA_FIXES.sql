-- Database Schema Fixes
-- Run these commands in your Supabase SQL editor to fix schema issues

-- 1. Add expiration_date column to inventory table (if not exists)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- 2. Fix column name mismatch - rename quantity_in_stock to quantity
-- First check if quantity_in_stock exists and quantity doesn't
DO $$
BEGIN
    -- Check if quantity_in_stock column exists and quantity doesn't
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory' 
        AND column_name = 'quantity_in_stock'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory' 
        AND column_name = 'quantity'
    ) THEN
        -- Rename the column
        ALTER TABLE inventory RENAME COLUMN quantity_in_stock TO quantity;
        RAISE NOTICE 'Renamed quantity_in_stock to quantity';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory' 
        AND column_name = 'quantity'
    ) THEN
        RAISE NOTICE 'Column quantity already exists';
    ELSE
        RAISE NOTICE 'Neither quantity_in_stock nor quantity column found';
    END IF;
END $$;

-- 3. Fix any negative stock issues
UPDATE inventory SET quantity = 0 WHERE quantity < 0;

-- 4. Add check constraint to prevent negative stock
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS check_quantity_non_negative;
ALTER TABLE inventory ADD CONSTRAINT check_quantity_non_negative CHECK (quantity >= 0);

-- 5. Create safer inventory decrement function
-- First drop the existing function if it exists
DROP FUNCTION IF EXISTS decrement_inventory_quantity(UUID, INTEGER);

-- Create the new function
CREATE OR REPLACE FUNCTION decrement_inventory_quantity(item_id UUID, quantity_to_decrement INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    current_quantity INTEGER;
BEGIN
    -- Get current quantity
    SELECT quantity INTO current_quantity FROM inventory WHERE id = item_id;

    -- Check if sufficient stock
    IF current_quantity IS NULL THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    IF current_quantity < quantity_to_decrement THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', current_quantity, quantity_to_decrement;
    END IF;

    -- Update quantity
    UPDATE inventory
    SET quantity = quantity - quantity_to_decrement,
        updated_at = NOW()
    WHERE id = item_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 6. Add missing columns to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_number TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- 7. Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'inventory' 
ORDER BY ordinal_position;

-- 8. Verify sales table columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'sales' 
ORDER BY ordinal_position;