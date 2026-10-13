-- ==============================================================================
-- APNA KHATA ADVANCE - WIPE ALL TEST DATA (FACTORY RESET)
-- Run this in Supabase SQL Editor to clear all test families, users, and records.
-- ==============================================================================

TRUNCATE TABLE 
  public.committee_records, 
  public.committees, 
  public.household_finance, 
  public.month_rollovers, 
  public.khata_entries, 
  public.app_sessions, 
  public.app_users, 
  public.families 
CASCADE;
