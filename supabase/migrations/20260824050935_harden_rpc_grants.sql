-- Supabase creates direct defaults for API roles. Keep RPC access explicit.
revoke execute on function public.is_family_parent(uuid), public.is_learner_parent(uuid),
  public.is_learner_device(uuid), public.ensure_parent_setup(text),
  public.create_pairing_code(uuid), public.claim_pairing_code(text, text, jsonb),
  public.empty_progress_snapshot(), public.merge_progress_snapshots(jsonb, jsonb),
  public.get_consolidated_progress(uuid, text), public.get_or_create_reset_password(uuid),
  public.set_reset_password(uuid, text), public.save_progress_backup(uuid, text, jsonb, text),
  public.reset_progress_with_password(uuid, text, text), public.parent_reset_progress(uuid, text),
  public.restore_progress_backup(bigint), public.touch_learner_device(uuid, text),
  public.unlink_learner_device(uuid, uuid) from anon;

drop policy if exists "family reads linked devices" on public.learner_devices;
create policy "family reads linked devices" on public.learner_devices for select to authenticated
using (device_user_id = (select auth.uid()) or public.is_learner_parent(learner_id));

drop policy if exists "family reads learning events" on public.learning_events;
create policy "family reads learning events" on public.learning_events for select to authenticated
using (public.is_learner_parent(learner_id) or device_user_id = (select auth.uid()));

drop policy if exists "learner devices create learning events" on public.learning_events;
create policy "learner devices create learning events" on public.learning_events for insert to authenticated
with check (device_user_id = (select auth.uid()) and public.is_learner_device(learner_id));
