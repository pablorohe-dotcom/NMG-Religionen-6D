'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cloudIsConfigured } from '../lib/supabase';
import { claimPairingCode, createAttempt, flushAttemptQueue, getConsolidatedProgress, getLinkedLearner, queueAndSyncAttempt, resetProgressWithPassword, saveProgressBackup, saveProgressBackupOnClose, type CloudState } from '../lib/progress-cloud';

type Topic = 'Grundwissen' | 'Christentum' | 'Islam' | 'Judentum' | 'Gebäude & Schriften';
type Question = { id: string; topic: Topic; prompt: string; options: string[]; answer: number; explanation: string };
type TopicStat = { attempts: number; correct: number };
type Progress = { stars: number; streak: number; bestStreak: number; totalAttempts: number; topics: Record<Topic, TopicStat> };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const topics: Topic[] = ['Grundwissen', 'Christentum', 'Islam', 'Judentum', 'Gebäude & Schriften'];
const emptyProgress = (): Progress => ({
  stars: 0, streak: 0, bestStreak: 0, totalAttempts: 0,
  topics: Object.fromEntries(topics.map((topic) => [topic, { attempts: 0, correct: 0 }])) as Record<Topic, TopicStat>,
});

function normalizeProgress(value: unknown): Progress {
  const source = value && typeof value === 'object' ? value as Partial<Progress> : {};
  const sourceTopics: Partial<Record<Topic, Partial<TopicStat>>> = source.topics && typeof source.topics === 'object' ? source.topics : {};
  return {
    stars: Math.max(0, Number(source.stars) || 0),
    streak: Math.max(0, Number(source.streak) || 0),
    bestStreak: Math.max(0, Number(source.bestStreak) || 0),
    totalAttempts: Math.max(0, Number(source.totalAttempts) || 0),
    topics: Object.fromEntries(topics.map((topic) => {
      const stat = sourceTopics[topic];
      return [topic, { attempts: Math.max(0, Number(stat?.attempts) || 0), correct: Math.max(0, Number(stat?.correct) || 0) }];
    })) as Record<Topic, TopicStat>,
  };
}

