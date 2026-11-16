-- ============ Helper functions ============
CREATE OR REPLACE FUNCTION public.is_active_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = _uid AND u.is_active = true)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_master_data(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.can_access_object(_uid, 'module_master_data', 'edit')
    OR public.can_access_object(_uid, 'module_master_data', 'create')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_notify_user(_uid uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _target IS NOT NULL AND (
    _target = _uid
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_target, 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = _uid AND u.reporting_manager_id = _target)
    OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(_uid) h WHERE h.user_id = _target)
    OR EXISTS (
      SELECT 1 FROM public.user_security_profiles usp
      JOIN public.security_profiles sp ON sp.id = usp.profile_id
      WHERE usp.user_id = _target AND sp.name IN ('Admin', 'Administrator', 'System Administrator')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_procurement_order(_uid uuid, _order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.can_access_object(_uid, 'module_procurement', 'read')
    OR public.can_access_object(_uid, 'module_procurement', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.procurement_orders o
      WHERE o.id = _order_id AND (
        o.created_by = _uid
        OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(_uid) h WHERE h.user_id = o.created_by)
        OR (o.site_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = o.site_id AND sa.user_id = _uid))
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_pm_project(_uid uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _project_id IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = _project_id AND (p.created_by = _uid OR p.owner_id = _uid))
    OR EXISTS (SELECT 1 FROM public.pm_project_members m WHERE m.project_id = _project_id AND m.user_id = _uid)
    OR EXISTS (SELECT 1 FROM public.pm_project_resources r WHERE r.project_id = _project_id AND r.user_id = _uid)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pm_project(_uid uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _project_id IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = _project_id AND (p.created_by = _uid OR p.owner_id = _uid))
    OR EXISTS (SELECT 1 FROM public.pm_project_members m
               WHERE m.project_id = _project_id AND m.user_id = _uid
                 AND m.role IN ('owner'::public.pm_member_role, 'manager'::public.pm_member_role))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_pm_task(_uid uuid, _task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pm_tasks t
    WHERE t.id = _task_id AND (
      t.created_by = _uid OR t.assignee_id = _uid OR t.reporter_id = _uid OR t.collaborator_id = _uid
      OR public.can_access_pm_project(_uid, t.project_id)
      OR EXISTS (SELECT 1 FROM public.pm_task_collaborators c WHERE c.task_id = t.id AND c.user_id = _uid)
    )
  ) OR public.has_role(_uid, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_pm_template(_uid uuid, _template_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.can_access_object(_uid, 'module_projects', 'read')
    OR EXISTS (SELECT 1 FROM public.pm_templates t WHERE t.id = _template_id AND t.created_by = _uid)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pm_template(_uid uuid, _template_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.can_access_object(_uid, 'module_projects', 'edit')
    OR EXISTS (SELECT 1 FROM public.pm_templates t WHERE t.id = _template_id AND t.created_by = _uid)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_customer_document_file(_uid uuid, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _uid = auth.uid() AND EXISTS (
    SELECT 1 FROM public.customer_documents d
    WHERE d.file_url = _name AND (
      d.uploaded_by = _uid
      OR (d.customer_id IS NOT NULL AND public.can_access_customer(d.customer_id))
      OR (d.lead_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.leads l WHERE l.id = d.lead_id AND public.can_access_crm_record(l.owner_id, l.created_by)))
      OR (d.opportunity_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.customer_opportunities o
            WHERE o.id = d.opportunity_id
              AND (public.can_access_crm_record(o.owner_id, o.created_by)
                   OR (o.customer_id IS NOT NULL AND public.can_access_customer(o.customer_id)))))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_pm_attachment_file(_uid uuid, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.pm_task_attachments a
            WHERE a.file_url = _name AND (a.uploaded_by = _uid OR public.can_access_pm_task(_uid, a.task_id)))
    OR EXISTS (SELECT 1 FROM public.pm_template_attachments a
            WHERE a.file_url = _name AND (a.uploaded_by = _uid OR public.can_access_pm_template(_uid, a.template_id)))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_site_attachment_file(_uid uuid, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_sites p
    JOIN public.site_assignments sa ON sa.site_id = p.id AND sa.user_id = _uid
    WHERE p.attachment_urls::text LIKE '%' || _name || '%'
  )
$$;

-- Stamp the creator on insert when the app leaves it empty
CREATE OR REPLACE FUNCTION public.stamp_created_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_created_by ON public.events;
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
DROP TRIGGER IF EXISTS trg_stamp_created_by ON public.procurement_orders;
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT ON public.procurement_orders FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
DROP TRIGGER IF EXISTS trg_stamp_created_by ON public.procurement_vendor_feedback;
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT ON public.procurement_vendor_feedback FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
DROP TRIGGER IF EXISTS trg_stamp_created_by ON public.project_sites;
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT ON public.project_sites FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();

-- ============ Org-wide settings: readable by active team members only ============
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('accrual_config','Authenticated can view accrual_config'),
    ('app_configuration','app_configuration read for authenticated'),
    ('attendance_policy','Authenticated users can view attendance_policy'),
    ('auto_end_day_policy','Authenticated can view auto_end_day_policy'),
    ('beat_allowances','Anyone can view beat allowances'),
    ('expense_approval_rules','Authenticated can view rules'),
    ('expense_approval_workflows','Authenticated can view workflows'),
    ('leave_policy','Authenticated users can view leave_policy'),
    ('leave_type_policy_override','Authenticated can view leave_type_policy_override'),
    ('regularization_policy','Authenticated can view regularization_policy'),
    ('ta_rate_history','ta_rate_history read authenticated'),
    ('permission_definitions','Authenticated can view permission_definitions'),
    ('security_profiles','Anyone can view security profiles'),
    ('roles','Anyone can view roles')
  ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()))',
                   'Active members can view ' || r.tbl, r.tbl);
  END LOOP;
END $$;

-- role_permissions / permissions: only admins and security managers
DROP POLICY IF EXISTS "Anyone can view role_permissions" ON public.role_permissions;
CREATE POLICY "Security managers can view role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_security_management_access(auth.uid(), 'read') OR public.has_security_management_access(auth.uid(), 'edit'));

DROP POLICY IF EXISTS "Anyone can view permissions" ON public.permissions;
CREATE POLICY "Security managers can view permissions" ON public.permissions
  FOR SELECT TO authenticated
  USING (public.has_security_management_access(auth.uid(), 'read') OR public.has_security_management_access(auth.uid(), 'edit'));

-- profile_object_permissions: own profile's permissions, or security/user managers
DROP POLICY IF EXISTS "Anyone can view permissions" ON public.profile_object_permissions;
CREATE POLICY "Users view own profile permissions or managers view all" ON public.profile_object_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_security_profiles usp
            WHERE usp.profile_id = profile_object_permissions.profile_id AND usp.user_id = auth.uid())
    OR public.has_security_management_access(auth.uid(), 'read')
    OR public.has_security_management_access(auth.uid(), 'edit')
    OR public.can_access_object(auth.uid(), 'users', 'edit')
  );

-- ============ Expense groups / overrides ============
DROP POLICY IF EXISTS "expense_groups read authenticated" ON public.expense_groups;
CREATE POLICY "Members and expense managers view expense_groups" ON public.expense_groups
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'field_admin_expense_mgmt', 'read')
    OR EXISTS (SELECT 1 FROM public.expense_group_members m WHERE m.group_id = expense_groups.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "expense_group_members read authenticated" ON public.expense_group_members;
CREATE POLICY "Own, team and expense managers view expense_group_members" ON public.expense_group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'field_admin_expense_mgmt', 'read')
    OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = expense_group_members.user_id)
  );

