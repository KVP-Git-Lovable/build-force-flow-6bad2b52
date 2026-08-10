-- Create function to impersonate user (admin only)
-- This allows admins to login as any user for testing/support purposes

CREATE OR REPLACE FUNCTION public.impersonate_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_admin_id UUID;
  target_email TEXT;
  audit_log_record JSON;
BEGIN
  -- Get current user (must be admin)
  current_admin_id := auth.uid();

  -- Verify current user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_security_profiles usp
    JOIN public.security_profiles sp ON usp.profile_id = sp.id
    WHERE usp.user_id = current_admin_id
      AND sp.name = 'System Administrator'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only System Administrators can impersonate users'
    );
  END IF;

  -- Get target user email
  SELECT email INTO target_email
  FROM public.users
  WHERE id = target_user_id;

  IF target_email IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Target user not found'
    );
  END IF;

  -- Log impersonation for audit trail
  INSERT INTO public.audit_logs (
    action,
    actor_user_id,
    target_user_id,
    details,
    created_at
  ) VALUES (
    'admin_impersonate_user',
    current_admin_id,
    target_user_id,
    json_build_object(
      'admin_email', (SELECT email FROM public.users WHERE id = current_admin_id),
      'target_email', target_email,
      'timestamp', NOW()
    ),
    NOW()
  );

  -- Return success with target user info
  RETURN json_build_object(
    'success', true,
    'target_user_id', target_user_id,
    'target_email', target_email,
    'message', 'Impersonation allowed - use Supabase session management to login'
  );
END;
$function$;

-- Grant permission to authenticated users (will check admin status inside function)
GRANT EXECUTE ON FUNCTION public.impersonate_user(UUID) TO authenticated;

-- Create audit_logs table if it doesn't exist (for tracking impersonations)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for audit logging
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Enable RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_security_profiles usp
    JOIN public.security_profiles sp ON usp.profile_id = sp.id
    WHERE usp.user_id = auth.uid()
      AND sp.name = 'System Administrator'
  )
);
