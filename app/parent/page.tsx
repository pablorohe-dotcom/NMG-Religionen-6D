'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase';

type LearningEvent = { id: number; app_key: string; topic: string; score: number; reward_points: number; occurred_at: string };
type LegacySnapshot = {
  stars?: number;
  bestStreak?: number;
  totalAttempts?: number;
  topics?: Record<string, { attempts?: number; correct?: number }>;
};
type Learner = { id: string; display_name: string };
type LearningApp = { app_key: string; title: string; subject: string; grade_label: string | null; topic_labels: string[] };
type LegacyRow = { app_key: string; snapshot: LegacySnapshot };

const DEFAULT_APP_KEY = 'nmg-religionen-pruefung-1';

export default function ParentPage() {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [learner, setLearner] = useState<Learner | null>(null);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [legacy, setLegacy] = useState<LegacyRow[]>([]);
  const [learningApps, setLearningApps] = useState<LearningApp[]>([]);
  const [selectedAppKey, setSelectedAppKey] = useState(DEFAULT_APP_KEY);
  const [pairingCode, setPairingCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user || user.is_anonymous) {
      setSignedIn(false); setLoading(false); return;
    }

    setSignedIn(true);
    const setup = await supabase.rpc('ensure_parent_setup', { p_display_name: 'David' });
    if (setup.error) { setNotice(`Fehler: ${setup.error.message}`); setLoading(false); return; }
    const current = (setup.data?.[0] ?? null) as { learner_id: string; display_name: string } | null;
    if (!current) { setLoading(false); return; }
    const nextLearner = { id: current.learner_id, display_name: current.display_name };
    setLearner(nextLearner);

    const [eventResult, legacyResult, appsResult] = await Promise.all([
      supabase.from('learning_events').select('id,app_key,topic,score,reward_points,occurred_at').eq('learner_id', nextLearner.id).order('occurred_at', { ascending: true }),
      supabase.from('legacy_progress').select('app_key,snapshot').eq('learner_id', nextLearner.id),
      supabase.from('learning_apps').select('app_key,title,subject,grade_label,topic_labels').eq('active', true).order('subject'),
    ]);
    if (eventResult.error || legacyResult.error || appsResult.error) setNotice(`Fehler: ${eventResult.error?.message ?? legacyResult.error?.message ?? appsResult.error?.message}`);
    setEvents((eventResult.data ?? []) as LearningEvent[]);
    setLegacy((legacyResult.data ?? []) as LegacyRow[]);
    const apps = (appsResult.data ?? []) as LearningApp[];
    setLearningApps(apps);
    if (apps.length && !apps.some((app) => app.app_key === selectedAppKey)) setSelectedAppKey(apps[0].app_key);
    setLoading(false);
  }, [selectedAppKey, supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadDashboard(); }, 0);
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => { void loadDashboard(); });
    return () => { window.clearTimeout(initialLoad); data.subscription.unsubscribe(); };
  }, [loadDashboard, supabase]);

  const selectedApp = learningApps.find((app) => app.app_key === selectedAppKey) ?? learningApps[0];
  const activeEvents = useMemo(() => events.filter((event) => event.app_key === selectedAppKey), [events, selectedAppKey]);
  const activeLegacy = useMemo(() => legacy.filter((row) => row.app_key === selectedAppKey).map((row) => row.snapshot), [legacy, selectedAppKey]);
  const topicNames = useMemo(() => {
    const names = new Set(selectedApp?.topic_labels ?? []);
    activeEvents.forEach((event) => names.add(event.topic));
    activeLegacy.forEach((snapshot) => Object.keys(snapshot.topics ?? {}).forEach((topic) => names.add(topic)));
    return [...names];
  }, [activeEvents, activeLegacy, selectedApp]);

  const stats = useMemo(() => {
    const byTopic = Object.fromEntries(topicNames.map((topic) => [topic, { attempts: 0, score: 0 }])) as Record<string, { attempts: number; score: number }>;
    let totalAttempts = 0; let correct = 0; let points = 0; let bestStreak = 0; let streak = 0;
    for (const snapshot of activeLegacy) {
      totalAttempts += snapshot.totalAttempts ?? 0;
      points += snapshot.stars ?? 0;
      bestStreak = Math.max(bestStreak, snapshot.bestStreak ?? 0);
      for (const topic of topicNames) {
        byTopic[topic].attempts += snapshot.topics?.[topic]?.attempts ?? 0;
        byTopic[topic].score += snapshot.topics?.[topic]?.correct ?? 0;
        correct += snapshot.topics?.[topic]?.correct ?? 0;
      }
    }
    for (const event of activeEvents) {
      const score = Number(event.score);
      totalAttempts += 1; points += event.reward_points; correct += score;
      if (!byTopic[event.topic]) byTopic[event.topic] = { attempts: 0, score: 0 };
      byTopic[event.topic].attempts += 1; byTopic[event.topic].score += score;
      if (score >= 1) { streak += 1; bestStreak = Math.max(bestStreak, streak); }
      else streak = 0;
    }
    const overall = totalAttempts ? Math.round(correct / totalAttempts * 100) : 0;
    const practicedDays = new Set(activeEvents.map((event) => event.occurred_at.slice(0, 10))).size;
    const lastActivity = activeEvents.at(-1)?.occurred_at;
    const weakest = topicNames.filter((topic) => byTopic[topic].attempts > 0).sort((a, b) => byTopic[a].score / byTopic[a].attempts - byTopic[b].score / byTopic[b].attempts)[0];
    return { byTopic, totalAttempts, correct: Math.round(correct), points, bestStreak, overall, practicedDays, lastActivity, weakest };
  }, [activeEvents, activeLegacy, topicNames]);

  const recentDays = useMemo(() => {
    const days = new Map<string, { attempts: number; correct: number }>();
    for (const event of activeEvents) {
      const key = event.occurred_at.slice(0, 10);
      const day = days.get(key) ?? { attempts: 0, correct: 0 };
      day.attempts += 1; day.correct += Number(event.score); days.set(key, day);
    }
    return [...days.entries()].slice(-14).reverse();
  }, [activeEvents]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/parent` } });
    setNotice(error ? `Fehler: ${error.message}` : 'Wir haben dir einen sicheren Anmeldelink per E-Mail geschickt.');
    setBusy(false);
  }

  async function generateCode() {
    if (!supabase || !learner) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('create_pairing_code', { p_learner_id: learner.id });
    if (error) setNotice(`Fehler: ${error.message}`); else setPairingCode(data as string);
    setBusy(false);
  }

  async function clearProgress() {
    if (!supabase || !learner || !selectedApp || !window.confirm(`Den synchronisierten Fortschritt für „${selectedApp.title}“ wirklich löschen?`)) return;
    setBusy(true);
    const first = await supabase.from('learning_events').delete().eq('learner_id', learner.id).eq('app_key', selectedApp.app_key);
    const second = await supabase.from('legacy_progress').delete().eq('learner_id', learner.id).eq('app_key', selectedApp.app_key);
    setNotice(first.error || second.error ? `Fehler: ${first.error?.message ?? second.error?.message}` : 'Der synchronisierte Fortschritt wurde gelöscht.');
    await loadDashboard(); setBusy(false);
  }

  if (!supabase) return <ParentShell><section className="parentLogin"><p className="eyebrow">ELTERNBEREICH</p><h1>Cloud-Verbindung vorbereiten</h1><p>Der geschützte Elternbereich ist eingebaut. Trage die Supabase-Werte in der Hosting-Umgebung ein, damit Anmeldung und Synchronisierung aktiv werden.</p><Link className="secondaryButton" href="/">← Zur Lern-App</Link></section></ParentShell>;
  if (loading) return <ParentShell><section className="parentLogin"><p className="eyebrow">ELTERNBEREICH</p><h1>Fortschritt wird geladen …</h1></section></ParentShell>;
  if (!signedIn) return <ParentShell><section className="parentLogin"><p className="eyebrow">PRIVATER ELTERNBEREICH</p><h1>Davids Lernweg begleiten</h1><p>Du erhältst einen einmaligen Anmeldelink. Es wird kein Passwort gespeichert.</p><form onSubmit={sendMagicLink}><label htmlFor="parent-email">E-Mail der Eltern</label><input id="parent-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.ch" required/><button className="primaryButton" disabled={busy}>{busy ? 'Wird gesendet …' : 'Sicheren Link senden'}</button></form>{notice && <p className="noticeBox">{notice}</p>}<Link className="parentBack" href="/">← Zur Lern-App</Link></section></ParentShell>;

  return <ParentShell>
    <header className="parentHeader"><div><p className="eyebrow">FAMILIEN-LERNZENTRALE</p><h1>{learner?.display_name}s Lernweg</h1><p>Alle Lern-Apps und Schulfächer in einer gemeinsamen, geschützten Übersicht.</p></div><div className="parentActions"><Link className="secondaryButton" href="/">Lern-App öffnen</Link><button className="plainButton" onClick={() => supabase.auth.signOut()}>Abmelden</button></div></header>
    {notice && <p className="noticeBox">{notice}</p>}
    <section className="appSwitcher" aria-label="Lern-App auswählen">{learningApps.map((app) => <button key={app.app_key} className={app.app_key === selectedAppKey ? 'active' : ''} onClick={() => { setSelectedAppKey(app.app_key); setPairingCode(''); }}><span>{app.subject}</span><strong>{app.title}</strong><small>{app.grade_label}</small></button>)}</section>
    <div className="selectedAppTitle"><span>{selectedApp?.subject ?? 'Fach'}</span><h2>{selectedApp?.title ?? 'Lern-App'}</h2></div>
    <section className="parentStats"><article><span>Genauigkeit</span><strong>{stats.overall}%</strong><small>{stats.correct} richtige Antworten</small></article><article><span>Geübte Aufgaben</span><strong>{stats.totalAttempts}</strong><small>an {stats.practicedDays} Tagen online erfasst</small></article><article><span>Punkte</span><strong>{stats.points}</strong><small>beste Serie: {stats.bestStreak}</small></article><article><span>Letzte Aktivität</span><strong className="dateStat">{stats.lastActivity ? new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stats.lastActivity)) : 'Noch keine'}</strong><small>{stats.weakest ? `Nächster Fokus: ${stats.weakest}` : 'Nach dem ersten Training sichtbar'}</small></article></section>
    <div className="parentGrid"><section className="parentPanel"><div className="panelHeading"><div><p className="eyebrow">THEMEN</p><h2>Sicherheit nach Thema</h2></div></div>{topicNames.map((topic) => { const row = stats.byTopic[topic]; const value = row.attempts ? Math.round(row.score / row.attempts * 100) : 0; return <div className="parentTopic" key={topic}><div><strong>{topic}</strong><span>{row.attempts ? `${Math.round(row.score)} von ${row.attempts} richtig` : 'noch nicht geübt'}</span></div><div className="wideBar"><span style={{ width: `${value}%` }}/></div><b>{value}%</b></div>; })}</section>
      <section className="parentPanel"><p className="eyebrow">LETZTE LERNTAGE</p><h2>Aktivität</h2>{recentDays.length ? <div className="dayList">{recentDays.map(([date, day]) => <div key={date}><time>{new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00Z`))}</time><span>{day.attempts} Fragen</span><b>{Math.round(day.correct / day.attempts * 100)}%</b></div>)}</div> : <p className="emptyState">Sobald David nach der Verbindung trainiert, erscheint hier seine Aktivität.</p>}</section></div>
    <section className="pairingPanel"><div><p className="eyebrow">LERN-APP VERBINDEN</p><h2>Ein neues Gerät oder eine neue App verbinden</h2><p>Der Code verbindet die jeweilige Installation mit Davids zentralem Profil. So können später auch Mathematik, Sprachen und weitere Fächer dieselbe Lernzentrale verwenden.</p></div><div className="pairingAction">{pairingCode ? <><code>{pairingCode}</code><small>20 Minuten gültig · nur einmal verwendbar</small></> : <button className="primaryButton" onClick={generateCode} disabled={busy}>Verbindungscode erzeugen</button>}</div></section>
    <div className="privacyRow"><p>Gespeichert werden App, Fach, Thema, Ergebnis, Punkte und Zeitpunkt. Keine Antworten, Fotos, Schule oder Adresse.</p><button className="dangerLink" onClick={clearProgress} disabled={busy}>Fortschritt dieser App löschen</button></div>
  </ParentShell>;
}

function ParentShell({ children }: { children: React.ReactNode }) {
  return <main className="parentShell">{children}</main>;
}
