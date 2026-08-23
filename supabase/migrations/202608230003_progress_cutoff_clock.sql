-- Use the wall clock for reset/restore cutoffs, including when operations share a transaction.

create or replace function public.reset_progress_with_password(p_learner_id uuid, p_app_key text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_expected text; v_snapshot jsonb;
begin
  if not public.is_learner_device(p_learner_id) then raise exception 'not allowed'; end if;
  select reset_password into v_expected from public.learner_settings where learner_id = p_learner_id;
  if v_expected is null or v_expected <> coalesce(p_password, '') then raise exception 'invalid reset password'; end if;
  v_snapshot := public.get_consolidated_progress(p_learner_id, p_app_key);
  perform public.save_progress_backup(p_learner_id, p_app_key, v_snapshot, 'before_reset');
  insert into public.learner_app_controls (learner_id, app_key, base_snapshot, cutoff_at, updated_at)
  values (p_learner_id, p_app_key, public.empty_progress_snapshot(), clock_timestamp(), now())
  on conflict (learner_id, app_key) do update set base_snapshot = excluded.base_snapshot, cutoff_at = excluded.cutoff_at, updated_at = now();
  return public.empty_progress_snapshot();
end;
$$;

create or replace function public.parent_reset_progress(p_learner_id uuid, p_app_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snapshot jsonb;
begin
  if not public.is_learner_parent(p_learner_id) then raise exception 'not allowed'; end if;
  v_snapshot := public.get_consolidated_progress(p_learner_id, p_app_key);
  perform public.save_progress_backup(p_learner_id, p_app_key, v_snapshot, 'before_reset');
  insert into public.learner_app_controls (learner_id, app_key, base_snapshot, cutoff_at, updated_at)
  values (p_learner_id, p_app_key, public.empty_progress_snapshot(), clock_timestamp(), now())
  on conflict (learner_id, app_key) do update set base_snapshot = excluded.base_snapshot, cutoff_at = excluded.cutoff_at, updated_at = now();
  return public.empty_progress_snapshot();
end;
$$;

create or replace function public.restore_progress_backup(p_backup_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_backup public.progress_backups%rowtype; v_current jsonb;
begin
  select * into v_backup from public.progress_backups where id = p_backup_id;
  if v_backup.id is null or not public.is_learner_parent(v_backup.learner_id) then raise exception 'not allowed'; end if;
  v_current := public.get_consolidated_progress(v_backup.learner_id, v_backup.app_key);
  perform public.save_progress_backup(v_backup.learner_id, v_backup.app_key, v_current, 'before_restore');
  insert into public.learner_app_controls (learner_id, app_key, base_snapshot, cutoff_at, updated_at)
  values (v_backup.learner_id, v_backup.app_key, v_backup.snapshot, clock_timestamp(), now())
  on conflict (learner_id, app_key) do update set base_snapshot = excluded.base_snapshot, cutoff_at = excluded.cutoff_at, updated_at = now();
  return v_backup.snapshot;
end;
$$;
