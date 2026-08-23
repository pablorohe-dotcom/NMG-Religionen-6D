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
  if (data.session?.user) return data.session.user;
  const result = await supabase.auth.signInAnonymously();
  if (result.error) throw result.error;
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