DROP POLICY IF EXISTS "expense_overrides read authenticated" ON public.expense_overrides;
CREATE POLICY "Own and expense managers view expense_overrides" ON public.expense_overrides
  FOR SELECT TO authenticated
  USING (
    ref_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'field_admin_expense_mgmt', 'read')
    OR (ref_type = 'team' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.reporting_manager_id = expense_overrides.ref_id))
  );

-- ============ Master lists: read for active members, write for master-data managers ============
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('master_currencies'), ('master_payment_terms'), ('master_uom'), ('master_lead_statuses'),
    ('master_event_types'), ('master_lead_sources'), ('opportunity_stages'), ('opportunity_types')
  ) AS t(tbl)
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()))',
                   'Active members can view ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_master_data(auth.uid()))',
                   'Master data managers can insert ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_master_data(auth.uid())) WITH CHECK (public.can_manage_master_data(auth.uid()))',
                   'Master data managers can update ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_master_data(auth.uid()))',
                   'Master data managers can delete ' || r.tbl, r.tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth write currencies" ON public.master_currencies;
DROP POLICY IF EXISTS "auth read currencies" ON public.master_currencies;
DROP POLICY IF EXISTS "auth write pt" ON public.master_payment_terms;
DROP POLICY IF EXISTS "auth read pt" ON public.master_payment_terms;
DROP POLICY IF EXISTS "Authenticated can delete UOMs" ON public.master_uom;
DROP POLICY IF EXISTS "Authenticated can insert UOMs" ON public.master_uom;
DROP POLICY IF EXISTS "Authenticated can view UOMs" ON public.master_uom;
DROP POLICY IF EXISTS "Authenticated can update UOMs" ON public.master_uom;
DROP POLICY IF EXISTS "Authenticated can manage master_lead_statuses" ON public.master_lead_statuses;
DROP POLICY IF EXISTS "Authenticated can manage master_event_types" ON public.master_event_types;
DROP POLICY IF EXISTS "Authenticated can manage master_lead_sources" ON public.master_lead_sources;
DROP POLICY IF EXISTS "Authenticated can manage opportunity_stages" ON public.opportunity_stages;
DROP POLICY IF EXISTS "Authenticated can manage opportunity_types" ON public.opportunity_types;

