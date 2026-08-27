-- Weekly Distance Report for Google Maps API Pricing
-- Shows total KM, average per user, and estimated API costs
-- Query last 7 days of GPS data

WITH user_distances AS (
  -- Calculate distance traveled by each user in the last 7 days
  SELECT
    gt.user_id,
    u.full_name,
    u.email,
    COUNT(*) as gps_points_count,
    COUNT(DISTINCT gt.date) as active_days,
    -- Calculate total distance using Haversine formula
    ROUND(
      COALESCE(
        SUM(
          CASE
            WHEN LAG(gt.latitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp) IS NOT NULL
            THEN
              6371 * 2 * ASIN(SQRT(
                POWER(SIN((RADIANS(gt.latitude) - RADIANS(LAG(gt.latitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp))) / 2), 2) +
                COS(RADIANS(LAG(gt.latitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp))) *
                COS(RADIANS(gt.latitude)) *
                POWER(SIN((RADIANS(gt.longitude) - RADIANS(LAG(gt.longitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp))) / 2), 2)
              ))
            ELSE 0
          END
        ),
        0
      )::NUMERIC,
      2
    ) as distance_km
  FROM public.gps_tracking gt
  LEFT JOIN public.users u ON gt.user_id = u.id
  WHERE gt.date >= CURRENT_DATE - INTERVAL '7 days'
    AND gt.date <= CURRENT_DATE
  GROUP BY gt.user_id, u.full_name, u.email
)
SELECT
  'Weekly Summary' as report_type,
  CURRENT_DATE - INTERVAL '7 days' as week_start_date,
  CURRENT_DATE as week_end_date,
  COUNT(*) as total_users,
  ROUND(SUM(distance_km)::NUMERIC, 2) as total_distance_km,
  ROUND((SUM(distance_km) * 0.621371)::NUMERIC, 2) as total_distance_miles,
  ROUND((SUM(distance_km) / NULLIF(COUNT(*), 0))::NUMERIC, 2) as average_distance_per_user_km,
  ROUND((SUM(distance_km) * 0.621371 / NULLIF(COUNT(*), 0))::NUMERIC, 2) as average_distance_per_user_miles,
  SUM(gps_points_count)::INTEGER as total_gps_points_captured,
  -- Pricing estimation
  SUM(gps_points_count) * 0.005 as estimated_api_cost_usd_base,
  ROUND((SUM(distance_km) * 0.001)::NUMERIC, 2) as estimated_api_cost_usd_distance,
  ROUND((SUM(gps_points_count) * 0.005 + SUM(distance_km) * 0.001)::NUMERIC, 2) as total_estimated_api_cost_usd
FROM user_distances
UNION ALL
-- Detailed breakdown by user
SELECT
  CONCAT('User: ', COALESCE(full_name, email)) as report_type,
  CURRENT_DATE - INTERVAL '7 days' as week_start_date,
  CURRENT_DATE as week_end_date,
  1 as total_users,
  distance_km as total_distance_km,
  ROUND((distance_km * 0.621371)::NUMERIC, 2) as total_distance_miles,
  distance_km as average_distance_per_user_km,
  ROUND((distance_km * 0.621371)::NUMERIC, 2) as average_distance_per_user_miles,
  gps_points_count as total_gps_points_captured,
  ROUND((gps_points_count * 0.005)::NUMERIC, 4) as estimated_api_cost_usd_base,
  ROUND((distance_km * 0.001)::NUMERIC, 4) as estimated_api_cost_usd_distance,
  ROUND((gps_points_count * 0.005 + distance_km * 0.001)::NUMERIC, 4) as total_estimated_api_cost_usd
FROM user_distances
ORDER BY
  CASE WHEN report_type = 'Weekly Summary' THEN 0 ELSE 1 END,
  total_distance_km DESC;