const questions: Question[] = [
  { id: 'g1', topic: 'Grundwissen', prompt: 'Welche fünf Weltreligionen stehen im Lernheft?', options: ['Christentum, Islam, Judentum, Hinduismus, Buddhismus', 'Christentum, Islam, Sikhismus, Taoismus, Jainismus', 'Judentum, Islam, Schintoismus, Bahai, Buddhismus'], answer: 0, explanation: 'Für den Überblick kennst du alle fünf. In Prüfung Teil 1 lernst du Christentum, Islam und Judentum genauer.' },
  { id: 'g2', topic: 'Grundwissen', prompt: 'Was bedeutet Monotheismus?', options: ['Glaube an einen Gott', 'Glaube an viele Gottheiten', 'Keine religiöse Überzeugung'], answer: 0, explanation: 'mono bedeutet eins oder allein.' },
  { id: 'g3', topic: 'Grundwissen', prompt: 'Was bedeutet Polytheismus?', options: ['Glaube an viele Gottheiten', 'Glaube an einen Gott', 'Glaube nur an Engel'], answer: 0, explanation: 'poly bedeutet viel oder mehrere.' },
  { id: 'g4', topic: 'Grundwissen', prompt: 'Welche drei Religionen sind monotheistisch?', options: ['Judentum, Christentum und Islam', 'Hinduismus, Buddhismus und Islam', 'Christentum, Buddhismus und Hinduismus'], answer: 0, explanation: 'Judentum, Christentum und Islam glauben an einen Gott.' },
  { id: 'g5', topic: 'Grundwissen', prompt: 'Welche Aussage zur Verbreitung ist am besten?', options: ['Religionen kommen heute oft in vielen Ländern vor; Karten zeigen Schwerpunkte.', 'Jede Religion gibt es nur in einem Land.', 'In Europa gibt es nur Christentum.'], answer: 0, explanation: 'Menschen und Religionen sind weltweit vielfältig. Schulbuchkarten vereinfachen und zeigen Schwerpunkte.' },
  { id: 'g6', topic: 'Grundwissen', prompt: 'Welches Symbol ordnet das Lernheft dem Buddhismus zu?', options: ['Dharma-Rad', 'Kreuz', 'Davidstern'], answer: 0, explanation: 'Das Rad steht unter anderem für die Lehre und den Weg Buddhas.' },
  { id: 'g7', topic: 'Grundwissen', prompt: 'Welches Symbol ordnet das Lernheft dem Hinduismus zu?', options: ['Om-Zeichen', 'Halbmond', 'Kreuz'], answer: 0, explanation: 'Om ist eine heilige Silbe und ein verbreitetes Zeichen hinduistischer Traditionen.' },
  { id: 'g8', topic: 'Grundwissen', prompt: 'Wozu können Religionen Menschen helfen?', options: ['Sinnfragen bedenken, Gemeinschaft erleben und Werte finden', 'Jede wissenschaftliche Frage endgültig lösen', 'Alle Menschen gleich denken lassen'], answer: 0, explanation: 'Religion kann Halt, Gemeinschaft, Rituale und Antworten auf Sinnfragen geben.' },
  { id: 'c1', topic: 'Christentum', prompt: 'Was ist das wichtigste Zeichen des Christentums?', options: ['Das Kreuz', 'Der Davidstern', 'Das Dharma-Rad'], answer: 0, explanation: 'Das Kreuz erinnert an Jesus Christus.' },
  { id: 'c2', topic: 'Christentum', prompt: 'Wie heisst die heilige Schrift der Christinnen und Christen?', options: ['Bibel', 'Koran', 'Tora'], answer: 0, explanation: 'Die Bibel besteht aus Altem und Neuem Testament.' },
  { id: 'c3', topic: 'Christentum', prompt: 'Welche drei grossen Konfessionen solltest du kennen?', options: ['katholisch, reformiert/evangelisch, orthodox', 'sunnitisch, schiitisch, orthodox', 'katholisch, hinduistisch, buddhistisch'], answer: 0, explanation: 'Das Christentum hat verschiedene Konfessionen mit gemeinsamen Grundlagen.' },
  { id: 'c4', topic: 'Christentum', prompt: 'Was bedeutet die christliche Dreifaltigkeit?', options: ['Vater, Sohn und Heiliger Geist', 'Jesus, Mose und Mohammed', 'Bibel, Kirche und Kreuz'], answer: 0, explanation: 'Christinnen und Christen sprechen von einem Gott in Vater, Sohn und Heiligem Geist.' },
  { id: 'c5', topic: 'Christentum', prompt: 'Welche Botschaft wird Jesus im Lernheft besonders zugeordnet?', options: ['Liebe deinen Nächsten wie dich selbst.', 'Sammle möglichst viel Besitz.', 'Vermeide jede Gemeinschaft.'], answer: 0, explanation: 'Nächstenliebe ist ein Kern der Botschaft Jesu.' },
  { id: 'c6', topic: 'Christentum', prompt: 'Wo wirkte Jesus nach den Texten hauptsächlich?', options: ['Im Gebiet des heutigen Israel/Palästina', 'In Indien', 'Auf der Arabischen Halbinsel'], answer: 0, explanation: 'Jesus war Jude und lebte im Gebiet des heutigen Israel/Palästina.' },
  { id: 'c7', topic: 'Christentum', prompt: 'Was feiern Christinnen und Christen an Ostern?', options: ['Die Auferstehung Jesu', 'Die Geburt Jesu', 'Den Beginn des Ramadan'], answer: 0, explanation: 'Karfreitag erinnert an den Tod, Ostern an die Auferstehung Jesu.' },
  { id: 'c8', topic: 'Christentum', prompt: 'Was feiern Christinnen und Christen an Weihnachten?', options: ['Die Geburt Jesu', 'Die Himmelfahrt Jesu', 'Die Übergabe der Tora'], answer: 0, explanation: 'Weihnachten erinnert an die Geburt Jesu.' },
  { id: 'c9', topic: 'Christentum', prompt: 'Wie starb Jesus nach den Berichten des Neuen Testaments?', options: ['Er wurde in Jerusalem gekreuzigt.', 'Er starb als alter König.', 'Er fiel in einer Schlacht in Rom.'], answer: 0, explanation: 'Jesus wurde unter römischer Herrschaft gekreuzigt.' },
  { id: 'c10', topic: 'Christentum', prompt: 'Welche Regel passt zum Christentum?', options: ['Nächstenliebe und die Zehn Gebote', 'Die fünf Säulen', 'Der achtfache Pfad'], answer: 0, explanation: 'Nächstenliebe und die Zehn Gebote sind wichtige christliche Orientierungen.' },
  { id: 'i1', topic: 'Islam', prompt: 'Was bedeutet das arabische Wort „Allah“?', options: ['Gott', 'Prophet', 'Gebetshaus'], answer: 0, explanation: 'Allah ist das arabische Wort für Gott; auch arabische Christinnen und Christen verwenden es.' },
  { id: 'i2', topic: 'Islam', prompt: 'Wie heisst die heilige Schrift des Islams?', options: ['Koran', 'Bibel', 'Tora'], answer: 0, explanation: 'Im Islam gilt der Koran als Offenbarung Gottes an Mohammed.' },
  { id: 'i3', topic: 'Islam', prompt: 'Wo wurde Mohammed ungefähr im Jahr 570 geboren?', options: ['Mekka', 'Medina', 'Jerusalem'], answer: 0, explanation: 'Mohammed wurde nach islamischer Überlieferung in Mekka auf der Arabischen Halbinsel geboren.' },
  { id: 'i4', topic: 'Islam', prompt: 'Welcher Engel überbrachte Mohammed nach islamischer Überlieferung Offenbarungen?', options: ['Gabriel', 'Michael', 'Raphael'], answer: 0, explanation: 'Die Überlieferung nennt den Engel Gabriel.' },
  { id: 'i5', topic: 'Islam', prompt: 'Wo empfing Mohammed die erste Offenbarung?', options: ['In der Höhle Hira bei Mekka', 'In einer Höhle bei Medina', 'In einem Tempel in Jerusalem'], answer: 0, explanation: 'Hira liegt bei Mekka. Die Formulierung „bei Medina“ in einer Aufgabe ist sehr wahrscheinlich ein Druckfehler.' },
  { id: 'i6', topic: 'Islam', prompt: 'In welche Stadt wanderte Mohammed aus?', options: ['Medina', 'Rom', 'Nazareth'], answer: 0, explanation: 'Die Auswanderung von Mekka nach Medina heisst Hidschra.' },
  { id: 'i7', topic: 'Islam', prompt: 'Wie nennen Musliminnen und Muslime Mohammed?', options: ['Prophet und Gesandter Gottes', 'Sohn Gottes', 'Gott des Mondes'], answer: 0, explanation: 'Im Islam ist Mohammed ein Mensch, Prophet und Gesandter Gottes.' },
  { id: 'i8', topic: 'Islam', prompt: 'Welche Reihe nennt die fünf Säulen des Islams?', options: ['Glaubensbekenntnis, Gebet, Almosen, Fasten, Pilgerfahrt', 'Taufe, Abendmahl, Beichte, Firmung, Ehe', 'Geburt, Schule, Beruf, Reise, Tod'], answer: 0, explanation: 'Die fünf Säulen strukturieren wichtige religiöse Pflichten.' },
  { id: 'j1', topic: 'Judentum', prompt: 'Welches Zeichen wird dem Judentum häufig zugeordnet?', options: ['Davidstern', 'Kreuz', 'Om'], answer: 0, explanation: 'Der sechszackige Davidstern ist ein verbreitetes jüdisches Zeichen.' },
  { id: 'j2', topic: 'Judentum', prompt: 'Wie heisst das jüdische Gebetshaus?', options: ['Synagoge', 'Moschee', 'Kirche'], answer: 0, explanation: 'In der Synagoge wird gebetet, gelernt und Gemeinschaft gelebt.' },
  { id: 'j3', topic: 'Judentum', prompt: 'Was ist die Tora?', options: ['Die fünf Bücher Mose und Kern der jüdischen heiligen Schriften', 'Ein christliches Fest', 'Ein muslimisches Gebet'], answer: 0, explanation: 'Die Tora wird auf Schriftrollen geschrieben und in der Synagoge gelesen.' },
  { id: 'j4', topic: 'Judentum', prompt: 'Welche Aussage ist richtig?', options: ['Das Judentum ist monotheistisch.', 'Das Judentum verehrt viele Gottheiten.', 'Jüdinnen und Juden haben keine heiligen Schriften.'], answer: 0, explanation: 'Im Judentum steht der Glaube an den einen Gott im Zentrum.' },
  { id: 'j5', topic: 'Judentum', prompt: 'Welcher Tag ist der jüdische Ruhetag?', options: ['Schabbat', 'Freitag der Kreuzigung', 'Ramadan'], answer: 0, explanation: 'Der Schabbat beginnt am Freitagabend und endet am Samstagabend.' },
  { id: 'j6', topic: 'Judentum', prompt: 'Welche Regel gehört zum Judentum?', options: ['Zehn Gebote und Speiseregeln (koscher)', 'Fünf Säulen', 'Achtfacher Pfad'], answer: 0, explanation: 'Zu jüdischen Traditionen gehören Gebote, Schabbat und unterschiedliche Formen koscherer Ernährung.' },
  { id: 'b1', topic: 'Gebäude & Schriften', prompt: 'Wo befindet sich der Altar?', options: ['In einer Kirche', 'Nur in einer Moschee', 'Nur in einer Synagoge'], answer: 0, explanation: 'In katholischen Kirchen ist der Altar ein zentraler Ort der Eucharistiefeier.' },
  { id: 'b2', topic: 'Gebäude & Schriften', prompt: 'Was ist ein Tabernakel?', options: ['Ein Aufbewahrungsort für geweihte Hostien in einer katholischen Kirche', 'Der Gebetsteppich in einer Moschee', 'Der Toraschrein'], answer: 0, explanation: 'Der Tabernakel befindet sich meist nahe beim Altar und ist häufig durch ein Licht gekennzeichnet.' },
  { id: 'b3', topic: 'Gebäude & Schriften', prompt: 'Was zeigt die Gebetsrichtung in einer Moschee an?', options: ['Die Gebetsnische Mihrab', 'Der Kirchturm', 'Die Orgel'], answer: 0, explanation: 'Der Mihrab zeigt die Gebetsrichtung nach Mekka (Qibla) an.' },
  { id: 'b4', topic: 'Gebäude & Schriften', prompt: 'Was ist ein Minbar?', options: ['Eine Kanzel in der Moschee', 'Ein Taufbecken', 'Ein Toraschrein'], answer: 0, explanation: 'Vom Minbar aus wird besonders beim Freitagsgebet gepredigt.' },
  { id: 'b5', topic: 'Gebäude & Schriften', prompt: 'Wo werden Torarollen aufbewahrt?', options: ['Im Toraschrein der Synagoge', 'Im Minarett', 'Im Taufbecken'], answer: 0, explanation: 'Der Toraschrein ist ein besonders wichtiger Ort in der Synagoge.' },
  { id: 'b6', topic: 'Gebäude & Schriften', prompt: 'Welche Zuordnung ist vollständig richtig?', options: ['Kirche–Bibel, Moschee–Koran, Synagoge–Tora', 'Kirche–Koran, Moschee–Tora, Synagoge–Bibel', 'Kirche–Tora, Moschee–Bibel, Synagoge–Koran'], answer: 0, explanation: 'Diese drei Paare gehören zum Kernwissen für Prüfung Teil 1.' },
];

