'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cloudIsConfigured } from '../lib/supabase';
import { claimPairingCode, createAttempt, flushAttemptQueue, getConsolidatedProgress, getLinkedLearner, queueAndSyncAttempt, resetProgressWithPassword, saveProgressBackup, saveProgressBackupOnClose, touchLinkedDevice, type CloudState } from '../lib/progress-cloud';
import { buildAdaptiveRound, questions, shuffleIndices, topics, type ItemStat, type Topic } from '../lib/training';

type TopicStat = { attempts: number; correct: number };
type Progress = { stars: number; streak: number; bestStreak: number; totalAttempts: number; topics: Record<Topic, TopicStat>; items: Record<string, ItemStat> };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const emptyProgress = (): Progress => ({
  stars: 0, streak: 0, bestStreak: 0, totalAttempts: 0,
  topics: Object.fromEntries(topics.map((topic) => [topic, { attempts: 0, correct: 0 }])) as Record<Topic, TopicStat>,
  items: {},
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
    items: Object.fromEntries(Object.entries(source.items && typeof source.items === 'object' ? source.items : {}).map(([id, value]) => {
      const stat = value && typeof value === 'object' ? value as Partial<ItemStat> : {};
      return [id, { attempts: Math.max(0, Number(stat.attempts) || 0), correct: Math.max(0, Number(stat.correct) || 0) }];
    })),
  };
}


const religionRows = [
  ['Christentum', 'Kreuz', 'weltweit; Schwerpunkte u. a. Europa und Amerika', 'ein Gott', 'Kirche', 'Bibel'],
  ['Islam', 'Halbmond*', 'weltweit; Schwerpunkte u. a. Nordafrika, West- und Südasien', 'ein Gott (Allah)', 'Moschee', 'Koran'],
  ['Judentum', 'Davidstern', 'weltweit; besonders Israel und USA', 'ein Gott', 'Synagoge', 'Tora/Tanach'],
  ['Buddhismus', 'Dharma-Rad', 'Schwerpunkte in Ost- und Südostasien', 'kein Schöpfergott im Zentrum', 'Tempel', 'verschiedene Lehrtexte'],
  ['Hinduismus', 'Om', 'vor allem Indien und Südasien', 'vielfältige Gottesvorstellungen', 'Tempel', 'z. B. Veden'],
];

type ImageMarker = { id: string; label: string; x: number; y: number; hint: string };
type ImageMatchPlace = { id: string; title: string; code: string; image: string; alt: string; markers: ImageMarker[] };

const imageMatchPlaces: ImageMatchPlace[] = [
  {
    id: 'kirche', title: 'Kirche', code: 'B1', image: '/images/matching-kirche.jpg',
    alt: 'Beispielhafter Kirchenraum mit markierbaren Einrichtungsgegenständen',
    markers: [
      { id: 'orgel', label: 'Orgel', x: 24, y: 22, hint: 'Das grosse Instrument mit vielen Pfeifen.' },
      { id: 'kruzifix', label: 'Kruzifix', x: 52, y: 22, hint: 'Das Kreuz mit der Darstellung Jesu.' },
      { id: 'ambo', label: 'Ambo', x: 39, y: 53, hint: 'Das Lesepult für Bibeltexte und Predigt.' },
      { id: 'altar', label: 'Altar', x: 55, y: 55, hint: 'Der Tisch im Zentrum des Gottesdienstes.' },
      { id: 'tabernakel', label: 'Tabernakel', x: 68, y: 50, hint: 'Der verschliessbare Schrank für geweihte Hostien.' },
      { id: 'taufbecken', label: 'Taufbecken', x: 82, y: 58, hint: 'Das Becken, das bei der Taufe verwendet wird.' },
      { id: 'weihwasserbecken', label: 'Weihwasserbecken', x: 15, y: 77, hint: 'Das kleine Becken nahe beim Eingang.' },
    ],
  },
  {
    id: 'moschee', title: 'Moschee', code: 'B5', image: '/images/matching-moschee.jpg',
    alt: 'Beispielhafter Moscheeraum mit markierbaren Bauteilen und Gegenständen',
    markers: [
      { id: 'minarett', label: 'Minarett', x: 18, y: 22, hint: 'Der hohe Turm vieler Moscheen.' },
      { id: 'waschplatz', label: 'Waschplatz', x: 18, y: 46, hint: 'Der Ort für die rituelle Reinigung.' },
      { id: 'schuhregal', label: 'Schuhregal', x: 10, y: 74, hint: 'Hier werden Schuhe vor dem Gebetsraum abgestellt.' },
      { id: 'kuppel', label: 'Kuppel', x: 62, y: 10, hint: 'Das gewölbte Dach über dem Gebetsraum.' },
      { id: 'kalligrafie', label: 'Kalligrafie', x: 57, y: 31, hint: 'Künstlerisch gestaltete Schrift.' },
      { id: 'mihrab', label: 'Mihrab', x: 57, y: 47, hint: 'Die Gebetsnische zeigt die Richtung nach Mekka.' },
      { id: 'minbar', label: 'Minbar', x: 81, y: 47, hint: 'Die Kanzel mit Stufen für die Freitagspredigt.' },
      { id: 'gebetsteppich', label: 'Gebetsteppich', x: 58, y: 72, hint: 'Er kennzeichnet einen sauberen Gebetsplatz.' },
    ],
  },
  {
    id: 'synagoge', title: 'Synagoge', code: 'B3', image: '/images/matching-synagoge.jpg',
    alt: 'Beispielhafter Synagogenraum mit markierbaren Einrichtungen und Gebetsgegenständen',
    markers: [
      { id: 'ewiges-licht', label: 'Ewiges Licht', x: 50, y: 9, hint: 'Dieses Licht brennt nahe beim Toraschrein.' },
      { id: 'chanukka-leuchter', label: 'Chanukka-Leuchter', x: 17, y: 34, hint: 'Er hat acht Festlichter; hinzu kommt das Dienerlicht Schamasch.' },
      { id: 'toraschrein', label: 'Toraschrein', x: 51, y: 31, hint: 'Der Schrein bewahrt die Torarollen auf.' },
      { id: 'torarolle', label: 'Torarolle', x: 51, y: 45, hint: 'Die handgeschriebene Pergamentrolle der Tora.' },
      { id: 'bima', label: 'Bima', x: 52, y: 54, hint: 'Das erhöhte Podium für die Toralesung.' },
      { id: 'siddur', label: 'Siddur', x: 70, y: 45, hint: 'Das jüdische Gebetbuch.' },
      { id: 'tallit', label: 'Tallit', x: 78, y: 53, hint: 'Der Gebetsschal mit besonderen Fransen.' },
      { id: 'tefillin', label: 'Tefillin', x: 85, y: 51, hint: 'Lederkapseln mit Riemen und Toratexten.' },
      { id: 'kippa', label: 'Kippa', x: 91, y: 52, hint: 'Die kleine Kopfbedeckung.' },
      { id: 'mesusa', label: 'Mesusa', x: 95, y: 27, hint: 'Die Hülse mit Pergamenttext am Türpfosten.' },
    ],
  },
];