-- ============ CRM: events, contact roles, opportunity milestones, quotes ============
DROP POLICY IF EXISTS "Authenticated can manage events" ON public.events;
CREATE POLICY "Owners, team and event users view events" ON public.events
  FOR SELECT TO authenticated
  USING (
    public.can_access_crm_record(owner_id, created_by)
    OR public.can_access_object(auth.uid(), 'module_events', 'read')
    OR public.can_access_object(auth.uid(), 'module_leads', 'read')
  );
CREATE POLICY "Users create own events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Owners, managers and admins update events" ON public.events
  FOR UPDATE TO authenticated
  USING (public.can_access_crm_record(owner_id, created_by) OR public.can_access_object(auth.uid(), 'module_events', 'edit'))
  WITH CHECK (public.can_access_crm_record(owner_id, created_by) OR public.can_access_object(auth.uid(), 'module_events', 'edit'));
CREATE POLICY "Owners, managers and admins delete events" ON public.events
  FOR DELETE TO authenticated
  USING (public.can_access_crm_record(owner_id, created_by) OR public.can_access_object(auth.uid(), 'module_events', 'delete'));

DROP POLICY IF EXISTS "Authenticated can manage contact roles" ON public.customer_contact_roles;
CREATE POLICY "Users with customer access manage contact roles" ON public.customer_contact_roles
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND customer_id IS NOT NULL AND public.can_access_customer(customer_id))
  WITH CHECK (auth.uid() IS NOT NULL AND customer_id IS NOT NULL AND public.can_access_customer(customer_id));

DROP POLICY IF EXISTS "Authenticated can manage opportunity_milestones" ON public.opportunity_milestones;
CREATE POLICY "Users with opportunity access manage milestones" ON public.opportunity_milestones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_milestones.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_milestones.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));

DROP POLICY IF EXISTS "auth write quotes" ON public.opportunity_quotes;
CREATE POLICY "Users with opportunity access insert quotes" ON public.opportunity_quotes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_quotes.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));
CREATE POLICY "Users with opportunity access update quotes" ON public.opportunity_quotes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_quotes.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_quotes.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));
CREATE POLICY "Users with opportunity access delete quotes" ON public.opportunity_quotes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customer_opportunities o
                 WHERE o.id = opportunity_quotes.opportunity_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));

DROP POLICY IF EXISTS "auth write quote items" ON public.opportunity_quote_items;
CREATE POLICY "Users with opportunity access insert quote items" ON public.opportunity_quote_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.opportunity_quotes q JOIN public.customer_opportunities o ON o.id = q.opportunity_id
                 WHERE q.id = opportunity_quote_items.quote_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));
CREATE POLICY "Users with opportunity access update quote items" ON public.opportunity_quote_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.opportunity_quotes q JOIN public.customer_opportunities o ON o.id = q.opportunity_id
                 WHERE q.id = opportunity_quote_items.quote_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.opportunity_quotes q JOIN public.customer_opportunities o ON o.id = q.opportunity_id
                 WHERE q.id = opportunity_quote_items.quote_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));