const religionRows = [
  ['Christentum', 'Kreuz', 'weltweit; Schwerpunkte u. a. Europa und Amerika', 'ein Gott', 'Kirche', 'Bibel'],
  ['Islam', 'Halbmond*', 'weltweit; Schwerpunkte u. a. Nordafrika, West- und Südasien', 'ein Gott (Allah)', 'Moschee', 'Koran'],
  ['Judentum', 'Davidstern', 'weltweit; besonders Israel und USA', 'ein Gott', 'Synagoge', 'Tora/Tanach'],
  ['Buddhismus', 'Dharma-Rad', 'Schwerpunkte in Ost- und Südostasien', 'kein Schöpfergott im Zentrum', 'Tempel', 'verschiedene Lehrtexte'],
  ['Hinduismus', 'Om', 'vor allem Indien und Südasien', 'vielfältige Gottesvorstellungen', 'Tempel', 'z. B. Veden'],
];

function ratio(stat: TopicStat) { return stat.attempts ? stat.correct / stat.attempts : 0; }
function percent(stat: TopicStat) { return Math.round(ratio(stat) * 100); }

export default function Home() {
  const [section, setSection] = useState('start');
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Topic | 'Alle'>('Alle');
  const [currentId, setCurrentId] = useState('g1');
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [cloudState, setCloudState] = useState<CloudState>(cloudIsConfigured() ? 'connecting' : 'unavailable');
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const sessionDirty = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('davids-nmg-progress-v1');
    let loaded = emptyProgress();
    if (saved) { try { loaded = JSON.parse(saved); } catch { /* start fresh */ } }
    queueMicrotask(() => { setProgress(loaded); setReady(true); });
    if (cloudIsConfigured()) {
      getLinkedLearner().then(async (linked) => {
        if (!linked) { setCloudState('unlinked'); return; }
        setLearnerId(linked.id);
        const nextState = await flushAttemptQueue();
        setCloudState(nextState);
        if (nextState === 'synced') {
          const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(linked.id));
          setProgress(consolidated);
          await saveProgressBackup(linked.id, consolidated, 'session_sync');
        }
      }).catch(() => setCloudState('error'));
    }
    let updateTimer: number | undefined;
    let controllerChanged = false;
    const hadController = Boolean(navigator.serviceWorker?.controller);
    const activateUpdate = () => {
      if (!hadController || controllerChanged) return;
      controllerChanged = true;
      window.location.reload();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', activateUpdate);
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        void registration.update();
        updateTimer = window.setInterval(() => { void registration.update(); }, 60 * 60 * 1000);
      }).catch(() => undefined);
    }
    const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent); };
    const syncOnline = () => { getLinkedLearner().then(async (linked) => { if (!linked) return; const state = await flushAttemptQueue(); setCloudState(state); if (state === 'synced') { const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(linked.id)); setProgress(consolidated); await saveProgressBackup(linked.id, consolidated, 'reconnected'); sessionDirty.current = false; } }).catch(() => setCloudState('error')); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('online', syncOnline);
    return () => { window.removeEventListener('beforeinstallprompt', handler); window.removeEventListener('online', syncOnline); navigator.serviceWorker?.removeEventListener('controllerchange', activateUpdate); if (updateTimer) window.clearInterval(updateTimer); };
  }, []);

  useEffect(() => { if (ready) window.localStorage.setItem('davids-nmg-progress-v1', JSON.stringify(progress)); }, [progress, ready]);

  useEffect(() => {
    if (!learnerId) return;
    const refresh = async () => {
      if (!navigator.onLine) return;
      try {
        const state = await flushAttemptQueue();
        setCloudState(state);
        if (state === 'synced') {
          const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(learnerId));
          setProgress(consolidated);
          if (sessionDirty.current) { await saveProgressBackup(learnerId, consolidated, 'session_sync'); sessionDirty.current = false; }
        }
      } catch { setCloudState('error'); }
    };
    const backupIfChanged = () => {
      if (!sessionDirty.current || !navigator.onLine) return;
      saveProgressBackupOnClose(learnerId);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
      else backupIfChanged();
    };
    const refreshTimer = window.setInterval(() => { void refresh(); }, 60 * 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', backupIfChanged);
    return () => { window.clearInterval(refreshTimer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', backupIfChanged); };
  }, [learnerId]);

  const totalCorrect = useMemo(() => topics.reduce((sum, t) => sum + progress.topics[t].correct, 0), [progress]);
  const overall = progress.totalAttempts ? Math.round(totalCorrect / progress.totalAttempts * 100) : 0;
  const level = progress.stars >= 180 ? 'Wissens-Champion' : progress.stars >= 90 ? 'Weltenkenner' : progress.stars >= 35 ? 'Spurensucher' : 'Entdecker';
  const current = questions.find((q) => q.id === currentId) ?? questions[0];
  const correct = selected === current.answer;

  function chooseNext(activeFilter = filter) {
    const pool = questions.filter((q) => activeFilter === 'Alle' || q.topic === activeFilter).filter((q) => q.id !== currentId);
    const ordered = [...pool].sort((a, b) => ratio(progress.topics[a.topic]) - ratio(progress.topics[b.topic]) || progress.topics[a.topic].attempts - progress.topics[b.topic].attempts);
    setCurrentId((ordered[0] ?? questions[0]).id); setSelected(null); setLocked(false);
  }

  function answer(index: number) {
    if (locked) return;
    setSelected(index); setLocked(true);
    const isCorrect = index === current.answer;
    sessionDirty.current = true;
    if (learnerId) {
      setCloudState(navigator.onLine ? 'connecting' : 'offline');
      void queueAndSyncAttempt(createAttempt(learnerId, current.id, current.topic, isCorrect)).then(async (state) => {
        setCloudState(state);
        if (state !== 'synced') return;
        const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(learnerId));
        setProgress(consolidated);
        await saveProgressBackup(learnerId, consolidated, 'autosave');
        sessionDirty.current = false;
      }).catch(() => setCloudState('error'));
    }
    setProgress((old) => {
      const topic = old.topics[current.topic];
      const streak = isCorrect ? old.streak + 1 : 0;
      return { ...old, stars: old.stars + (isCorrect ? 5 : 1), streak, bestStreak: Math.max(old.bestStreak, streak), totalAttempts: old.totalAttempts + 1, topics: { ...old.topics, [current.topic]: { attempts: topic.attempts + 1, correct: topic.correct + (isCorrect ? 1 : 0) } } };
    });
  }

  function startTraining(topic: Topic | 'Alle' = 'Alle') {
    setFilter(topic); setSection('training');
    const first = questions.find((q) => topic === 'Alle' || q.topic === topic) ?? questions[0];
    setCurrentId(first.id); setSelected(null); setLocked(false);
    setTimeout(() => document.getElementById('content')?.scrollIntoView({ behavior: 'smooth' }), 30);
  }

  async function installApp() {
    if (installEvent) { await installEvent.prompt(); setInstallEvent(null); }
    else setShowInstall(true);
  }

  function resetProgress() {
    setResetMessage(''); setResetPassword('');
    if (!learnerId) {
      setSyncMessage('Verbinde die App zuerst mit dem geschützten Elternbereich. Danach kann der Fortschritt nur mit dem Eltern-Passwort zurückgesetzt werden.');
      setShowSync(true); return;
    }
    setShowReset(true);
  }

  async function confirmReset(event: React.FormEvent) {
    event.preventDefault();
    if (!learnerId || !resetPassword) return;
    if (!navigator.onLine) { setResetMessage('Zum sicheren Zurücksetzen brauchst du kurz eine Internetverbindung.'); return; }
    setResetBusy(true); setResetMessage('');
    try {
      const cleared = normalizeProgress(await resetProgressWithPassword<Progress>(learnerId, resetPassword));
      setProgress(cleared); sessionDirty.current = false;
      setResetPassword(''); setShowReset(false); setCloudState('synced');
    } catch { setResetMessage('Das Passwort stimmt nicht. Bitte frage deine Eltern.'); }
    finally { setResetBusy(false); }
  }

  async function connectToParent(event: React.FormEvent) {
    event.preventDefault();
    if (!pairingCode.trim()) return;
    setCloudState('connecting'); setSyncMessage('');
    try {
      const id = await claimPairingCode(pairingCode, progress);
      setLearnerId(id); setCloudState('synced');
      const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(id));
      setProgress(consolidated);
      await saveProgressBackup(id, consolidated, 'paired');
      setSyncMessage('Verbunden! Neue Übungen erscheinen jetzt sicher im Elternbereich.');
      setPairingCode('');
    } catch {
      setCloudState('error');
      setSyncMessage('Der Code ist ungültig oder abgelaufen. Bitte einen neuen Code erzeugen.');
    }
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand plainButton" onClick={() => setSection('start')} aria-label="Startseite"><span className="brandMark">W</span><span>Davids Weltreligionen-Training</span></button>
        <nav className="desktopNav" aria-label="Hauptnavigation">{[['start','Start'],['lernen','Lernen'],['training','Trainieren'],['progress','Fortschritt']].map(([key,label]) => <button key={key} className={section === key ? 'navButton active' : 'navButton'} onClick={() => setSection(key)}>{label}</button>)}</nav>
        <div className="topActions"><button className={`cloudButton ${cloudState}`} onClick={() => setShowSync(true)}><span>●</span>{cloudState === 'synced' ? 'Mit Eltern verbunden' : cloudState === 'offline' ? 'Offline · wird später gesendet' : 'Fortschritt verbinden'}</button><button className="installButton" onClick={installApp}>＋ App installieren</button></div>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy"><p className="eyebrow">NMG · PRÜFUNG TEIL 1 · 6. KLASSE</p><h1>Hallo David. Bereit für deine nächste Mission?</h1><p className="lede">Lerne die fünf Weltreligionen kennen und trainiere Christentum, Islam und Judentum besonders genau. Kurze Etappen, sofortiges Feedback, kein Prüfungsstress.</p><div className="buttonRow"><button className="primaryButton" onClick={() => startTraining('Alle')}>Training starten <span>→</span></button><button className="secondaryButton" onClick={() => setSection('lernen')}>Erst lernen</button></div></div>
        <aside className="progressCard" aria-label="Lernfortschritt"><div className="orbit" style={{'--progress': `${overall * 3.6}deg`} as React.CSSProperties}><span>✦</span><b>{overall}%</b></div><div><p className="tinyLabel">DEIN WEG</p><h2>{level}</h2><p>{progress.totalAttempts ? `${progress.totalAttempts} Fragen gelöst · ${progress.stars} Sterne` : 'Löse die erste Frage und sammle deinen ersten Stern.'}</p></div></aside>
      </section>

      <div className="mobileNav" aria-label="Mobile Navigation">{[['start','⌂','Start'],['lernen','◫','Lernen'],['training','✦','Training'],['progress','◔','Fortschritt']].map(([key,icon,label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><span>{icon}</span>{label}</button>)}</div>

      <section id="content" className="contentShell">
        {section === 'start' && <Dashboard progress={progress} onStart={startTraining} />}
        {section === 'lernen' && <Learn onStart={startTraining} />}
        {section === 'training' && <section className="mission">
          <div className="missionTop"><div><p className="eyebrow">ADAPTIVES TRAINING</p><h2>{current.topic}</h2></div><span className="starPill">✦ {progress.stars}</span></div>
          <div className="filterRow">{(['Alle', ...topics] as const).map((topic) => <button key={topic} className={filter === topic ? 'chip active' : 'chip'} onClick={() => startTraining(topic)}>{topic}</button>)}</div>
          <p className="question">{current.prompt}</p>
          <div className="answerGrid">{current.options.map((option, index) => { const state = locked ? index === current.answer ? ' correct' : index === selected ? ' wrong' : '' : selected === index ? ' active' : ''; return <button className={`answer${state}`} key={option} onClick={() => answer(index)} disabled={locked}><span className="choiceLetter">{String.fromCharCode(65 + index)}</span>{option}</button>; })}</div>
          {locked && <div className={correct ? 'feedback success' : 'feedback retry'} role="status"><strong>{correct ? 'Stark! +5 Sterne' : 'Guter Versuch. +1 Stern'}</strong><span>{current.explanation}</span></div>}
          <div className="missionFooter"><span>{progress.streak >= 2 ? `🔥 ${progress.streak} richtige Antworten in Folge` : 'Das Training wählt schwächere Themen häufiger aus.'}</span><button className="primaryButton small" onClick={() => chooseNext()} disabled={!locked}>Nächste Frage →</button></div>
        </section>}
        {section === 'progress' && <ProgressView progress={progress} overall={overall} level={level} onReset={resetProgress} onStart={startTraining} cloudState={cloudState} onConnect={() => setShowSync(true)} />}
      </section>

      <footer><div><strong>Für David · Prüfung Teil 1</strong><p>{learnerId ? 'Neue Übungen werden sicher für den Elternbereich synchronisiert. Offline wird später automatisch nachgeholt.' : 'Fortschritt bleibt auf diesem Gerät gespeichert, bis du ihn mit dem Elternbereich verbindest.'}</p></div><div className="footerLinks"><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C5" target="_blank" rel="noreferrer">Lehrplan 21 Zug · NMG.12.5</a><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C2" target="_blank" rel="noreferrer">NMG.12.2</a><button onClick={() => setSection('quellen')}>Quellen & Bildnachweise</button></div></footer>
      {section === 'quellen' && <Sources onClose={() => setSection('start')} />}
      {showInstall && <div className="modalBackdrop" role="presentation" onClick={() => setShowInstall(false)}><div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><button className="modalClose" onClick={() => setShowInstall(false)}>×</button><p className="eyebrow">APP INSTALLIEREN</p><h2>Auf Mac oder Windows</h2><p>Öffne das Browser-Menü in Chrome oder Edge und wähle <strong>„App installieren“</strong>. In Safari auf dem Mac: <strong>Ablage → Zum Dock hinzufügen</strong>. Danach startet die App wie ein normales Programm und bleibt offline verfügbar.</p></div></div>}
      {showReset && <div className="modalBackdrop" role="presentation" onClick={() => !resetBusy && setShowReset(false)}><div className="modal syncModal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={(e) => e.stopPropagation()}><button className="modalClose" onClick={() => setShowReset(false)} disabled={resetBusy}>×</button><p className="eyebrow">GESCHÜTZTER BEREICH</p><h2 id="reset-title">Fortschritt zurücksetzen</h2><p>Bitte deine Eltern, das Passwort aus dem Elternbereich einzugeben. Vor dem Zurücksetzen wird automatisch eine wiederherstellbare Sicherung erstellt.</p><form className="pairingForm" onSubmit={confirmReset}><label htmlFor="reset-password">Eltern-Passwort</label><input id="reset-password" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="off" required/><button className="primaryButton" disabled={resetBusy}>{resetBusy ? 'Wird geprüft …' : 'Sicher zurücksetzen'}</button></form>{resetMessage && <p className="noticeBox">{resetMessage}</p>}</div></div>}
      {showSync && <div className="modalBackdrop" role="presentation" onClick={() => setShowSync(false)}><div className="modal syncModal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><button className="modalClose" onClick={() => setShowSync(false)}>×</button><p className="eyebrow">SICHER SYNCHRONISIEREN</p><h2>{learnerId ? 'Mit Eltern verbunden' : 'Mit Eltern verbinden'}</h2>{learnerId ? <><div className="syncSuccess">✓ Davids neue Übungen werden im geschützten Elternbereich angezeigt.</div><p>Du kannst auch offline trainieren. Sobald das Gerät wieder Internet hat, werden wartende Ergebnisse automatisch gesendet.</p><p className="noticeBox">Der geschützte Elternbereich ist nur für Eltern auf ihrem eigenen Gerät bestimmt.</p></> : cloudState === 'unavailable' ? <p>Die Cloud-Verbindung ist in dieser Installation noch nicht eingerichtet. Die App speichert den Fortschritt weiterhin nur auf diesem Gerät.</p> : <><p>Deine Eltern erzeugen auf ihrem eigenen Gerät im geschützten Elternbereich einen achtstelligen Code. Gib ihn hier ein; der bisherige Fortschritt wird einmalig übernommen.</p><form className="pairingForm" onSubmit={connectToParent}><label htmlFor="pairing-code">Verbindungscode</label><input id="pairing-code" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} maxLength={8} placeholder="A1B2C3D4" autoCapitalize="characters" autoComplete="one-time-code" required/><button className="primaryButton" disabled={cloudState === 'connecting'}>{cloudState === 'connecting' ? 'Verbinden …' : 'Sicher verbinden'}</button></form><p className="noticeBox">Bitte deine Eltern, den Code auf ihrem eigenen Gerät zu erzeugen.</p></>}{syncMessage && <p className="noticeBox">{syncMessage}</p>}</div></div>}
    </main>
  );
}

function Dashboard({ progress, onStart }: { progress: Progress; onStart: (topic: Topic | 'Alle') => void }) {
  return <><div className="sectionHeading"><div><p className="eyebrow">DEINE LERNROUTE</p><h2>Drei Etappen bis zur Prüfung</h2></div><p>Beginne mit dem Überblick, vertiefe die drei Prüfungsreligionen und übe Gebäude, Schriften und wichtige Personen.</p></div><div className="routeGrid">{[
    ['01','Überblick','5 Weltreligionen · mono/poly · Verbreitung','Grundwissen' as Topic],
    ['02','Drei Religionen','Christentum · Islam · Judentum','Christentum' as Topic],
    ['03','Orte & Menschen','Jesus · Mohammed · Kirche · Moschee','Gebäude & Schriften' as Topic],
  ].map(([number,title,copy,topic]) => <article className="routeCard" key={number}><span className="routeNo">{number}</span><h3>{title}</h3><p>{copy}</p><div className="miniBar"><span style={{width:`${percent(progress.topics[topic as Topic])}%`}} /></div><button onClick={() => onStart(topic as Topic)}>Mission öffnen →</button></article>)}</div><aside className="scopeNote"><span>✓</span><div><strong>Genau auf Prüfung Teil 1 begrenzt</strong><p>Buddhismus und Hinduismus kommen nur im gemeinsamen Überblick vor. Ihre Detailthemen gehören laut Lernzielblatt zu Teil 2.</p></div></aside><section className="downloadPanel"><div className="downloadIcon" aria-hidden="true">📘</div><div><p className="eyebrow">DEIN LERNHEFT</p><h3>Alles für Prüfung Teil 1 zum Nachlesen</h3><p>Der Stoff in klaren Tabellen, Merksätzen und einer Probeprüfung – auch zum Ausdrucken.</p></div><a className="primaryButton small" href="/materials/Lernheft_Pruefung_1_David_DE.pdf" download>Lernheft als PDF ↓</a></section></>;
}

function Learn({ onStart }: { onStart: (topic: Topic | 'Alle') => void }) {
  return <><div className="sectionHeading"><div><p className="eyebrow">LERNKARTEN</p><h2>Das musst du wirklich können</h2></div><button className="primaryButton small" onClick={() => onStart('Alle')}>Wissen testen →</button></div>
    <section className="studyBlock"><div className="blockTitle"><span>01</span><div><h3>Die fünf Weltreligionen</h3><p>Der gemeinsame Überblick für Teil 1 und Teil 2</p></div></div><div className="tableWrap"><table><thead><tr><th>Religion</th><th>Symbol</th><th>Verbreitung</th><th>Gottesvorstellung</th><th>Gebäude</th><th>Schrift</th></tr></thead><tbody>{religionRows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><p className="finePrint">* Der Halbmond ist ein verbreitetes kulturelles Zeichen des Islams, aber kein überall verbindliches offizielles Symbol. Für die Prüfung gilt die Zuordnung im Lernheft.</p></section>
    <section className="studyBlock"><div className="blockTitle"><span>02</span><div><h3>Die drei Prüfungsreligionen</h3><p>Gemeinsamkeiten erkennen, Unterschiede sachlich benennen</p></div></div><div className="religionGrid"><ReligionCard symbol="✝" name="Christentum" color="violet" facts={['Gott: ein Gott · Dreifaltigkeit','Schrift: Bibel','Gebäude: Kirche','Wichtige Person: Jesus Christus','Bräuche: Gebet, Gottesdienst, Weihnachten, Ostern','Regeln: Nächstenliebe, Zehn Gebote']} onStart={() => onStart('Christentum')} /><ReligionCard symbol="☾" name="Islam" color="green" facts={['Gott: Allah (arabisch: Gott)','Schrift: Koran','Gebäude: Moschee','Wichtige Person: Prophet Mohammed','Bräuche: Gebet, Ramadan, Feste','Regeln: fünf Säulen']} onStart={() => onStart('Islam')} /><ReligionCard symbol="✡" name="Judentum" color="blue" facts={['Gott: ein Gott','Schrift: Tora/Tanach','Gebäude: Synagoge','Wichtige Personen: z. B. Abraham, Mose','Bräuche: Schabbat, Feste','Regeln: Gebote, koschere Lebensweise']} onStart={() => onStart('Judentum')} /></div><aside className="memoryLine"><strong>3er-Merksatz:</strong> Kirche–Bibel–Jesus · Moschee–Koran–Mohammed · Synagoge–Tora–Mose</aside></section>
    <Timeline /><Buildings onStart={onStart} /></>;
}

function ReligionCard({ symbol, name, color, facts, onStart }: { symbol: string; name: string; color: string; facts: string[]; onStart: () => void }) {
  return <article className={`religionCard ${color}`}><div className="symbolCircle">{symbol}</div><h4>{name}</h4><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul><button onClick={onStart}>Dazu trainieren →</button></article>;
}

function Timeline() {
  return <section className="studyBlock"><div className="blockTitle"><span>03</span><div><h3>Jesus und Mohammed</h3><p>Glaube und Geschichte respektvoll unterscheiden</p></div></div><div className="timelineColumns"><article><p className="eyebrow">JESUS · CHRISTENTUM</p>{[['vor über 2000 Jahren','Jude aus Nazareth; nach den Evangelien Geburt in Bethlehem'],['ca. 30 Jahre','Wanderprediger; spricht von Gottes Liebe und Nächstenliebe'],['ca. 33','Kreuzigung in Jerusalem'],['nach christlichem Glauben','Auferstehung am dritten Tag; später Himmelfahrt']].map(([when,what]) => <div className="timeItem" key={when}><strong>{when}</strong><span>{what}</span></div>)}</article><article><p className="eyebrow">MOHAMMED · ISLAM</p>{[['ca. 570','Geburt in Mekka; früh Waise, später Händler'],['ca. 610','laut islamischer Überlieferung erste Offenbarung durch Gabriel in der Höhle Hira'],['622','Auswanderung von Mekka nach Medina (Hidschra)'],['632','Tod in Medina; Offenbarungen werden später im Koran gesammelt']].map(([when,what]) => <div className="timeItem" key={when}><strong>{when}</strong><span>{what}</span></div>)}</article></div><p className="sourceNote">Prüfungs-Tipp: Formuliere „Christinnen und Christen glauben …“ oder „Nach islamischer Überlieferung …“, wenn du eine Glaubensaussage erklärst.</p></section>;
}

function Buildings({ onStart }: { onStart: (topic: Topic | 'Alle') => void }) {
  const cards = [
    { image:'/images/church.jpg', title:'Katholische Kirche', labels:['Altar','Ambo','Tabernakel','Taufbecken','Kreuz/Kruzifix','Orgel'], alt:'Innenraum einer katholischen Kirche in Spreitenbach' },
    { image:'/images/mosque.jpg', title:'Moschee', labels:['Gebetsraum','Mihrab (Gebetsnische)','Qibla (Richtung Mekka)','Minbar (Kanzel)','Gebetsteppiche','Ort der Waschung'], alt:'Mihrab im Innenraum einer Moschee' },
    { image:'/images/synagogue.jpg', title:'Synagoge', labels:['Toraschrein','Torarollen','Bima/Lesepult','Ewiges Licht','Sitzplätze'], alt:'Innenraum einer Synagoge mit Torarollen' },
  ];
  return <section className="studyBlock"><div className="blockTitle"><span>04</span><div><h3>Heilige Räume erkennen</h3><p>Bild ansehen, Begriffe laut erklären, danach ohne Hilfe testen</p></div></div><div className="buildingGrid">{cards.map((card) => <article className="buildingCard" key={card.title}><img src={card.image} alt={card.alt}/><div><h4>{card.title}</h4><div className="labelCloud">{card.labels.map((label) => <span key={label}>{label}</span>)}</div></div></article>)}</div><button className="primaryButton small" onClick={() => onStart('Gebäude & Schriften')}>Gebäude-Quiz starten →</button></section>;
}

function ProgressView({ progress, overall, level, onReset, onStart, cloudState, onConnect }: { progress: Progress; overall: number; level: string; onReset: () => void; onStart: (topic: Topic | 'Alle') => void; cloudState: CloudState; onConnect: () => void }) {
  const weakest = [...topics].sort((a,b) => ratio(progress.topics[a]) - ratio(progress.topics[b]))[0];
  return <><div className="sectionHeading"><div><p className="eyebrow">FORTSCHRITT</p><h2>{level}: {overall}%</h2></div><button className="primaryButton small" onClick={() => onStart(weakest)}>Schwächstes Thema üben →</button></div><button className={`syncBanner ${cloudState}`} onClick={onConnect}><span>{cloudState === 'synced' ? '✓' : cloudState === 'offline' ? '↻' : '☁'}</span><div><strong>{cloudState === 'synced' ? 'Sicher mit dem Elternbereich verbunden' : cloudState === 'offline' ? 'Offline – Ergebnisse warten sicher' : 'Fortschritt mit den Eltern teilen'}</strong><p>{cloudState === 'synced' ? 'Der gemeinsame Stand wird auf allen verbundenen Geräten aktualisiert.' : cloudState === 'offline' ? 'Die Synchronisierung läuft weiter, sobald Internet da ist.' : 'Ein einmaliger Code genügt. Du brauchst keine E-Mail.'}</p></div><b>→</b></button><div className="statGrid"><article><span>✦</span><strong>{progress.stars}</strong><p>Sterne gesammelt</p></article><article><span>🔥</span><strong>{progress.bestStreak}</strong><p>Beste Serie</p></article><article><span>✓</span><strong>{progress.totalAttempts}</strong><p>Fragen gelöst</p></article></div><section className="masteryCard"><h3>Themen-Meisterschaft</h3>{topics.map((topic) => { const stat=progress.topics[topic]; const p=percent(stat); return <div className="masteryRow" key={topic}><div><strong>{topic}</strong><span>{stat.attempts ? `${stat.correct} von ${stat.attempts} richtig` : 'noch nicht begonnen'}</span></div><div className="wideBar"><span style={{width:`${p}%`}} /></div><b>{p}%</b></div>; })}</section><div className="badgeGrid"><Badge active={progress.totalAttempts >= 1} icon="🌱" title="Erster Schritt" copy="1 Frage gelöst"/><Badge active={progress.bestStreak >= 5} icon="🔥" title="Heisse Serie" copy="5-mal in Folge richtig"/><Badge active={topics.filter(t => percent(progress.topics[t]) >= 80).length >= 3} icon="🧭" title="Weltenkenner" copy="3 Themen über 80%"/><Badge active={progress.stars >= 180} icon="🏆" title="Prüfungsbereit" copy="180 Sterne gesammelt"/></div><button className="dangerLink" onClick={onReset}>Gesamten Fortschritt geschützt zurücksetzen</button></>;
}

function Badge({active,icon,title,copy}:{active:boolean;icon:string;title:string;copy:string}) { return <article className={active ? 'badge active' : 'badge'}><span>{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></article>; }

function Sources({ onClose }: { onClose: () => void }) {
  return <div className="modalBackdrop"><div className="modal sourcesModal" role="dialog" aria-modal="true"><button className="modalClose" onClick={onClose}>×</button><p className="eyebrow">TRANSPARENZ</p><h2>Quellen & Bildnachweise</h2><h3>Fachliche Grundlage</h3><ul><li><a href="https://zg.ch/de/bildung/schulen/gemeindliche-schulen/unterricht/lehrplan21" target="_blank" rel="noreferrer">Kanton Zug: Lehrplan 21</a></li><li><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C5" target="_blank" rel="noreferrer">NMG.12.5 – Sich in der Vielfalt religiöser Traditionen orientieren</a></li><li><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C2" target="_blank" rel="noreferrer">NMG.12.2 – Religiöse Sprachformen, Geschichten und Figuren</a></li></ul><h3>Fotos (Wikimedia Commons)</h3><ul><li>Katholische Kirche Spreitenbach, Zairon, <a href="https://commons.wikimedia.org/wiki/File:Spreitenbach_Katholische_Kirche_Innen_2.JPG" target="_blank" rel="noreferrer">CC BY-SA 3.0</a> (verkleinert)</li><li>Mihrab West Bay Mosque Doha, Zairon, <a href="https://commons.wikimedia.org/wiki/File:Doha_West_Bay_Jamia_Mosque_Interior_Mihrab.jpg" target="_blank" rel="noreferrer">CC BY 4.0</a> (verkleinert)</li><li>Middle Street Synagogue, The Voice of Hassocks, <a href="https://commons.wikimedia.org/wiki/File:Middle_Street_Synagogue,_Brighton_(May_2013)_-_General_Interior_View_with_Torah_Scrolls.jpg" target="_blank" rel="noreferrer">CC0 1.0</a> (verkleinert)</li></ul><p className="finePrint">Die Lerninhalte wurden auf das fotografierte Lernzielblatt eingegrenzt. Karten und Symbole sind vereinfachte Lernhilfen; religiöse Praxis ist vielfältig.</p></div></div>;
}