const srfVideos = [
  {
    id: 'christentum', symbol: '✝', religion: 'Christentum', duration: '6 Min.',
    title: 'Weltreligion Christentum erklärt',
    summary: 'Bibel, Jesus, Dreifaltigkeit sowie wichtige christliche Feste und Konfessionen.',
    embed: 'https://www.srf.ch/play/embed?urn=urn:srf:video:1ada563d-4dab-47e7-a063-a800e504bc0f',
    source: 'https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/weltreligion-christentum-erklaert?urn=urn%3Asrf%3Avideo%3A1ada563d-4dab-47e7-a063-a800e504bc0f',
  },
  {
    id: 'islam', symbol: '☾', religion: 'Islam', duration: '6 Min.',
    title: 'Weltreligion Islam erklärt',
    summary: 'Koran, Prophet Mohammed, Ramadan und die fünf Säulen des Islams.',
    embed: 'https://www.srf.ch/play/embed?urn=urn:srf:video:9fe9156a-a088-4890-9799-345db731e30c',
    source: 'https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/weltreligion-islam-erklaert?urn=urn%3Asrf%3Avideo%3A9fe9156a-a088-4890-9799-345db731e30c',
  },
  {
    id: 'judentum', symbol: '✡', religion: 'Judentum', duration: '6 Min.',
    title: 'Weltreligion Judentum erklärt',
    summary: 'Tora, Schabbat, jüdische Feste und die Bedeutung koscherer Speisen.',
    embed: 'https://www.srf.ch/play/embed?urn=urn:srf:video:2f52edd1-e7b1-4d16-8856-f46bac5d09bf',
    source: 'https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/weltreligion-judentum-erklaert?urn=urn%3Asrf%3Avideo%3A2f52edd1-e7b1-4d16-8856-f46bac5d09bf',
  },
] as const;

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
  const [roundIds, setRoundIds] = useState<string[]>(() => buildAdaptiveRound('Alle', {}));
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundResults, setRoundResults] = useState<Record<string, boolean>>({});
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundMode, setRoundMode] = useState<'adaptive' | 'mistakes'>('adaptive');
  const [optionOrder, setOptionOrder] = useState<number[]>(() => shuffleIndices(3));
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
    if (saved) { try { loaded = normalizeProgress(JSON.parse(saved)); } catch { /* start fresh */ } }
    queueMicrotask(() => { setProgress(loaded); setReady(true); });
    if (cloudIsConfigured()) {
      getLinkedLearner().then(async (linked) => {
        if (!linked) { setCloudState('unlinked'); return; }
        setLearnerId(linked.id);
        await touchLinkedDevice(linked.id);
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
    const syncOnline = () => { getLinkedLearner().then(async (linked) => { if (!linked) { setLearnerId(null); setCloudState('unlinked'); return; } setLearnerId(linked.id); await touchLinkedDevice(linked.id); const state = await flushAttemptQueue(); setCloudState(state); if (state === 'synced') { const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(linked.id)); setProgress(consolidated); await saveProgressBackup(linked.id, consolidated, 'reconnected'); sessionDirty.current = false; } }).catch(() => setCloudState('error')); };
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
        const linked = await getLinkedLearner();
        if (!linked || linked.id !== learnerId) {
          setLearnerId(null); setCloudState('unlinked'); return;
        }
        await touchLinkedDevice(learnerId);
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
  const displayedCorrectIndex = optionOrder.indexOf(current.answer);
  const correct = selected === displayedCorrectIndex;
  const mistakeIds = useMemo(() => questions.filter((question) => {
    const stat = progress.items[question.id];
    return stat && stat.attempts > 0 && stat.correct / stat.attempts < 0.8;
  }).map((question) => question.id), [progress.items]);
  const roundCorrect = Object.values(roundResults).filter(Boolean).length;
  const poolSize = roundMode === 'mistakes' ? roundIds.length : questions.filter((question) => filter === 'Alle' || question.topic === filter).length;

  function showQuestion(id: string) {
    const next = questions.find((question) => question.id === id) ?? questions[0];
    setCurrentId(next.id);
    setOptionOrder(shuffleIndices(next.options.length));
    setSelected(null);
    setLocked(false);
  }

  function chooseNext() {
    const nextIndex = roundIndex + 1;
    if (nextIndex >= roundIds.length) {
      setRoundComplete(true);
      setSelected(null);
      setLocked(false);
      return;
    }
    setRoundIndex(nextIndex);
    showQuestion(roundIds[nextIndex]);
  }

  function answer(index: number) {
    if (locked) return;
    setSelected(index); setLocked(true);
    const isCorrect = optionOrder[index] === current.answer;
    setRoundResults((old) => ({ ...old, [current.id]: isCorrect }));
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
      const item = old.items[current.id] ?? { attempts: 0, correct: 0 };
      return { ...old, stars: old.stars + (isCorrect ? 5 : 1), streak, bestStreak: Math.max(old.bestStreak, streak), totalAttempts: old.totalAttempts + 1, topics: { ...old.topics, [current.topic]: { attempts: topic.attempts + 1, correct: topic.correct + (isCorrect ? 1 : 0) } }, items: { ...old.items, [current.id]: { attempts: item.attempts + 1, correct: item.correct + (isCorrect ? 1 : 0) } } };
    });
  }

  function startTraining(topic: Topic | 'Alle' = 'Alle', onlyIds?: string[]) {
    const ids = buildAdaptiveRound(topic, progress.items, { onlyIds, size: onlyIds?.length });
    if (!ids.length) return;
    setFilter(topic); setSection('training'); setRoundMode(onlyIds ? 'mistakes' : 'adaptive');
    setRoundIds(ids); setRoundIndex(0); setRoundResults({}); setRoundComplete(false);
    showQuestion(ids[0]);
    setTimeout(() => document.getElementById('content')?.scrollIntoView({ behavior: 'smooth' }), 30);
  }

  function startMistakeTraining() {
    startTraining('Alle', mistakeIds);
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
      await touchLinkedDevice(id);
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
        <nav className="desktopNav" aria-label="Hauptnavigation">{[['start','Start'],['lernen','Lernen'],['bildquiz','Bild-Quiz'],['training','Trainieren'],['progress','Fortschritt']].map(([key,label]) => <button key={key} className={section === key ? 'navButton active' : 'navButton'} onClick={() => key === 'training' ? startTraining('Alle') : setSection(key)}>{label}</button>)}</nav>
        <div className="topActions"><button className={`cloudButton ${cloudState}`} onClick={() => setShowSync(true)}><span>●</span>{cloudState === 'synced' ? 'Mit Eltern verbunden' : cloudState === 'offline' ? 'Offline · wird später gesendet' : 'Fortschritt verbinden'}</button><button className="installButton" onClick={installApp}>＋ App installieren</button></div>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy"><p className="eyebrow">NMG · PRÜFUNG TEIL 1 · 6. KLASSE</p><h1>Hallo David. Bereit für deine nächste Mission?</h1><p className="lede">Lerne die fünf Weltreligionen kennen und trainiere Christentum, Islam und Judentum besonders genau. Kurze Etappen, sofortiges Feedback, kein Prüfungsstress.</p><div className="buttonRow"><button className="primaryButton" onClick={() => startTraining('Alle')}>Training starten <span>→</span></button><button className="secondaryButton" onClick={() => setSection('lernen')}>Erst lernen</button></div></div>
        <aside className="progressCard" aria-label="Lernfortschritt"><div className="orbit" style={{'--progress': `${overall * 3.6}deg`} as React.CSSProperties}><span>✦</span><b>{overall}%</b></div><div><p className="tinyLabel">DEIN WEG</p><h2>{level}</h2><p>{progress.totalAttempts ? `${progress.totalAttempts} Fragen gelöst · ${progress.stars} Sterne` : 'Löse die erste Frage und sammle deinen ersten Stern.'}</p></div></aside>
      </section>

      <div className="mobileNav" aria-label="Mobile Navigation">{[['start','⌂','Start'],['lernen','◫','Lernen'],['bildquiz','◎','Bild-Quiz'],['training','✦','Training'],['progress','◔','Fortschritt']].map(([key,icon,label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => key === 'training' ? startTraining('Alle') : setSection(key)}><span>{icon}</span>{label}</button>)}</div>

      <section id="content" className="contentShell">
        {section === 'start' && <Dashboard progress={progress} onStart={startTraining} />}
        {section === 'lernen' && <Learn onStart={startTraining} onImageMatch={() => setSection('bildquiz')} />}
        {section === 'bildquiz' && <ImageMatchingQuiz />}
        {section === 'training' && <section className="mission">
          <div className="missionTop"><div><p className="eyebrow">{roundMode === 'mistakes' ? 'FEHLER GEZIELT ÜBEN' : 'ADAPTIVES TRAINING'}</p><h2>{roundComplete ? 'Runde geschafft!' : current.topic}</h2></div><span className="starPill">✦ {progress.stars}</span></div>
          <div className="filterRow">{(['Alle', ...topics] as const).map((topic) => <button key={topic} className={filter === topic && roundMode === 'adaptive' ? 'chip active' : 'chip'} onClick={() => startTraining(topic)}>{topic}</button>)}{mistakeIds.length > 0 && <button className={roundMode === 'mistakes' ? 'chip active mistakeChip' : 'chip mistakeChip'} onClick={startMistakeTraining}>↻ Fehler üben ({mistakeIds.length})</button>}</div>
          {roundComplete ? <div className="roundSummary" role="status"><span className="roundTrophy" aria-hidden="true">{roundCorrect === roundIds.length ? '🏆' : '🌟'}</span><h3>{roundCorrect} von {roundIds.length} richtig</h3><p>{roundCorrect === roundIds.length ? 'Perfekt – jede Frage dieser Runde war richtig.' : 'Die Runde ist beendet. Keine Frage wurde doppelt gezählt.'}</p><div className="roundActions">{Object.values(roundResults).some((value) => !value) && <button className="primaryButton small" onClick={() => startTraining(filter, Object.entries(roundResults).filter(([, value]) => !value).map(([id]) => id))}>Fehler dieser Runde üben</button>}<button className="secondaryButton" onClick={() => startTraining(filter)}>Neue adaptive Runde</button></div></div> : <>
            <div className="roundProgress"><span>Frage {roundIndex + 1} von {roundIds.length} · Pool: {poolSize}</span><div className="wideBar"><span style={{ width: `${((roundIndex + (locked ? 1 : 0)) / roundIds.length) * 100}%` }}/></div></div>
            <p className="question">{current.prompt}</p>
            <div className="answerGrid">{optionOrder.map((originalIndex, index) => { const option = current.options[originalIndex]; const state = locked ? index === displayedCorrectIndex ? ' correct' : index === selected ? ' wrong' : '' : selected === index ? ' active' : ''; return <button className={`answer${state}`} key={`${current.id}-${originalIndex}`} onClick={() => answer(index)} disabled={locked}><span className="choiceLetter">{String.fromCharCode(65 + index)}</span>{option}</button>; })}</div>
            {locked && <div className={correct ? 'feedback success' : 'feedback retry'} role="status"><strong>{correct ? 'Stark! +5 Sterne' : 'Guter Versuch. +1 Stern'}</strong><span>{current.explanation}</span></div>}
            <div className="missionFooter"><span>{progress.streak >= 2 ? `🔥 ${progress.streak} richtige Antworten in Folge` : 'Schwierige Fragen kommen in späteren Runden häufiger zurück.'}</span><button className="primaryButton small" onClick={chooseNext} disabled={!locked}>{roundIndex + 1 === roundIds.length ? 'Runde abschliessen →' : 'Nächste Frage →'}</button></div>
          </>}
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

function Learn({ onStart, onImageMatch }: { onStart: (topic: Topic | 'Alle') => void; onImageMatch: () => void }) {
  return <><div className="sectionHeading"><div><p className="eyebrow">LERNKARTEN</p><h2>Das musst du wirklich können</h2></div><button className="primaryButton small" onClick={() => onStart('Alle')}>Wissen testen →</button></div>
    <section className="studyBlock"><div className="blockTitle"><span>01</span><div><h3>Die fünf Weltreligionen</h3><p>Der gemeinsame Überblick für Teil 1 und Teil 2</p></div></div><div className="tableWrap"><table><thead><tr><th>Religion</th><th>Symbol</th><th>Verbreitung</th><th>Gottesvorstellung</th><th>Gebäude</th><th>Schrift</th></tr></thead><tbody>{religionRows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><p className="finePrint">* Der Halbmond ist ein verbreitetes kulturelles Zeichen des Islams, aber kein überall verbindliches offizielles Symbol. Für die Prüfung gilt die Zuordnung im Lernheft.</p></section>
    <section className="studyBlock"><div className="blockTitle"><span>02</span><div><h3>Die drei Prüfungsreligionen</h3><p>Gemeinsamkeiten erkennen, Unterschiede sachlich benennen</p></div></div><div className="religionGrid"><ReligionCard symbol="✝" name="Christentum" color="violet" facts={['Gott: ein Gott · Dreifaltigkeit','Schrift: Bibel','Gebäude: Kirche','Wichtige Person: Jesus Christus','Bräuche: Gebet, Gottesdienst, Weihnachten, Ostern','Regeln: Nächstenliebe, Zehn Gebote']} onStart={() => onStart('Christentum')} /><ReligionCard symbol="☾" name="Islam" color="green" facts={['Gott: Allah (arabisch: Gott)','Schrift: Koran','Gebäude: Moschee','Wichtige Person: Prophet Mohammed','Bräuche: Gebet, Ramadan, Feste','Regeln: fünf Säulen']} onStart={() => onStart('Islam')} /><ReligionCard symbol="✡" name="Judentum" color="blue" facts={['Gott: ein Gott','Schrift: Tora/Tanach','Gebäude: Synagoge','Wichtige Personen: z. B. Abraham, Mose','Bräuche: Schabbat, Feste','Regeln: Gebote, koschere Lebensweise']} onStart={() => onStart('Judentum')} /></div><aside className="memoryLine"><strong>3er-Merksatz:</strong> Kirche–Bibel–Jesus · Moschee–Koran–Mohammed · Synagoge–Tora–Mose</aside><ReligiousLeaders /></section>
    <Timeline /><Buildings onStart={onStart} onImageMatch={onImageMatch} /><AdditionalVideos /></>;
}

function ReligionCard({ symbol, name, color, facts, onStart }: { symbol: string; name: string; color: string; facts: string[]; onStart: () => void }) {
  return <article className={`religionCard ${color}`}><div className="symbolCircle">{symbol}</div><h4>{name}</h4><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul><button onClick={onStart}>Dazu trainieren →</button></article>;
}

function ReligiousLeaders() {
  const groups = [
    { symbol:'✝', religion:'Christentum', people:[['Priester','leitet in der katholischen Kirche die Messe und feiert die Eucharistie.'],['Pfarrer / Pfarrerin','leitet gewöhnlich den evangelischen Gottesdienst.'],['Papst','ist das Oberhaupt der römisch-katholischen Kirche.']] },
    { symbol:'☾', religion:'Islam', people:[['Imam','leitet das gemeinschaftliche Gebet und hält häufig die Freitagspredigt.'],['Muezzin','ruft zum Gebet; er ist nicht der Gebetsleiter.']] },
    { symbol:'✡', religion:'Judentum', people:[['Rabbiner / Rabbinerin','leitet laut Arbeitsblatt den Gottesdienst und lehrt und erklärt die jüdische Tradition; diese Rolle ist kein Priesteramt.'],['Kantor / Kantorin','stimmt den Gesang an und leitet den liturgischen Gesang in der Synagoge.']] },
  ];
  return <div className="leadersStudy"><div className="leadersHeading"><p className="eyebrow">WER ÜBERNIMMT WELCHE AUFGABE?</p><h4>Religiöse Verantwortliche</h4><p>Die Rollen ähneln sich teilweise, sind aber keine direkten Übersetzungen voneinander.</p></div><div className="leadersGrid">{groups.map((group) => <article key={group.religion}><div className="leaderReligion"><span>{group.symbol}</span><strong>{group.religion}</strong></div>{group.people.map(([name, role]) => <div className="leaderPerson" key={name}><strong>{name}</strong><p>{role}</p></div>)}</article>)}</div></div>;
}

function Timeline() {
  return <section className="studyBlock"><div className="blockTitle"><span>03</span><div><h3>Jesus und Mohammed</h3><p>Glaube und Geschichte respektvoll unterscheiden</p></div></div><div className="timelineColumns"><article><p className="eyebrow">JESUS · CHRISTENTUM</p>{[['vor über 2000 Jahren','Jude aus Nazareth; nach den Evangelien Geburt in Bethlehem'],['ca. 30 Jahre','Wanderprediger; spricht von Gottes Liebe und Nächstenliebe'],['ca. 33','Kreuzigung in Jerusalem'],['nach christlichem Glauben','Auferstehung am dritten Tag; später Himmelfahrt']].map(([when,what]) => <div className="timeItem" key={when}><strong>{when}</strong><span>{what}</span></div>)}</article><article><p className="eyebrow">MOHAMMED · ISLAM</p>{[['ca. 570','Geburt in Mekka; früh Waise, später Händler'],['ca. 610','laut islamischer Überlieferung erste Offenbarung durch Gabriel in der Höhle Hira'],['622','Auswanderung von Mekka nach Medina (Hidschra)'],['632','Tod in Medina; Offenbarungen werden später im Koran gesammelt']].map(([when,what]) => <div className="timeItem" key={when}><strong>{when}</strong><span>{what}</span></div>)}</article></div><p className="sourceNote">Prüfungs-Tipp: Formuliere „Christinnen und Christen glauben …“ oder „Nach islamischer Überlieferung …“, wenn du eine Glaubensaussage erklärst.</p></section>;
}

function Buildings({ onStart, onImageMatch }: { onStart: (topic: Topic | 'Alle') => void; onImageMatch: () => void }) {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [activeMarker, setActiveMarker] = useState(imageMatchPlaces[0].markers[0].id);
  const [showMarkers, setShowMarkers] = useState(true);
  const place = imageMatchPlaces[placeIndex];

  function choosePlace(index: number) {
    setPlaceIndex(index);
    setActiveMarker(imageMatchPlaces[index].markers[0].id);
  }

  return <section className="studyBlock"><div className="blockTitle"><span>04</span><div><h3>Heilige Räume erkennen</h3><p>Entdecke die Gegenstände im Bild und lerne ihre Bedeutung</p></div></div>
    <div className="roomExplorerToolbar"><div className="placeTabs studyPlaceTabs" role="tablist" aria-label="Heiligen Raum zum Lernen wählen">{imageMatchPlaces.map((item, index) => <button key={item.id} role="tab" aria-selected={index === placeIndex} className={index === placeIndex ? 'placeTab active' : 'placeTab'} onClick={() => choosePlace(index)}><span>{item.code}</span>{item.title}</button>)}</div><button type="button" className={`markerToggle${showMarkers ? '' : ' hidden'}`} aria-pressed={!showMarkers} onClick={() => setShowMarkers((value) => !value)}><span>{showMarkers ? '◉' : '◎'}</span>{showMarkers ? 'Markierungen ausblenden' : 'Markierungen anzeigen'}</button></div>
    <div className="roomExplorer">
      <div className="studyAnnotatedImage">
        <img src={place.image} alt={place.alt}/>
        {showMarkers && place.markers.map((marker, index) => <button key={marker.id} type="button" className={`studyMarker${activeMarker === marker.id ? ' active' : ''}${marker.x > 76 ? ' edge' : ''}${marker.y > 68 ? ' low' : ''}`} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-label={`${index + 1}: ${marker.label}. ${marker.hint}`} aria-pressed={activeMarker === marker.id} onMouseEnter={() => setActiveMarker(marker.id)} onFocus={() => setActiveMarker(marker.id)} onClick={() => setActiveMarker(marker.id)}><span>{index + 1}</span><small><strong>{marker.label}</strong>{marker.hint}</small></button>)}
      </div>
      <div className="roomLegend"><div className="roomLegendHeading"><p className="eyebrow">{place.code} · {place.title.toUpperCase()}</p><h4>Begriffe im Bild</h4><p>Tippe auf einen Begriff oder einen Punkt im Bild.</p></div>{place.markers.map((marker, index) => <button key={marker.id} type="button" className={activeMarker === marker.id ? 'roomLegendItem active' : 'roomLegendItem'} onMouseEnter={() => setActiveMarker(marker.id)} onFocus={() => setActiveMarker(marker.id)} onClick={() => setActiveMarker(marker.id)}><span>{index + 1}</span><div><strong>{marker.label}</strong><small>{marker.hint}</small></div></button>)}</div>
    </div>
    <p className="finePrint roomStudyNote">Die Bilder zeigen beispielhafte Räume. Ausstattung und Anordnung können je nach Ort und Tradition unterschiedlich sein.</p>
    <div className="buttonRow"><button className="primaryButton small" onClick={onImageMatch}>Jetzt ohne Hilfe zuordnen →</button><button className="secondaryButton" onClick={() => onStart('Gebäude & Schriften')}>Fragen-Quiz starten</button></div>
  </section>;
}

function AdditionalVideos() {
  const [activeId, setActiveId] = useState<(typeof srfVideos)[number]['id']>('christentum');
  const video = srfVideos.find((item) => item.id === activeId) ?? srfVideos[0];

  return <section className="studyBlock videoStudyBlock"><div className="blockTitle"><span>05</span><div><h3>Die drei Religionen im Video</h3><p>Zusatzmaterial von SRF Kids · Clip und klar!</p></div></div>
    <div className="videoSelector" role="tablist" aria-label="Religion für das Lernvideo wählen">{srfVideos.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === activeId} className={item.id === activeId ? 'videoSelect active' : 'videoSelect'} onClick={() => setActiveId(item.id)}><span>{item.symbol}</span><div><strong>{item.religion}</strong><small>{item.duration}</small></div></button>)}</div>
    <article className="srfVideoStage"><div className="srfVideoIntro"><div><p className="eyebrow">{video.religion.toUpperCase()} · ZUSATZMATERIAL</p><h4>{video.title}</h4><p>{video.summary}</p></div><span className="srfBadge">SRF Kids</span></div><div className="srfVideoFrame"><iframe key={video.id} src={video.embed} title={`SRF Kids: ${video.title}`} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen /></div><div className="srfVideoFooter"><p>Das Video läuft direkt auf dieser Lernseite. Wähle oben eine andere Religion, um den Film zu wechseln.</p><a href={video.source} target="_blank" rel="noreferrer">Original bei SRF öffnen ↗</a></div></article>
  </section>;
}

function ImageMatchingQuiz() {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [activeMarker, setActiveMarker] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState(0);
  const [showMarkers, setShowMarkers] = useState(true);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'retry' | 'info'; text: string }>({ tone: 'info', text: 'Wähle zuerst eine Nummer im Bild.' });
  const place = imageMatchPlaces[placeIndex];
  const solvedCount = Object.keys(matches).length;
  const complete = solvedCount === place.markers.length;
  const words = useMemo(() => [...place.markers].sort((a, b) => a.label.localeCompare(b.label, 'de')), [place]);

  function resetRound(nextIndex = placeIndex) {
    setPlaceIndex(nextIndex);
    setActiveMarker(null);
    setMatches({});
    setAttempts(0);
    setFeedback({ tone: 'info', text: 'Wähle zuerst eine Nummer im Bild.' });
  }

  function chooseMarker(id: string) {
    if (matches[id]) return;
    setActiveMarker(id);
    setFeedback({ tone: 'info', text: 'Gut. Wähle jetzt den passenden Begriff.' });
  }

  function toggleMarkers() {
    setShowMarkers((visible) => {
      if (visible) {
        setActiveMarker(null);
        setFeedback({ tone: 'info', text: 'Bild ohne Markierungen: Schau dir den Raum in Ruhe an.' });
      } else {
        setFeedback({ tone: 'info', text: 'Wähle zuerst eine Nummer im Bild.' });
      }
      return !visible;
    });
  }

  function chooseWord(label: string) {
    if (!activeMarker) {
      setFeedback({ tone: 'retry', text: 'Tippe zuerst auf eine freie Nummer im Bild.' });
      return;
    }
    const marker = place.markers.find((item) => item.id === activeMarker);
    if (!marker) return;
    setAttempts((value) => value + 1);
    if (marker.label === label) {
      setMatches((old) => ({ ...old, [marker.id]: label }));
      setActiveMarker(null);
      setFeedback({ tone: 'success', text: `Richtig: ${label}. ${marker.hint}` });
    } else {
      setFeedback({ tone: 'retry', text: `Noch nicht. Tipp: ${marker.hint}` });
    }
  }

  const usedLabels = new Set(Object.values(matches));
  return <section className="imageQuizShell">
    <div className="sectionHeading imageQuizHeading"><div><p className="eyebrow">NEU · BILD UND WORT</p><h2>Was gehört wohin?</h2></div><p>Tippe auf eine Nummer im Bild und danach auf den passenden deutschen Begriff. Ein Hinweis hilft dir, wenn die Zuordnung noch nicht stimmt.</p></div>
    <div className="placeTabs" role="tablist" aria-label="Religiösen Raum wählen">{imageMatchPlaces.map((item, index) => <button key={item.id} role="tab" aria-selected={index === placeIndex} className={index === placeIndex ? 'placeTab active' : 'placeTab'} onClick={() => resetRound(index)}><span>{item.code}</span>{item.title}</button>)}</div>
    <div className="imageMatchCard">
      <div className="imageMatchTop"><div><p className="eyebrow">{place.code} · PRÜFUNG TEIL 1</p><h3>{place.title}</h3></div><div className="imageMatchActions"><div className="matchScore"><strong>{solvedCount}/{place.markers.length}</strong><span>zugeordnet</span></div><button type="button" className={`markerToggle${showMarkers ? '' : ' hidden'}`} aria-pressed={!showMarkers} onClick={toggleMarkers}><span>{showMarkers ? '◉' : '◎'}</span>{showMarkers ? 'Bild frei ansehen' : 'Nummern anzeigen'}</button></div></div>
      <div className="imageMatchLayout">
        <div className="annotatedImage">
          <img src={place.image} alt={place.alt}/>
          {showMarkers && place.markers.map((marker, index) => <button key={marker.id} type="button" aria-label={`Markierung ${index + 1}`} aria-pressed={activeMarker === marker.id} disabled={Boolean(matches[marker.id])} className={`imageMarker${activeMarker === marker.id ? ' active' : ''}${matches[marker.id] ? ' matched' : ''}`} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} onClick={() => chooseMarker(marker.id)}><span>{index + 1}</span>{matches[marker.id] && <b>✓</b>}</button>)}
        </div>
        <aside className="wordBank" aria-label="Wortbank"><div><p className="eyebrow">WORTBANK</p><h4>Passenden Begriff wählen</h4></div><div className="wordChoices">{words.map((word) => <button key={word.id} type="button" disabled={usedLabels.has(word.label)} className={usedLabels.has(word.label) ? 'wordChoice matched' : 'wordChoice'} onClick={() => chooseWord(word.label)}>{usedLabels.has(word.label) && <span>✓</span>}{word.label}</button>)}</div></aside>
      </div>
      <div className={`matchFeedback ${feedback.tone}`} role="status"><span>{feedback.tone === 'success' ? '✓' : feedback.tone === 'retry' ? '?' : '1–2'}</span><p>{complete ? `Alles richtig! Du hast ${place.markers.length} Begriffe in ${attempts} Versuchen zugeordnet.` : feedback.text}</p></div>
      <div className="imageMatchFooter"><span>Die Bilder zeigen beispielhafte Räume; Aussehen und Ausstattung können je nach Ort und Tradition variieren.</span><button className="secondaryButton" onClick={() => resetRound()}>↻ Neu beginnen</button></div>
    </div>
  </section>;
}

