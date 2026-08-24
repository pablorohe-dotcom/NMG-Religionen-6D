import { getSupabaseClient } from './supabase';

export type CloudState = 'unavailable' | 'connecting' | 'unlinked' | 'synced' | 'offline' | 'error';

export const CURRENT_LEARNING_APP = {
  key: 'nmg-religionen-pruefung-1',
  title: 'Weltreligionen · Prüfung 1',
  subject: 'NMG',
} as const;

export type CloudAttempt = {
  client_event_id: string;
  learner_id: string;
  app_key: string;
  item_key: string;
  topic: string;
  score: number;
  reward_points: number;
  occurred_at: string;
};

const QUEUE_KEY = 'davids-nmg-cloud-queue-v1';
let backupTransport: { url: string; key: string; token: string } | null = null;

function rememberBackupTransport(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key && token) backupTransport = { url, key, token };
}

function readQueue(): CloudAttempt[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveQueue(queue: CloudAttempt[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function ensureCloudSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) { rememberBackupTransport(data.session.access_token); return data.session.user; }
  const result = await supabase.auth.signInAnonymously();
  if (result.error) throw result.error;
  rememberBackupTransport(result.data.session?.access_token);
  return result.data.user;
}

export async function getLinkedLearner(): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const user = await ensureCloudSession();
  if (!user) return null;
  const { data, error } = await supabase
    .from('learner_devices')
    .select('learner_id, learners(display_name)')
    .eq('device_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const learner = Array.isArray(data.learners) ? data.learners[0] : data.learners;
  return { id: data.learner_id as string, name: (learner as { display_name?: string } | null)?.display_name ?? 'David' };
}

function describeDevice(): string {
  if (typeof navigator === 'undefined') return 'Unbekanntes Gerät';
  const agent = navigator.userAgent;
  const platform = /iPad/i.test(agent) ? 'iPad' : /iPhone/i.test(agent) ? 'iPhone' : /Windows/i.test(agent) ? 'Windows-PC' : /Macintosh|Mac OS/i.test(agent) ? 'Mac' : /Android/i.test(agent) ? 'Android-Gerät' : 'Gerät';
  const browser = /Edg\//i.test(agent) ? 'Edge' : /CriOS|Chrome\//i.test(agent) ? 'Chrome' : /Firefox\//i.test(agent) ? 'Firefox' : /Safari\//i.test(agent) ? 'Safari' : 'Browser';
  return `${platform} · ${browser}`;
}

export async function touchLinkedDevice(learnerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase || !navigator.onLine) return;
  const { error } = await supabase.rpc('touch_learner_device', {
    p_learner_id: learnerId,
    p_device_name: describeDevice(),
  });
  if (error) throw error;
}

export async function claimPairingCode(code: string, legacyProgress: unknown, appKey = CURRENT_LEARNING_APP.key) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Die Cloud-Verbindung ist noch nicht eingerichtet.');
  await ensureCloudSession();
  const { data, error } = await supabase.rpc('claim_pairing_code', {
    p_code: code.trim().toUpperCase(),
    p_app_key: appKey,
    p_legacy_progress: legacyProgress,
  });
  if (error) throw error;
  return data as string;
}

export function createAttempt(learnerId: string, itemKey: string, topic: string, isCorrect: boolean, appKey = CURRENT_LEARNING_APP.key): CloudAttempt {
  return {
    client_event_id: crypto.randomUUID(),
    learner_id: learnerId,
    app_key: appKey,
    item_key: itemKey,
    topic,
    score: isCorrect ? 1 : 0,
    reward_points: isCorrect ? 5 : 1,
    occurred_at: new Date().toISOString(),
  };
}

export async function queueAndSyncAttempt(attempt: CloudAttempt): Promise<CloudState> {
  const queue = [...readQueue(), attempt];
  saveQueue(queue);
  return flushAttemptQueue();
}

export async function flushAttemptQueue(): Promise<CloudState> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'unavailable';
  const queue = readQueue();
  if (!queue.length) return navigator.onLine ? 'synced' : 'offline';
  if (!navigator.onLine) return 'offline';

  const { error } = await supabase.from('learning_events').upsert(queue, { onConflict: 'client_event_id', ignoreDuplicates: true });
  if (error) return 'error';
  saveQueue([]);
  return 'synced';
}

export async function getConsolidatedProgress<T>(learnerId: string, appKey = CURRENT_LEARNING_APP.key): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Die Cloud-Verbindung ist noch nicht eingerichtet.');
  const { data, error } = await supabase.rpc('get_consolidated_progress', {
    p_learner_id: learnerId,
    p_app_key: appKey,
  });
  if (error) throw error;
  return data as T;
}

export async function saveProgressBackup(learnerId: string, snapshot: unknown, reason = 'autosave', appKey = CURRENT_LEARNING_APP.key) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.rpc('save_progress_backup', {
    p_learner_id: learnerId,
    p_app_key: appKey,
    p_snapshot: snapshot,
    p_reason: reason,
  });
  if (error) throw error;
}

export function saveProgressBackupOnClose(learnerId: string, appKey = CURRENT_LEARNING_APP.key) {
  if (!backupTransport || typeof fetch === 'undefined') return;
  const { url, key, token } = backupTransport;
  void fetch(`${url}/rest/v1/rpc/save_progress_backup`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_learner_id: learnerId, p_app_key: appKey, p_snapshot: null, p_reason: 'session_close' }),
  }).catch(() => undefined);
}

export async function resetProgressWithPassword<T>(learnerId: string, password: string, appKey = CURRENT_LEARNING_APP.key): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Die Cloud-Verbindung ist noch nicht eingerichtet.');
  const { data, error } = await supabase.rpc('reset_progress_with_password', {
    p_learner_id: learnerId,
    p_app_key: appKey,
    p_password: password,
  });
  if (error) throw error;
  return data as T;
}