CREATE POLICY "Users with opportunity access delete quote items" ON public.opportunity_quote_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.opportunity_quotes q JOIN public.customer_opportunities o ON o.id = q.opportunity_id
                 WHERE q.id = opportunity_quote_items.quote_id
                   AND (public.can_access_crm_record(o.owner_id, o.created_by) OR public.can_access_customer(o.customer_id))));

-- ============ Notifications ============
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Users notify themselves, their managers, team or admins" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_notify_user(auth.uid(), user_id));

-- ============ Procurement ============
DROP POLICY IF EXISTS "Authenticated can read procurement" ON public.procurement_orders;
CREATE POLICY "Related users view procurement orders" ON public.procurement_orders
  FOR SELECT TO authenticated
  USING (public.can_read_procurement_order(auth.uid(), id));
DROP POLICY IF EXISTS "Users create procurement" ON public.procurement_orders;
CREATE POLICY "Users create own procurement orders" ON public.procurement_orders
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated can read procurement items" ON public.procurement_items;
CREATE POLICY "Related users view procurement items" ON public.procurement_items
  FOR SELECT TO authenticated
  USING (public.can_read_procurement_order(auth.uid(), procurement_id));

DROP POLICY IF EXISTS "Authenticated can view vendors" ON public.vendors;
CREATE POLICY "Procurement users view vendors" ON public.vendors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
    OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
    OR EXISTS (SELECT 1 FROM public.procurement_orders o
               WHERE (o.vendor_id = vendors.id OR vendors.id = ANY (o.vendor_ids))
                 AND public.can_read_procurement_order(auth.uid(), o.id))
  );

DROP POLICY IF EXISTS "Authenticated can insert vendor feedback" ON public.procurement_vendor_feedback;
DROP POLICY IF EXISTS "Authenticated can update vendor feedback" ON public.procurement_vendor_feedback;
DROP POLICY IF EXISTS "Authenticated can delete vendor feedback" ON public.procurement_vendor_feedback;
CREATE POLICY "Users add own vendor feedback" ON public.procurement_vendor_feedback
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authors and procurement managers update vendor feedback" ON public.procurement_vendor_feedback
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));
CREATE POLICY "Authors and procurement managers delete vendor feedback" ON public.procurement_vendor_feedback
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

-- ============ Sites ============
DROP POLICY IF EXISTS "Authenticated can insert project_sites" ON public.project_sites;
CREATE POLICY "Project managers create sites" ON public.project_sites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'module_projects', 'create')
    OR public.can_access_object(auth.uid(), 'module_projects', 'edit')
  );

DROP POLICY IF EXISTS "Authenticated can insert site_assignments" ON public.site_assignments;
CREATE POLICY "Project managers assign users to sites" ON public.site_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'module_projects', 'create')
    OR public.can_access_object(auth.uid(), 'module_projects', 'edit')
  );

DROP POLICY IF EXISTS "Authenticated can view site_milestones" ON public.site_milestones;
CREATE POLICY "Assigned users and project viewers see site_milestones" ON public.site_milestones
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'module_projects', 'read')
    OR EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = site_milestones.site_id AND sa.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can view milestone comments" ON public.site_milestone_comments;
CREATE POLICY "Users who can see the milestone see its comments" ON public.site_milestone_comments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'module_projects', 'read')
    OR EXISTS (SELECT 1 FROM public.site_milestones m
               JOIN public.site_assignments sa ON sa.site_id = m.site_id
               WHERE m.id = site_milestone_comments.milestone_id AND sa.user_id = auth.uid())
  );

-- ============ Project management (pm_*) ============
DROP POLICY IF EXISTS "Authenticated can view pm_projects" ON public.pm_projects;
DROP POLICY IF EXISTS "Authenticated can insert pm_projects" ON public.pm_projects;
CREATE POLICY "Project members view pm_projects" ON public.pm_projects
  FOR SELECT TO authenticated USING (public.can_access_pm_project(auth.uid(), id));