function ProgressView({ progress, overall, level, onReset, onStart, cloudState, onConnect }: { progress: Progress; overall: number; level: string; onReset: () => void; onStart: (topic: Topic | 'Alle') => void; cloudState: CloudState; onConnect: () => void }) {
  const weakest = [...topics].sort((a,b) => ratio(progress.topics[a]) - ratio(progress.topics[b]))[0];
  return <><div className="sectionHeading"><div><p className="eyebrow">FORTSCHRITT</p><h2>{level}: {overall}%</h2></div><button className="primaryButton small" onClick={() => onStart(weakest)}>Schwächstes Thema üben →</button></div><button className={`syncBanner ${cloudState}`} onClick={onConnect}><span>{cloudState === 'synced' ? '✓' : cloudState === 'offline' ? '↻' : '☁'}</span><div><strong>{cloudState === 'synced' ? 'Sicher mit dem Elternbereich verbunden' : cloudState === 'offline' ? 'Offline – Ergebnisse warten sicher' : 'Fortschritt mit den Eltern teilen'}</strong><p>{cloudState === 'synced' ? 'Der gemeinsame Stand wird auf allen verbundenen Geräten aktualisiert.' : cloudState === 'offline' ? 'Die Synchronisierung läuft weiter, sobald Internet da ist.' : 'Ein einmaliger Code genügt. Du brauchst keine E-Mail.'}</p></div><b>→</b></button><div className="statGrid"><article><span>✦</span><strong>{progress.stars}</strong><p>Sterne gesammelt</p></article><article><span>🔥</span><strong>{progress.bestStreak}</strong><p>Beste Serie</p></article><article><span>✓</span><strong>{progress.totalAttempts}</strong><p>Fragen gelöst</p></article></div><section className="masteryCard"><h3>Themen-Meisterschaft</h3>{topics.map((topic) => { const stat=progress.topics[topic]; const p=percent(stat); return <div className="masteryRow" key={topic}><div><strong>{topic}</strong><span>{stat.attempts ? `${stat.correct} von ${stat.attempts} richtig` : 'noch nicht begonnen'}</span></div><div className="wideBar"><span style={{width:`${p}%`}} /></div><b>{p}%</b></div>; })}</section><div className="badgeGrid"><Badge active={progress.totalAttempts >= 1} icon="🌱" title="Erster Schritt" copy="1 Frage gelöst"/><Badge active={progress.bestStreak >= 5} icon="🔥" title="Heisse Serie" copy="5-mal in Folge richtig"/><Badge active={topics.filter(t => percent(progress.topics[t]) >= 80).length >= 3} icon="🧭" title="Weltenkenner" copy="3 Themen über 80%"/><Badge active={progress.stars >= 180} icon="🏆" title="Prüfungsbereit" copy="180 Sterne gesammelt"/></div><button className="dangerLink" onClick={onReset}>Gesamten Fortschritt geschützt zurücksetzen</button></>;
}

