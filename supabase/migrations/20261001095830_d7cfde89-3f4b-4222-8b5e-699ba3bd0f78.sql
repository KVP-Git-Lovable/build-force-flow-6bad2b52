CREATE OR REPLACE FUNCTION public.recalculate_monthly_leave_accruals(_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_lt RECORD;
  v_doj DATE;
  v_now DATE := CURRENT_DATE;
  v_current_year INT := EXTRACT(YEAR FROM v_now)::INT;
  v_current_month INT := EXTRACT(MONTH FROM v_now)::INT;
  v_start_month INT;
  v_period_alloc NUMERIC;
  v_monthly_alloc NUMERIC;
  v_existing NUMERIC;
  v_effective_month INT;
  v_prev_remaining NUMERIC;
  v_month_used NUMERIC;
  v_m INT;
  v_total_allocated NUMERIC;
  v_total_used NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND (_target_user_id IS NULL OR _target_user_id IS DISTINCT FROM auth.uid())
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_user IN
    SELECT u.id AS user_id FROM public.users u
    WHERE u.is_active = true AND (_target_user_id IS NULL OR u.id = _target_user_id)
  LOOP
    SELECT e.date_of_joining INTO v_doj FROM public.employees e WHERE e.user_id = v_user.user_id;

    FOR v_lt IN
      SELECT lt.id,
             COALESCE(lp.yearly_entitlement, lt.annual_quota, 0)::NUMERIC AS yearly,
             (lp.id IS NOT NULL OR ac.id IS NOT NULL) AS configured,
             COALESCE(ac.frequency, lp.accrual_type, 'monthly') AS freq,
             ac.divisor, COALESCE(ac.round_mode, 'round') AS round_mode,
             COALESCE(ac.prorate_joining, true) AS prorate,
             COALESCE(ac.credit_day, 1) AS credit_day,
             COALESCE(lp.last_update_mode, 'retroactive') AS update_mode,
             lp.updated_at AS policy_updated_at
      FROM public.leave_types lt
      LEFT JOIN public.leave_policy lp ON lp.leave_type_id = lt.id AND lp.is_active = true
      LEFT JOIN public.accrual_config ac ON ac.leave_type_id = lt.id
      WHERE lt.is_active = true
    LOOP
      IF NOT v_lt.configured THEN
        v_period_alloc := FLOOR(v_lt.yearly / 12); -- legacy behaviour
      ELSE
        v_period_alloc := v_lt.yearly / NULLIF(COALESCE(v_lt.divisor,
          CASE v_lt.freq WHEN 'quarterly' THEN 4 WHEN 'annual' THEN 1 ELSE 12 END), 0);
        v_period_alloc := COALESCE(v_period_alloc, 0) * 2; -- half-day granularity
        v_period_alloc := CASE v_lt.round_mode
          WHEN 'floor' THEN FLOOR(v_period_alloc)
          WHEN 'ceil' THEN CEIL(v_period_alloc)
          ELSE ROUND(v_period_alloc) END / 2;
      END IF;

      IF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) > v_current_year THEN
        CONTINUE;
      ELSIF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) = v_current_year AND v_lt.prorate THEN
        v_start_month := EXTRACT(MONTH FROM v_doj)::INT;
      ELSE
        v_start_month := 1;
      END IF;

      -- Month from which a non-retroactive change takes effect
      v_effective_month := 1;
      IF v_lt.configured AND v_lt.policy_updated_at IS NOT NULL
         AND EXTRACT(YEAR FROM v_lt.policy_updated_at) = v_current_year THEN
        IF v_lt.update_mode = 'current_month' THEN
          v_effective_month := EXTRACT(MONTH FROM v_lt.policy_updated_at)::INT;
        ELSIF v_lt.update_mode = 'next_month' THEN
          v_effective_month := EXTRACT(MONTH FROM v_lt.policy_updated_at)::INT + 1;
        END IF;
      END IF;

      v_prev_remaining := 0; v_total_allocated := 0; v_total_used := 0;

      FOR v_m IN v_start_month..v_current_month LOOP
        IF v_lt.freq = 'quarterly' AND v_lt.configured THEN
          v_monthly_alloc := CASE WHEN v_m IN (1,4,7,10) OR v_m = v_start_month AND v_start_month > 1 AND v_m NOT IN (1,4,7,10) AND false THEN v_period_alloc ELSE 0 END;
        ELSIF v_lt.freq = 'annual' AND v_lt.configured THEN
          v_monthly_alloc := CASE WHEN v_m = v_start_month THEN v_period_alloc ELSE 0 END;
        ELSE
          v_monthly_alloc := v_period_alloc;
        END IF;

        -- Credit day not reached yet in the current month
        IF v_lt.configured AND v_m = v_current_month AND EXTRACT(DAY FROM v_now) < v_lt.credit_day THEN
          v_monthly_alloc := 0;
        END IF;

        -- Keep previously credited amounts for months before the effective month
        IF v_m < v_effective_month THEN
          SELECT allocated INTO v_existing FROM public.monthly_leave_accrual
          WHERE user_id = v_user.user_id AND leave_type_id = v_lt.id AND year = v_current_year AND month = v_m;
          IF FOUND THEN v_monthly_alloc := v_existing; END IF;
        END IF;

        SELECT COALESCE(SUM(
          CASE
            WHEN la.from_date >= make_date(v_current_year, v_m, 1)
                 AND la.to_date < (make_date(v_current_year, v_m, 1) + interval '1 month')::date
            THEN la.total_days
            ELSE GREATEST(0,
                (LEAST(la.to_date, (make_date(v_current_year, v_m, 1) + interval '1 month' - interval '1 day')::date)
                 - GREATEST(la.from_date, make_date(v_current_year, v_m, 1)) + 1)::NUMERIC)
          END), 0) INTO v_month_used
        FROM public.leave_applications la
        WHERE la.user_id = v_user.user_id AND la.leave_type_id = v_lt.id AND la.status = 'approved'
          AND la.from_date <= (make_date(v_current_year, v_m, 1) + interval '1 month' - interval '1 day')::date
          AND la.to_date >= make_date(v_current_year, v_m, 1);

        INSERT INTO public.monthly_leave_accrual (user_id, leave_type_id, year, month, allocated, carried_forward, used)
        VALUES (v_user.user_id, v_lt.id, v_current_year, v_m, v_monthly_alloc, v_prev_remaining, v_month_used)
        ON CONFLICT (user_id, leave_type_id, year, month) DO UPDATE
        SET allocated = EXCLUDED.allocated, carried_forward = EXCLUDED.carried_forward,
            used = EXCLUDED.used, updated_at = now();

        v_total_allocated := v_total_allocated + v_monthly_alloc;
        v_total_used := v_total_used + v_month_used;
        v_prev_remaining := v_prev_remaining + v_monthly_alloc - v_month_used;
      END LOOP;

      INSERT INTO public.leave_balance (user_id, leave_type_id, year, opening_balance, used_balance)
      VALUES (v_user.user_id, v_lt.id, v_current_year, v_total_allocated::INT, v_total_used::INT)
      ON CONFLICT (user_id, leave_type_id, year) DO UPDATE
      SET opening_balance = EXCLUDED.opening_balance, used_balance = EXCLUDED.used_balance, updated_at = now();
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_auto_end_day()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  v_tz TEXT;
  v_local TIMESTAMP;
  v_today DATE;
  v_close TIME;
  v_warn TIME;
  a RECORD;
  v_last TIMESTAMPTZ;
  v_closed INT := 0;
  v_warned INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO p FROM public.auto_end_day_policy LIMIT 1;
  IF NOT FOUND OR NOT p.is_enabled THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  v_tz := COALESCE(NULLIF(p.timezone, ''), 'Asia/Kolkata');
  v_local := now() AT TIME ZONE v_tz;
  v_today := v_local::date;
  v_close := COALESCE(p.auto_close_time::time, '22:00'::time);
  v_warn := COALESCE(NULLIF(p.pre_warning_time::text, '')::time,
                     v_close - make_interval(mins => COALESCE(p.pre_warning_minutes_before, 30)));

  -- Pre-warning: once per user per day
  IF p.pre_warning_enabled AND v_local::time >= v_warn AND v_local::time < v_close THEN
    FOR a IN
      SELECT at.user_id FROM public.attendance at
      WHERE at.date = v_today AND at.check_in_time IS NOT NULL AND at.check_out_time IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = at.user_id AND n.type = 'auto_day_warning'
            AND (n.created_at AT TIME ZONE v_tz)::date = v_today)
    LOOP
      PERFORM public.send_notification(a.user_id, 'Your day will end automatically',
        'You have not checked out yet. Your day will be auto-closed at ' || to_char(v_close, 'HH24:MI') || '.',
        'auto_day_warning', 'attendance', NULL);
      v_warned := v_warned + 1;
    END LOOP;
  END IF;

  -- Auto-close: today's open days after close time, plus any older open days
  FOR a IN
    SELECT at.* FROM public.attendance at
    WHERE at.check_in_time IS NOT NULL AND at.check_out_time IS NULL
      AND (at.date < v_today OR (at.date = v_today AND v_local::time >= v_close))
  LOOP
    SELECT MAX(t) INTO v_last FROM (
      SELECT GREATEST(ae.end_time, ae.start_time, ae.status_changed_at, ae.created_at) AS t
      FROM public.activity_events ae
      WHERE ae.user_id = a.user_id AND ae.activity_date = a.date
        AND p.last_activity_source <> 'last_order_only'
      UNION ALL
      SELECT o.created_at FROM public.orders o
      WHERE o.user_id = a.user_id AND (o.created_at AT TIME ZONE v_tz)::date = a.date
    ) s;
    v_last := LEAST(COALESCE(GREATEST(v_last, a.check_in_time), a.check_in_time),
                    ((a.date + v_close) AT TIME ZONE v_tz));

    UPDATE public.attendance
    SET check_out_time = v_last,
        total_hours = ROUND((EXTRACT(EPOCH FROM (v_last - a.check_in_time)) / 3600)::numeric, 2),
        notes = TRIM(BOTH ' ' FROM COALESCE(notes, '') || ' [Auto-closed]'),
        updated_at = now()
    WHERE id = a.id AND check_out_time IS NULL;

    IF p.close_in_progress_visits THEN
      UPDATE public.activity_events
      SET status = 'completed', end_time = COALESCE(end_time, v_last),
          outcome = CASE WHEN p.mark_unproductive AND outcome IS NULL THEN 'Unproductive' ELSE outcome END,
          status_changed_at = now()
      WHERE user_id = a.user_id AND activity_date = a.date AND status = 'in_progress';
    END IF;

    IF p.cancel_planned_visits THEN
      UPDATE public.activity_events SET status = 'cancelled', status_changed_at = now()
      WHERE user_id = a.user_id AND activity_date = a.date AND status = 'planned';
    END IF;

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object('closed', v_closed, 'warned', v_warned);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_auto_end_day() FROM PUBLIC, anon;