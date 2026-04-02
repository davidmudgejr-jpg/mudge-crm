-- Enable PostgreSQL trigram extension for fuzzy search
-- This provides the similarity() function and % operator for typo-tolerant matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
