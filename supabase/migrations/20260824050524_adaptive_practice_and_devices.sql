-- Per-question adaptive practice and parent-managed device links.

alter table public.learner_devices
  add column if not exists device_name text,
  add column if not exists last_seen_at timestamptz not null default now();

update public.learner_devices
set device_name = coalesce(device_name, 'Gerät'),
    last_seen_at = coalesce(last_seen_at, linked_at);

alter table public.learner_devices
  add constraint learner_devices_device_name_length
  check (device_name is null or char_length(device_name) between 1 and 80) not valid;

alter table public.learner_devices validate constraint learner_devices_device_name_length;

create index if not exists learner_devices_learner_last_seen_idx
  on public.learner_devices (learner_id, last_seen_at desc);

alter table public.learner_app_controls
  alter column base_snapshot set default '{"stars":0,"streak":0,"bestStreak":0,"totalAttempts":0,"topics":{},"items":{}}'::jsonb;

create or replace function public.empty_progress_snapshot()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"stars":0,"streak":0,"bestStreak":0,"totalAttempts":0,"topics":{},"items":{}}'::jsonb;
$$;

create or replace function public.merge_progress_snapshots(p_left jsonb, p_right jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_left jsonb := coalesce(p_left, public.empty_progress_snapshot());
  v_right jsonb := coalesce(p_right, public.empty_progress_snapshot());
  v_topics jsonb := coalesce(v_left -> 'topics', '{}'::jsonb);
  v_items jsonb := coalesce(v_left -> 'items', '{}'::jsonb);
  v_key text;
  v_stat jsonb;
  v_existing jsonb;
begin
  if jsonb_typeof(v_left) <> 'object' or jsonb_typeof(v_right) <> 'object' then
    raise exception 'invalid progress snapshot';
  end if;

  for v_key, v_stat in select key, value from jsonb_each(coalesce(v_right -> 'topics', '{}'::jsonb)) loop
    v_existing := coalesce(v_topics -> v_key, '{"attempts":0,"correct":0}'::jsonb);
    v_topics := jsonb_set(v_topics, array[v_key], jsonb_build_object(
      'attempts', coalesce((v_existing ->> 'attempts')::int, 0) + coalesce((v_stat ->> 'attempts')::int, 0),
      'correct', coalesce((v_existing ->> 'correct')::int, 0) + coalesce((v_stat ->> 'correct')::int, 0)
    ), true);
  end loop;

  for v_key, v_stat in select key, value from jsonb_each(coalesce(v_right -> 'items', '{}'::jsonb)) loop
    v_existing := coalesce(v_items -> v_key, '{"attempts":0,"correct":0}'::jsonb);
    v_items := jsonb_set(v_items, array[v_key], jsonb_build_object(
      'attempts', coalesce((v_existing ->> 'attempts')::int, 0) + coalesce((v_stat ->> 'attempts')::int, 0),
      'correct', coalesce((v_existing ->> 'correct')::int, 0) + coalesce((v_stat ->> 'correct')::int, 0)
    ), true);
  end loop;

  return jsonb_build_object(
    'stars', coalesce((v_left ->> 'stars')::int, 0) + coalesce((v_right ->> 'stars')::int, 0),
    'streak', greatest(coalesce((v_left ->> 'streak')::int, 0), coalesce((v_right ->> 'streak')::int, 0)),
    'bestStreak', greatest(coalesce((v_left ->> 'bestStreak')::int, 0), coalesce((v_right ->> 'bestStreak')::int, 0)),
    'totalAttempts', coalesce((v_left ->> 'totalAttempts')::int, 0) + coalesce((v_right ->> 'totalAttempts')::int, 0),
    'topics', v_topics,
    'items', v_items
  );
end;
$$;

create or replace function public.get_consolidated_progress(p_learner_id uuid, p_app_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb := public.empty_progress_snapshot();
  v_cutoff timestamptz := '1970-01-01 00:00:00+00';
  v_snapshot jsonb;
  v_event record;
  v_topics jsonb;
  v_items jsonb;
  v_stat jsonb;
  v_item_stat jsonb;
  v_streak int;
  v_best int;
begin
  if not (public.is_learner_parent(p_learner_id) or public.is_learner_device(p_learner_id)) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.learning_apps where app_key = p_app_key and active) then
    raise exception 'unknown learning app';
  end if;

  select base_snapshot, cutoff_at into v_result, v_cutoff
  from public.learner_app_controls
  where learner_id = p_learner_id and app_key = p_app_key;
  v_result := coalesce(v_result, public.empty_progress_snapshot());
  v_cutoff := coalesce(v_cutoff, '1970-01-01 00:00:00+00');

  for v_snapshot in
    select snapshot from public.legacy_progress
    where learner_id = p_learner_id and app_key = p_app_key and imported_at > v_cutoff
    order by imported_at
  loop
    v_result := public.merge_progress_snapshots(v_result, v_snapshot);
  end loop;

  for v_event in
    select item_key, topic, score, reward_points from public.learning_events
    where learner_id = p_learner_id and app_key = p_app_key and received_at > v_cutoff
    order by occurred_at, id
  loop
    v_topics := coalesce(v_result -> 'topics', '{}'::jsonb);
    v_stat := coalesce(v_topics -> v_event.topic, '{"attempts":0,"correct":0}'::jsonb);
    v_topics := jsonb_set(v_topics, array[v_event.topic], jsonb_build_object(
      'attempts', coalesce((v_stat ->> 'attempts')::int, 0) + 1,
      'correct', coalesce((v_stat ->> 'correct')::int, 0) + case when v_event.score >= 1 then 1 else 0 end
    ), true);

    v_items := coalesce(v_result -> 'items', '{}'::jsonb);
    v_item_stat := coalesce(v_items -> v_event.item_key, '{"attempts":0,"correct":0}'::jsonb);
    v_items := jsonb_set(v_items, array[v_event.item_key], jsonb_build_object(
      'attempts', coalesce((v_item_stat ->> 'attempts')::int, 0) + 1,
      'correct', coalesce((v_item_stat ->> 'correct')::int, 0) + case when v_event.score >= 1 then 1 else 0 end
    ), true);

    v_streak := case when v_event.score >= 1 then coalesce((v_result ->> 'streak')::int, 0) + 1 else 0 end;
    v_best := greatest(coalesce((v_result ->> 'bestStreak')::int, 0), v_streak);
    v_result := jsonb_build_object(
      'stars', coalesce((v_result ->> 'stars')::int, 0) + v_event.reward_points,
      'streak', v_streak,
      'bestStreak', v_best,
      'totalAttempts', coalesce((v_result ->> 'totalAttempts')::int, 0) + 1,
      'topics', v_topics,
      'items', v_items
    );
  end loop;
  return v_result || jsonb_build_object(
    'topics', coalesce(v_result -> 'topics', '{}'::jsonb),
    'items', coalesce(v_result -> 'items', '{}'::jsonb)
  );
end;
$$;

create or replace function public.touch_learner_device(p_learner_id uuid, p_device_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := left(coalesce(nullif(trim(p_device_name), ''), 'Gerät'), 80);
begin
  if not public.is_learner_device(p_learner_id) then raise exception 'not allowed'; end if;
  update public.learner_devices
  set device_name = v_name, last_seen_at = clock_timestamp()
  where learner_id = p_learner_id and device_user_id = auth.uid();
end;
$$;

create or replace function public.unlink_learner_device(p_learner_id uuid, p_device_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_learner_parent(p_learner_id) then raise exception 'not allowed'; end if;
  delete from public.learner_devices
  where learner_id = p_learner_id and device_user_id = p_device_user_id;
end;
$$;

revoke all on function public.touch_learner_device(uuid, text), public.unlink_learner_device(uuid, uuid) from public;
grant execute on function public.touch_learner_device(uuid, text), public.unlink_learner_device(uuid, uuid) to authenticated;
