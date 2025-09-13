-- Create worker_assignments table
-- This table manages worker assignments to stores

CREATE TABLE IF NOT EXISTS worker_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    worker_email TEXT NOT NULL,
    assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_worker_assignments_store_id ON worker_assignments(store_id);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_worker_email ON worker_assignments(worker_email);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_active ON worker_assignments(is_active);

-- Enable RLS
ALTER TABLE worker_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for worker_assignments table

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Store owners can view their store assignments" ON worker_assignments;
DROP POLICY IF EXISTS "Store owners can create assignments for their stores" ON worker_assignments;
DROP POLICY IF EXISTS "Store owners can update assignments for their stores" ON worker_assignments;
DROP POLICY IF EXISTS "Store owners can delete assignments for their stores" ON worker_assignments;
DROP POLICY IF EXISTS "Workers can view their own assignments" ON worker_assignments;

-- Store owners can view assignments for their stores
CREATE POLICY "Store owners can view their store assignments" ON worker_assignments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = worker_assignments.store_id 
    AND stores.owner_id = auth.uid()
  )
);

-- Store owners can create assignments for their stores
CREATE POLICY "Store owners can create assignments for their stores" ON worker_assignments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = worker_assignments.store_id 
    AND stores.owner_id = auth.uid()
  )
);

-- Store owners can update assignments for their stores
CREATE POLICY "Store owners can update assignments for their stores" ON worker_assignments
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = worker_assignments.store_id 
    AND stores.owner_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = worker_assignments.store_id 
    AND stores.owner_id = auth.uid()
  )
);

-- Store owners can delete assignments for their stores
CREATE POLICY "Store owners can delete assignments for their stores" ON worker_assignments
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = worker_assignments.store_id 
    AND stores.owner_id = auth.uid()
  )
);

-- Workers can view their own assignments
CREATE POLICY "Workers can view their own assignments" ON worker_assignments
FOR SELECT USING (
  worker_email = (
    SELECT email FROM auth.users WHERE id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_assignments TO authenticated;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_worker_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS update_worker_assignments_updated_at ON worker_assignments;
CREATE TRIGGER update_worker_assignments_updated_at
    BEFORE UPDATE ON worker_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_assignments_updated_at();