function Badge({active,icon,title,copy}:{active:boolean;icon:string;title:string;copy:string}) { return <article className={active ? 'badge active' : 'badge'}><span>{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></article>; }

function Sources({ onClose }: { onClose: () => void }) {
  return <div className="modalBackdrop"><div className="modal sourcesModal" role="dialog" aria-modal="true"><button className="modalClose" onClick={onClose}>×</button><p className="eyebrow">TRANSPARENZ</p><h2>Quellen & Bildnachweise</h2><h3>Fachliche Grundlage</h3><ul><li><a href="https://zg.ch/de/bildung/schulen/gemeindliche-schulen/unterricht/lehrplan21" target="_blank" rel="noreferrer">Kanton Zug: Lehrplan 21</a></li><li><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C5" target="_blank" rel="noreferrer">NMG.12.5 – Sich in der Vielfalt religiöser Traditionen orientieren</a></li><li><a href="https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C2" target="_blank" rel="noreferrer">NMG.12.2 – Religiöse Sprachformen, Geschichten und Figuren</a></li></ul><h3>Lernillustrationen</h3><p>Die drei Raumillustrationen wurden eigens für diese Lernanwendung erstellt und anhand der fotografierten Arbeitsblätter fachlich geprüft.</p><p className="finePrint">Die Lerninhalte wurden auf das fotografierte Lernzielblatt eingegrenzt. Bilder, Karten und Symbole sind vereinfachte Lernhilfen; religiöse Praxis ist vielfältig.</p></div></div>;
}