CREATE POLICY "Users create own pm_projects" ON public.pm_projects
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('pm_milestones'), ('pm_sections'), ('pm_sprints'), ('pm_risks')) AS t(tbl)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can view ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can insert ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can update ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can delete ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_pm_project(auth.uid(), project_id))', 'Project members view ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_access_pm_project(auth.uid(), project_id))', 'Project members insert ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_access_pm_project(auth.uid(), project_id)) WITH CHECK (public.can_access_pm_project(auth.uid(), project_id))', 'Project members update ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_access_pm_project(auth.uid(), project_id))', 'Project members delete ' || r.tbl, r.tbl);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Project members delete pm_milestones" ON public.pm_milestones;
DROP POLICY IF EXISTS "Project members delete pm_risks" ON public.pm_risks;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('pm_project_members'), ('pm_project_resources')) AS t(tbl)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can view ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can insert ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can update ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can delete ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_pm_project(auth.uid(), project_id))', 'Project members view ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_pm_project(auth.uid(), project_id))', 'Project managers insert ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_pm_project(auth.uid(), project_id))', 'Project managers delete ' || r.tbl, r.tbl);
  END LOOP;
END $$;
CREATE POLICY "Project managers update pm_project_resources" ON public.pm_project_resources
  FOR UPDATE TO authenticated
  USING (public.can_manage_pm_project(auth.uid(), project_id))
  WITH CHECK (public.can_manage_pm_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "Authenticated can view pm_tasks" ON public.pm_tasks;
DROP POLICY IF EXISTS "Authenticated can insert pm_tasks" ON public.pm_tasks;
DROP POLICY IF EXISTS "Authenticated can update pm_tasks" ON public.pm_tasks;
DROP POLICY IF EXISTS "Authenticated can delete pm_tasks" ON public.pm_tasks;
CREATE POLICY "Task participants view pm_tasks" ON public.pm_tasks
  FOR SELECT TO authenticated USING (public.can_access_pm_task(auth.uid(), id));
CREATE POLICY "Project members create pm_tasks" ON public.pm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (project_id IS NULL OR public.can_access_pm_project(auth.uid(), project_id)));
CREATE POLICY "Task participants update pm_tasks" ON public.pm_tasks
  FOR UPDATE TO authenticated
  USING (public.can_access_pm_task(auth.uid(), id))
  WITH CHECK (project_id IS NULL OR public.can_access_pm_project(auth.uid(), project_id) OR created_by = auth.uid() OR assignee_id = auth.uid());
CREATE POLICY "Task participants delete pm_tasks" ON public.pm_tasks
  FOR DELETE TO authenticated USING (public.can_access_pm_task(auth.uid(), id));

DROP POLICY IF EXISTS "Authenticated can view pm_task_comments" ON public.pm_task_comments;
DROP POLICY IF EXISTS "Authenticated can insert pm_task_comments" ON public.pm_task_comments;
CREATE POLICY "Task participants view pm_task_comments" ON public.pm_task_comments
  FOR SELECT TO authenticated USING (public.can_access_pm_task(auth.uid(), task_id));
CREATE POLICY "Task participants add own pm_task_comments" ON public.pm_task_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.can_access_pm_task(auth.uid(), task_id));

DROP POLICY IF EXISTS "Authenticated can view pm_task_collaborators" ON public.pm_task_collaborators;
DROP POLICY IF EXISTS "Authenticated can insert pm_task_collaborators" ON public.pm_task_collaborators;
DROP POLICY IF EXISTS "Authenticated can delete pm_task_collaborators" ON public.pm_task_collaborators;
CREATE POLICY "Task participants view pm_task_collaborators" ON public.pm_task_collaborators
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_access_pm_task(auth.uid(), task_id));
CREATE POLICY "Task participants add pm_task_collaborators" ON public.pm_task_collaborators
  FOR INSERT TO authenticated WITH CHECK (public.can_access_pm_task(auth.uid(), task_id));
CREATE POLICY "Task participants remove pm_task_collaborators" ON public.pm_task_collaborators
  FOR DELETE TO authenticated USING (public.can_access_pm_task(auth.uid(), task_id));

DROP POLICY IF EXISTS "Authenticated can view pm_task_dependencies" ON public.pm_task_dependencies;
DROP POLICY IF EXISTS "Authenticated can insert pm_task_dependencies" ON public.pm_task_dependencies;
DROP POLICY IF EXISTS "Authenticated can delete pm_task_dependencies" ON public.pm_task_dependencies;
CREATE POLICY "Task participants view pm_task_dependencies" ON public.pm_task_dependencies
  FOR SELECT TO authenticated USING (public.can_access_pm_task(auth.uid(), task_id));
