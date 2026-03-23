-- Migration 003: Add lease comp columns (cam_expenses, zoning, doors_with_lease)
-- These are transaction-level snapshots, not pulled from property record

ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS cam_expenses NUMERIC;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS zoning TEXT;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS doors_with_lease INT;
