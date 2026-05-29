
-- Drop old overloaded versions that conflict
DROP FUNCTION IF EXISTS get_platform_revenue(integer);
DROP FUNCTION IF EXISTS get_platform_revenue(integer, date, date);