CREATE POLICY "Task participants add pm_task_dependencies" ON public.pm_task_dependencies
  FOR INSERT TO authenticated WITH CHECK (public.can_access_pm_task(auth.uid(), task_id) AND public.can_access_pm_task(auth.uid(), depends_on_task_id));
CREATE POLICY "Task participants remove pm_task_dependencies" ON public.pm_task_dependencies
  FOR DELETE TO authenticated USING (public.can_access_pm_task(auth.uid(), task_id));

DROP POLICY IF EXISTS "Authenticated can view pm_time_logs" ON public.pm_time_logs;
CREATE POLICY "Own and task participants view pm_time_logs" ON public.pm_time_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_access_pm_task(auth.uid(), task_id));

DROP POLICY IF EXISTS "Authenticated can view pm_task_templates" ON public.pm_task_templates;
DROP POLICY IF EXISTS "Authenticated can insert pm_task_templates" ON public.pm_task_templates;
CREATE POLICY "Creators and project users view pm_task_templates" ON public.pm_task_templates
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.can_access_object(auth.uid(), 'module_projects', 'read'));
CREATE POLICY "Users create own pm_task_templates" ON public.pm_task_templates
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated can view pm_templates" ON public.pm_templates;
DROP POLICY IF EXISTS "Authenticated can insert pm_templates" ON public.pm_templates;
CREATE POLICY "Creators and project users view pm_templates" ON public.pm_templates
  FOR SELECT TO authenticated USING (public.can_access_pm_template(auth.uid(), id));
CREATE POLICY "Users create own pm_templates" ON public.pm_templates
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('pm_template_sections'), ('pm_template_tasks'), ('pm_template_dependencies'), ('pm_template_attachments')) AS t(tbl)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can view ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can insert ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can update ' || r.tbl, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can delete ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_pm_template(auth.uid(), template_id))', 'Template viewers view ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_pm_template(auth.uid(), template_id))', 'Template editors insert ' || r.tbl, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_pm_template(auth.uid(), template_id))', 'Template editors delete ' || r.tbl, r.tbl);
  END LOOP;
END $$;
CREATE POLICY "Template editors update pm_template_sections" ON public.pm_template_sections
  FOR UPDATE TO authenticated
  USING (public.can_manage_pm_template(auth.uid(), template_id))
  WITH CHECK (public.can_manage_pm_template(auth.uid(), template_id));
CREATE POLICY "Template editors update pm_template_tasks" ON public.pm_template_tasks
  FOR UPDATE TO authenticated
  USING (public.can_manage_pm_template(auth.uid(), template_id))
  WITH CHECK (public.can_manage_pm_template(auth.uid(), template_id));

-- ============ Storage ============
DROP POLICY IF EXISTS "Anyone can read the company logo file" ON storage.objects;

DROP POLICY IF EXISTS "Owners admins and related users read pm attachments" ON storage.objects;
CREATE POLICY "Owners admins and related users read pm attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pm-attachments' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_read_pm_attachment_file(auth.uid(), name)
  ));

DROP POLICY IF EXISTS "Owners admins and related users read customer documents" ON storage.objects;
CREATE POLICY "Owners admins and related users read customer documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'customer-documents' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_read_customer_document_file(auth.uid(), name)
  ));

DROP POLICY IF EXISTS "Owners admins and related users read site attachments" ON storage.objects;
CREATE POLICY "Owners admins and related users read site attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'site-attachments' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_read_site_attachment_file(auth.uid(), name)
  ));

-- Helpers are only needed by signed-in users' access rules
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'is_active_member(uuid)', 'can_manage_master_data(uuid)', 'can_notify_user(uuid, uuid)',
    'can_read_procurement_order(uuid, uuid)', 'can_access_pm_project(uuid, uuid)', 'can_manage_pm_project(uuid, uuid)',
    'can_access_pm_task(uuid, uuid)', 'can_access_pm_template(uuid, uuid)', 'can_manage_pm_template(uuid, uuid)',
    'can_read_customer_document_file(uuid, text)', 'can_read_pm_attachment_file(uuid, text)', 'can_read_site_attachment_file(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;