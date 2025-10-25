-- Fix Extension in Public warning
-- Move extensions from public schema to extensions schema

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move pg_stat_statements extension if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements' 
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    ALTER EXTENSION pg_stat_statements SET SCHEMA extensions;
  END IF;
END
$$;

-- Move pgcrypto extension if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' 
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END
$$;

-- Move uuid-ossp extension if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp' 
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    ALTER EXTENSION "uuid-ossp" SET SCHEMA extensions;
  END IF;
END
$$;

-- Update search_path to include extensions schema
ALTER DATABASE postgres SET search_path TO public, extensions;