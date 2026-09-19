'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { cloudIsConfigured, getSupabaseClient } from '../lib/supabase';
import { claimPairingCode, createAttempt, getConsolidatedProgress, getLinkedLearner, queueAndSyncAttempt, resetProgressWithPassword, saveProgressBackup, touchLinkedDevice, type CloudState } from '../lib/progress-cloud';
import { buildAdaptiveRound, questions, shuffleIndices, topics, type ItemStat, type Topic } from '../lib/training';

type TopicStat = { attempts: number; correct: number };
type Progress = { stars: number; streak: number; bestStreak: number; totalAttempts: number; topics: Record<Topic, TopicStat>; items: Record<string, ItemStat> };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
type Section = 'start' | 'lernen' | 'zuordnen' | 'training' | 'progress';
const STORAGE_KEY = 'davids-nmg-religionen-teil-2-progress-v1';
const PARENT_LOGIN_PENDING_KEY = 'nmg-parent-login-pending';

const emptyProgress = (): Progress => ({ stars: 0, streak: 0, bestStreak: 0, totalAttempts: 0, topics: Object.fromEntries(topics.map((topic) => [topic, { attempts: 0, correct: 0 }])) as Record<Topic, TopicStat>, items: {} });
function normalizeProgress(value: unknown): Progress {
  const source = value && typeof value === 'object' ? value as Partial<Progress> : {};
  const sourceTopics = source.topics && typeof source.topics === 'object' ? source.topics as Partial<Record<Topic, Partial<TopicStat>>> : {};
  return { stars: Math.max(0, Number(source.stars) || 0), streak: Math.max(0, Number(source.streak) || 0), bestStreak: Math.max(0, Number(source.bestStreak) || 0), totalAttempts: Math.max(0, Number(source.totalAttempts) || 0), topics: Object.fromEntries(topics.map((topic) => [topic, { attempts: Math.max(0, Number(sourceTopics[topic]?.attempts) || 0), correct: Math.max(0, Number(sourceTopics[topic]?.correct) || 0) }])) as Record<Topic, TopicStat>, items: Object.fromEntries(Object.entries(source.items && typeof source.items === 'object' ? source.items : {}).map(([id, value]) => { const stat = value && typeof value === 'object' ? value as Partial<ItemStat> : {}; return [id, { attempts: Math.max(0, Number(stat.attempts) || 0), correct: Math.max(0, Number(stat.correct) || 0) }]; })) };
}

const srfVideos = [
  { id: 'buddhismus', symbol: '☸', religion: 'Buddhismus', duration: '6 Min.', title: 'Die Weltreligion Buddhismus', summary: 'Buddhas Weg, die vier edlen Wahrheiten, Meditation und das Ziel Nirvana – passend zu den markierten Lernzielen.', embed: 'https://www.srf.ch/play/embed?urn=urn:srf:video:108463a7-a364-4397-906a-51f07867d885', source: 'https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/die-weltreligion-buddhismus?urn=urn%3Asrf%3Avideo%3A108463a7-a364-4397-906a-51f07867d885' },
  { id: 'hinduismus', symbol: 'ॐ', religion: 'Hinduismus', duration: '6 Min.', title: 'Die Weltreligion Hinduismus', summary: 'Gottheiten, Wiedergeburt, Karma und religiöser Alltag – ein kompakter Einstieg von SRF Kids.', embed: 'https://www.srf.ch/play/embed?urn=urn:srf:video:cb5925cd-6358-4659-bca5-e96ad0b0ddd1', source: 'https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/die-weltreligion-hinduismus?urn=urn%3Asrf%3Avideo%3Acb5925cd-6358-4659-bca5-e96ad0b0ddd1' },
] as const;

const matchingSets = [
  { kind: 'sequence', title: 'Buddhas Weg', subtitle: 'Baue Buddhas Lebensweg Schritt für Schritt auf.', items: ['Geschütztes Leben im Palast', 'Vier Begegnungen mit dem Leid', 'Auszug und Suche', 'Extreme Askese', 'Mittlerer Weg', 'Erwachen unter dem Bodhi-Baum', 'Lehren bis ins hohe Alter'] },
  { kind: 'sequence', title: 'Vier Wahrheiten', subtitle: 'Baue die vier Wahrheiten vom Problem bis zum Weg auf.', items: ['Leiden und Unzufriedenheit gehören zum Leben.', 'Gier, Hass und Unwissenheit verursachen Leiden.', 'Die Ursachen des Leidens können enden.', 'Der achtfache Pfad zeigt den Weg.'] },
  { kind: 'pairs', title: 'Gottheiten', subtitle: 'Lies die Beschreibung und wähle rechts den passenden Namen.', pairs: [
    { name: 'Brahma', clue: 'Schöpfer; oft mit vier Köpfen dargestellt', image: '/images/deities/brahma.webp' },
    { name: 'Vishnu', clue: 'Bewahrer; seine Avatare sind unter anderem Rama und Krishna', image: '/images/deities/vishnu.webp' },
    { name: 'Shiva', clue: 'Steht für Verwandlung, Zerstörung und Neubeginn', image: '/images/deities/shiva.webp' },
    { name: 'Ganesha', clue: 'Hat einen Elefantenkopf und steht für Neuanfänge', image: '/images/deities/ganesha.webp' },
    { name: 'Lakshmi', clue: 'Steht für Glück und Wohlstand; ihr Zeichen ist der Lotus', image: '/images/deities/lakshmi.webp' },
    { name: 'Saraswati', clue: 'Steht für Wissen, Musik und Kunst', image: '/images/deities/saraswati.webp' },
  ] },
] as const;

function ratio(stat: TopicStat) { return stat.attempts ? stat.correct / stat.attempts : 0; }
function percent(stat: TopicStat) { return Math.round(ratio(stat) * 100); }

export default function Home() {
  const [section, setSection] = useState<Section>('start');
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Topic | 'Alle'>('Alle');
  const [currentId, setCurrentId] = useState(questions[0].id);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [roundIds, setRoundIds] = useState(() => buildAdaptiveRound('Alle', {}));
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundResults, setRoundResults] = useState<Record<string, boolean>>({});
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundMode, setRoundMode] = useState<'adaptive' | 'mistakes'>('adaptive');
  const [optionOrder, setOptionOrder] = useState(() => shuffleIndices(3));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [cloudState, setCloudState] = useState<CloudState>(cloudIsConfigured() ? 'connecting' : 'unavailable');
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const isAuthReturn = params.has('code') || params.has('token_hash') || hash.includes('access_token=') || hash.includes('error=');
    const parentLoginPending = window.localStorage.getItem(PARENT_LOGIN_PENDING_KEY) === '1';
    if (!isAuthReturn && !parentLoginPending) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    const sendParentHome = (user: { is_anonymous?: boolean } | null | undefined) => {
      if (!active || !user || user.is_anonymous) return;
      window.localStorage.removeItem(PARENT_LOGIN_PENDING_KEY);
      window.location.replace('/parent');
    };

    void supabase.auth.getSession().then(({ data }) => sendParentHome(data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => sendParentHome(session?.user));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let loaded = emptyProgress();
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) try { loaded = normalizeProgress(JSON.parse(saved)); } catch { /* start fresh */ }
    queueMicrotask(() => { setProgress(loaded); setReady(true); });
    if (cloudIsConfigured()) getLinkedLearner().then(async (linked) => { if (!linked) { setCloudState('unlinked'); return; } setLearnerId(linked.id); await touchLinkedDevice(linked.id); setProgress(normalizeProgress(await getConsolidatedProgress<Progress>(linked.id))); setCloudState('synced'); }).catch(() => setCloudState('error'));
    const installHandler = (event: Event) => { event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', installHandler);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => window.removeEventListener('beforeinstallprompt', installHandler);
  }, []);
  useEffect(() => { if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress, ready]);

  const totalCorrect = useMemo(() => topics.reduce((sum, topic) => sum + progress.topics[topic].correct, 0), [progress]);
  const overall = progress.totalAttempts ? Math.round(totalCorrect / progress.totalAttempts * 100) : 0;
  const level = progress.stars >= 240 ? 'Teil-2-Champion' : progress.stars >= 120 ? 'Pfadkenner' : progress.stars >= 45 ? 'Spurensucher' : 'Entdecker';
  const current = questions.find((question) => question.id === currentId) ?? questions[0];
  const displayedCorrectIndex = optionOrder.indexOf(current.answer);
  const correct = selected === displayedCorrectIndex;
  const mistakeIds = useMemo(() => questions.filter((question) => { const stat = progress.items[question.id]; return stat && stat.attempts > 0 && stat.correct / stat.attempts < .8; }).map(({ id }) => id), [progress.items]);
  const roundCorrect = Object.values(roundResults).filter(Boolean).length;

  function showQuestion(id: string) { const next = questions.find((question) => question.id === id) ?? questions[0]; setCurrentId(next.id); setOptionOrder(shuffleIndices(next.options.length)); setSelected(null); setLocked(false); }
  function chooseNext() { const next = roundIndex + 1; if (next >= roundIds.length) { setRoundComplete(true); setSelected(null); setLocked(false); return; } setRoundIndex(next); showQuestion(roundIds[next]); }
  function answer(index: number) {
    if (locked) return;
    setSelected(index); setLocked(true); const isCorrect = optionOrder[index] === current.answer; setRoundResults((old) => ({ ...old, [current.id]: isCorrect }));
    if (learnerId) void queueAndSyncAttempt(createAttempt(learnerId, current.id, current.topic, isCorrect)).then(setCloudState).catch(() => setCloudState('error'));
    setProgress((old) => { const topic = old.topics[current.topic]; const streak = isCorrect ? old.streak + 1 : 0; const item = old.items[current.id] ?? { attempts: 0, correct: 0 }; return { ...old, stars: old.stars + (isCorrect ? 5 : 1), streak, bestStreak: Math.max(old.bestStreak, streak), totalAttempts: old.totalAttempts + 1, topics: { ...old.topics, [current.topic]: { attempts: topic.attempts + 1, correct: topic.correct + (isCorrect ? 1 : 0) } }, items: { ...old.items, [current.id]: { attempts: item.attempts + 1, correct: item.correct + (isCorrect ? 1 : 0) } } }; });
  }
  function startTraining(topic: Topic | 'Alle' = 'Alle', onlyIds?: string[]) { const ids = buildAdaptiveRound(topic, progress.items, { onlyIds, size: onlyIds?.length }); if (!ids.length) return; setFilter(topic); setSection('training'); setRoundMode(onlyIds ? 'mistakes' : 'adaptive'); setRoundIds(ids); setRoundIndex(0); setRoundResults({}); setRoundComplete(false); showQuestion(ids[0]); setTimeout(() => document.getElementById('content')?.scrollIntoView({ behavior: 'smooth' }), 30); }
  async function connect(event: React.FormEvent) { event.preventDefault(); if (!pairingCode.trim()) return; setCloudState('connecting'); setSyncMessage(''); try { const id = await claimPairingCode(pairingCode, progress); setLearnerId(id); setCloudState('synced'); await touchLinkedDevice(id); const consolidated = normalizeProgress(await getConsolidatedProgress<Progress>(id)); setProgress(consolidated); await saveProgressBackup(id, consolidated, 'paired'); setPairingCode(''); setSyncMessage('Verbunden! Teil 2 erscheint jetzt getrennt im Elternbereich.'); } catch { setCloudState('error'); setSyncMessage('Der Code ist ungültig oder abgelaufen.'); } }
  async function confirmReset(event: React.FormEvent) { event.preventDefault(); if (!learnerId || !resetPassword) return; setResetBusy(true); setResetMessage(''); try { setProgress(normalizeProgress(await resetProgressWithPassword<Progress>(learnerId, resetPassword))); setShowReset(false); setResetPassword(''); } catch { setResetMessage('Das Passwort stimmt nicht. Bitte frage deine Eltern.'); } finally { setResetBusy(false); } }
  async function installApp() { if (installEvent) { await installEvent.prompt(); setInstallEvent(null); } else setShowInstall(true); }

  const nav: [Section,string][] = [['start','Start'],['lernen','Lernen'],['zuordnen','Zuordnen'],['training','Trainieren'],['progress','Fortschritt']];
  return <main>
    <header className="topbar"><button className="brand plainButton" onClick={() => setSection('start')} aria-label="Startseite"><span className="brandMark">Ⅱ</span><span>Davids Weltreligionen-Training</span></button><nav className="desktopNav" aria-label="Hauptnavigation">{nav.map(([key,label]) => <button key={key} className={section === key ? 'navButton active' : 'navButton'} onClick={() => key === 'training' ? startTraining() : setSection(key)}>{label}</button>)}</nav><div className="topActions"><button className={`cloudButton ${cloudState}`} onClick={() => setShowSync(true)}><span>●</span>{cloudState === 'synced' ? 'Mit Eltern verbunden' : cloudState === 'offline' ? 'Offline' : 'Fortschritt verbinden'}</button><button className="installButton" onClick={installApp}>＋ App installieren</button></div></header>
    <section className="hero"><div className="heroCopy"><p className="eyebrow">NMG · PRÜFUNG TEIL 2 · 6. KLASSE</p><h1>Zwei Wege. Eine starke Vorbereitung.</h1><p className="lede">Entdecke Buddhismus und Hinduismus, erzähle Buddhas Lebensweg und beschreibe hinduistische Gottheiten sicher in eigenen Worten. 200 Fragen, kurze Runden und sofortiges Feedback.</p><div className="buttonRow"><button className="primaryButton" onClick={() => startTraining()}>Training starten <span>→</span></button><button className="secondaryButton" onClick={() => setSection('lernen')}>Erst lernen</button></div></div><aside className="progressCard"><div className="orbit" style={{ '--progress': `${overall * 3.6}deg` } as React.CSSProperties}><span>✦</span><b>{overall}%</b></div><div><p className="tinyLabel">DEIN WEG</p><h2>{level}</h2><p>{progress.totalAttempts ? `${progress.totalAttempts} Fragen gelöst · ${progress.stars} Sterne` : 'Beginne mit einer kurzen Runde und sammle deinen ersten Stern.'}</p></div></aside></section>
    <div className="mobileNav" aria-label="Mobile Navigation">{nav.map(([key,label], index) => <button key={key} className={section === key ? 'active' : ''} onClick={() => key === 'training' ? startTraining() : setSection(key)}><span>{['⌂','◫','↕','✦','◔'][index]}</span>{label === 'Zuordnen' ? 'Ordnen' : label}</button>)}</div>
    <section id="content" className="contentShell">
      {section === 'start' && <Dashboard progress={progress} onStart={startTraining} onLearn={() => setSection('lernen')} />}
      {section === 'lernen' && <Learn onStart={startTraining} />}
      {section === 'zuordnen' && <MatchingPractice />}
      {section === 'training' && <Training progress={progress} filter={filter} roundMode={roundMode} mistakeIds={mistakeIds} roundComplete={roundComplete} roundCorrect={roundCorrect} roundIds={roundIds} roundResults={roundResults} current={current} roundIndex={roundIndex} optionOrder={optionOrder} displayedCorrectIndex={displayedCorrectIndex} selected={selected} locked={locked} correct={correct} onStart={startTraining} onAnswer={answer} onNext={chooseNext} />}
      {section === 'progress' && <ProgressView progress={progress} overall={overall} level={level} onStart={startTraining} onReset={() => learnerId ? setShowReset(true) : setShowSync(true)} cloudState={cloudState} onConnect={() => setShowSync(true)} />}
    </section>
    <footer><div><strong>Für David · Prüfung Teil 2</strong><p>Die Lernziele aus dem Blatt bestimmen den Umfang. Religionskarten sind vereinfachte Lernhilfen.</p></div><div className="footerLinks"><a href={srfVideos[0].source} target="_blank" rel="noreferrer">SRF · Buddhismus</a><a href={srfVideos[1].source} target="_blank" rel="noreferrer">SRF · Hinduismus</a></div></footer>
    {showInstall && <Modal onClose={() => setShowInstall(false)} eyebrow="APP INSTALLIEREN" title="Auf Mac oder Windows"><p>Öffne das Browser-Menü in Chrome oder Edge und wähle <strong>„App installieren“</strong>. In Safari auf dem Mac: <strong>Ablage → Zum Dock hinzufügen</strong>.</p></Modal>}
    {showSync && <Modal onClose={() => setShowSync(false)} eyebrow="FORTSCHRITT" title="Mit dem Elternbereich verbinden"><p>Erzeuge im Elternbereich einen Code für <strong>Weltreligionen · Prüfung 2</strong> und gib ihn hier ein.</p><form onSubmit={connect} className="pairingForm"><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} maxLength={8} placeholder="AB12CD34" aria-label="Verbindungscode"/><button className="primaryButton small">Verbinden</button></form>{syncMessage && <p className="modalMessage">{syncMessage}</p>}</Modal>}
    {showReset && <Modal onClose={() => !resetBusy && setShowReset(false)} eyebrow="GESCHÜTZT" title="Fortschritt zurücksetzen"><form onSubmit={confirmReset} className="pairingForm"><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Eltern-Passwort" aria-label="Eltern-Passwort"/><button className="primaryButton small" disabled={resetBusy}>Zurücksetzen</button></form>{resetMessage && <p className="modalMessage">{resetMessage}</p>}</Modal>}
  </main>;
}

function Training(props: { progress: Progress; filter: Topic|'Alle'; roundMode: 'adaptive'|'mistakes'; mistakeIds: string[]; roundComplete: boolean; roundCorrect: number; roundIds: string[]; roundResults: Record<string,boolean>; current: typeof questions[number]; roundIndex: number; optionOrder: number[]; displayedCorrectIndex: number; selected: number|null; locked: boolean; correct: boolean; onStart: (topic: Topic|'Alle', ids?: string[]) => void; onAnswer: (index:number)=>void; onNext: ()=>void }) {
  const p = props;
  return <section className="mission"><div className="missionTop"><div><p className="eyebrow">{p.roundMode === 'mistakes' ? 'FEHLER GEZIELT ÜBEN' : 'ADAPTIVES TRAINING'}</p><h2>{p.roundComplete ? 'Runde geschafft!' : p.current.topic}</h2></div><span className="starPill">✦ {p.progress.stars}</span></div><div className="filterRow">{(['Alle', ...topics] as const).map((topic) => <button key={topic} className={p.filter === topic && p.roundMode === 'adaptive' ? 'chip active' : 'chip'} onClick={() => p.onStart(topic)}>{topic}</button>)}{p.mistakeIds.length > 0 && <button className="chip mistakeChip" onClick={() => p.onStart('Alle', p.mistakeIds)}>↻ Fehler ({p.mistakeIds.length})</button>}</div>{p.roundComplete ? <div className="roundSummary"><span className="roundTrophy">{p.roundCorrect === p.roundIds.length ? '🏆' : '🌟'}</span><h3>{p.roundCorrect} von {p.roundIds.length} richtig</h3><p>Schwierige Fragen werden bei der nächsten Runde bevorzugt.</p><div className="roundActions">{Object.values(p.roundResults).some((value) => !value) && <button className="primaryButton small" onClick={() => p.onStart(p.filter, Object.entries(p.roundResults).filter(([,value]) => !value).map(([id]) => id))}>Fehler dieser Runde</button>}<button className="secondaryButton" onClick={() => p.onStart(p.filter)}>Neue Runde</button></div></div> : <><div className="roundProgress"><span>Frage {p.roundIndex + 1} von {p.roundIds.length} · Pool: {p.filter === 'Alle' ? questions.length : questions.filter((q) => q.topic === p.filter).length}</span><div className="wideBar"><span style={{ width: `${((p.roundIndex + (p.locked ? 1 : 0)) / p.roundIds.length) * 100}%` }} /></div></div><p className="question">{p.current.prompt}</p><div className="answerGrid">{p.optionOrder.map((originalIndex,index) => { const state = p.locked ? index === p.displayedCorrectIndex ? ' correct' : index === p.selected ? ' wrong' : '' : ''; return <button className={`answer${state}`} key={`${p.current.id}-${originalIndex}`} onClick={() => p.onAnswer(index)} disabled={p.locked}><span className="choiceLetter">{String.fromCharCode(65 + index)}</span>{p.current.options[originalIndex]}</button>; })}</div>{p.locked && <div className={p.correct ? 'feedback success' : 'feedback retry'} role="status"><strong>{p.correct ? 'Stark! +5 Sterne' : 'Guter Versuch. +1 Stern'}</strong><span>{p.current.explanation}</span></div>}<div className="missionFooter"><span>{p.progress.streak >= 2 ? `🔥 ${p.progress.streak} richtige Antworten in Folge` : 'Schwierige Fragen kommen häufiger zurück.'}</span><button className="primaryButton small" onClick={p.onNext} disabled={!p.locked}>{p.roundIndex + 1 === p.roundIds.length ? 'Runde abschliessen →' : 'Nächste Frage →'}</button></div></>}</section>;
}

function Dashboard({ progress, onStart, onLearn }: { progress: Progress; onStart: (topic: Topic | 'Alle') => void; onLearn: () => void }) {
  const routes: [string,string,string,Topic][] = [['01','Buddhismus verstehen','Merkmale · Regeln · Bräuche','Buddhismus'],['02','Buddhas Weg erzählen','Leben · vier Wahrheiten · achtfacher Pfad','Buddhas Leben & Lehre'],['03','Hinduismus erklären','Merkmale · Alltag · Wiedergeburt','Hinduismus'],['04','Eine Gottheit beschreiben','Merkmale · Aufgabe · Geschichte','Hinduistische Gottheiten']];
  return <><div className="sectionHeading"><div><p className="eyebrow">DEINE LERNROUTE</p><h2>Vier Etappen bis zur Prüfung</h2></div><p>Lerne zuerst die Zusammenhänge. Danach trainierst du jedes Ziel in kurzen, gemischten Runden.</p></div><div className="routeGrid routeGridFour">{routes.map(([number,title,copy,topic]) => <article className="routeCard" key={number}><span className="routeNo">{number}</span><h3>{title}</h3><p>{copy}</p><div className="miniBar"><span style={{ width: `${percent(progress.topics[topic])}%` }} /></div><button onClick={() => onStart(topic)}>Mission öffnen →</button></article>)}</div><aside className="scopeNote"><span>✓</span><div><strong>Genau auf Prüfung Teil 2 ausgerichtet</strong><p>200 Fragen decken die markierten Lernziele ab. Der gemeinsame Überblick wird als Fundament wiederholt.</p></div></aside><section className="downloadPanel"><span className="downloadIcon">📘</span><div><p className="eyebrow">LERNMATERIAL ZUM AUSDRUCKEN</p><h3>Davids Lernheft für Teil 2</h3><p>Wissensseiten, 60 zusätzliche Übungsfragen, Lösungen und direkte Links zu den SRF-Videos.</p></div><a className="primaryButton small" href="/materials/Lernheft_Pruefung_2_David_DE.pdf" download>PDF herunterladen ↓</a></section><button className="learningPrompt" onClick={onLearn}><span>☸</span><div><strong>Neu im Stoff?</strong><p>Starte mit den Lernkarten und den zwei Videos von SRF Kids.</p></div><b>Zum Lernbereich →</b></button></>;
}

function Learn({ onStart }: { onStart: (topic: Topic | 'Alle') => void }) {
  return <><div className="sectionHeading"><div><p className="eyebrow">LERNEN · TEIL 2</p><h2>Verstehen, dann erinnern</h2></div><p>Die Karten formulieren genau das Wissen, das David in eigenen Worten wiedergeben soll.</p></div><section className="studyBlock"><div className="blockTitle"><span>01</span><div><h3>Zwei Religionen im Vergleich</h3><p>Die Prüfungsmerkmale auf einen Blick</p></div></div><div className="dualReligionGrid"><ReligionStudy symbol="☸" name="Buddhismus" tone="saffron" facts={['Schwerpunkt: Ost-, Südost- und Teile Südasiens','Symbol: Dharma-Rad','Kein Schöpfergott im Zentrum','Orte: Tempel, Kloster, Stupa','Schriften: verschiedene Sammlungen, z. B. Pali-Kanon','Regeln: fünf Übungsregeln','Bräuche: Meditation, Gaben, Vesakh']} onStart={() => onStart('Buddhismus')} /><ReligionStudy symbol="ॐ" name="Hinduismus" tone="indigo" facts={['Schwerpunkt: Indien und Südasien','Symbol: Om','Viele Gottheiten; Brahman als göttliche Wirklichkeit','Ort: Mandir und Hausaltar','Schriften: Veden, Upanishaden, Bhagavad Gita','Regeln: Dharma und Karma','Bräuche: Puja, Diwali, Pilgerreisen']} onStart={() => onStart('Hinduismus')} /></div><p className="memoryLine"><strong>Merksatz:</strong> Buddhismus: Buddha – Dharma-Rad – vier Wahrheiten – Nirvana · Hinduismus: Om – Dharma – Karma – Samsara – Moksha</p></section><BuddhaTimeline/><Truths/><Deities onStart={() => onStart('Hinduistische Gottheiten')} /><Videos/></>;
}

function ReligionStudy({ symbol, name, tone, facts, onStart }: { symbol: string; name: string; tone: string; facts: string[]; onStart: () => void }) { return <article className={`religionCard teil2 ${tone}`}><div className="symbolCircle">{symbol}</div><h4>{name}</h4><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul><button onClick={onStart}>Dazu trainieren →</button></article>; }
function BuddhaTimeline() { const steps = [['1','Palast','Siddhartha wächst geschützt und wohlhabend auf.'],['2','Begegnungen','Alter, Krankheit, Tod und ein Suchender verändern seinen Blick.'],['3','Suche','Er verlässt den Palast und probiert strenge Askese.'],['4','Mittlerer Weg','Weder Luxus noch Selbstquälerei führen zum Ziel.'],['5','Erwachen','Unter dem Bodhi-Baum wird er zum Buddha.'],['6','Lehre','Er erklärt den Weg aus dem Leiden und gründet eine Gemeinschaft.']]; return <section className="studyBlock"><div className="blockTitle"><span>02</span><div><h3>Buddhas Lebensweg</h3><p>Sechs Stationen, die du frei erzählen kannst</p></div></div><div className="pathTimeline">{steps.map(([number,title,copy]) => <article key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></article>)}</div><p className="sourceNote">Prüfungsantwort: Verbinde die Stationen mit „zuerst“, „danach“, „deshalb“ und „schliesslich“.</p></section>; }
function Truths() { const truths = [['1','Beobachtung','Leben enthält Leid und Unzufriedenheit.'],['2','Ursache','Gier, Hass und Unwissenheit lassen Leid entstehen.'],['3','Ziel','Wenn die Ursachen enden, kann auch das Leiden enden.'],['4','Weg','Der achtfache Pfad führt zur Überwindung des Leidens.']]; return <section className="studyBlock"><div className="blockTitle"><span>03</span><div><h3>Die vier edlen Wahrheiten</h3><p>Vom Problem zum Lösungsweg</p></div></div><div className="truthGrid">{truths.map(([number,title,copy]) => <article key={number}><span>{number}</span><strong>{title}</strong><p>{copy}</p></article>)}</div><div className="eightfold"><strong>Der achtfache Pfad</strong><div>{['Sicht','Absicht','Rede','Handeln','Lebensunterhalt','Bemühen','Achtsamkeit','Sammlung'].map((item) => <span key={item}>{item}</span>)}</div></div></section>; }
function Deities({ onStart }: { onStart: () => void }) { const gods = [['Brahma','vier Köpfe','Schöpfung'],['Vishnu','Krone · Diskus','Bewahrung'],['Shiva','Dreizack · Tanz','Verwandlung'],['Ganesha','Elefantenkopf','Neuanfang'],['Lakshmi','Lotus','Glück und Wohlstand'],['Saraswati','Buch · Instrument','Wissen und Kunst']]; return <section className="studyBlock"><div className="blockTitle"><span>04</span><div><h3>Eine Gottheit beschreiben</h3><p>Name + Erkennungsmerkmal + Bedeutung</p></div></div><div className="deityGrid">{gods.map(([name,marker,meaning]) => <article key={name}><span>ॐ</span><h4>{name}</h4><p>{marker}</p><strong>{meaning}</strong></article>)}</div><aside className="answerFormula"><p className="eyebrow">ANTWORT-BAUPLAN</p><p><strong>„Ich beschreibe Ganesha.</strong> Man erkennt ihn an seinem Elefantenkopf. Viele Hindus verehren ihn als Helfer bei Neuanfängen und beim Überwinden von Hindernissen.“</p></aside><button className="primaryButton small" onClick={onStart}>Gottheiten trainieren →</button></section>; }
function Videos() { const [activeId, setActiveId] = useState<(typeof srfVideos)[number]['id']>('buddhismus'); const video = srfVideos.find(({ id }) => id === activeId) ?? srfVideos[0]; return <section className="studyBlock videoStudyBlock"><div className="blockTitle"><span>05</span><div><h3>Teil 2 im Video</h3><p>Zusatzmaterial von SRF Kids · Clip und klar!</p></div></div><div className="videoSelector two">{srfVideos.map((item) => <button key={item.id} className={item.id === activeId ? 'videoSelect active' : 'videoSelect'} onClick={() => setActiveId(item.id)}><span>{item.symbol}</span><div><strong>{item.religion}</strong><small>{item.duration}</small></div></button>)}</div><article className="srfVideoStage"><div className="srfVideoIntro"><div><p className="eyebrow">{video.religion.toUpperCase()} · SRF KIDS</p><h4>{video.title}</h4><p>{video.summary}</p></div><span className="srfBadge">SRF</span></div><div className="srfVideoFrame"><iframe key={video.id} src={video.embed} title={`SRF Kids: ${video.title}`} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen /></div><div className="srfVideoFooter"><p>Sieh das Video einmal ohne Pause. Beim zweiten Mal notierst du drei Schlüsselwörter.</p><a href={video.source} target="_blank" rel="noreferrer">Original bei SRF öffnen ↗</a></div></article></section>; }

function MatchingPractice() {
  const itemCount = (index: number) => matchingSets[index].kind === 'sequence' ? matchingSets[index].items.length : matchingSets[index].pairs.length;
  const [setIndex, setSetIndex] = useState(0);
  const [order, setOrder] = useState<number[]>(() => shuffleIndices(itemCount(0)));
  const [selected, setSelected] = useState<number | null>(null);
  const [solved, setSolved] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('Wähle rechts die Karte für Schritt 1.');
  const current = matchingSets[setIndex];
  const expected = solved.length;
  const prompt = current.kind === 'sequence' ? `Welche Station gehört an Position ${expected + 1}?` : current.pairs[expected]?.clue;
  const candidate = (original: number) => current.kind === 'sequence' ? current.items[original] : current.pairs[original].name;
  const solution = (original: number) => current.kind === 'sequence' ? current.items[original] : `${current.pairs[original].name} - ${current.pairs[original].clue}`;
  const latestDeity = current.kind === 'pairs' && solved.length ? current.pairs[solved[solved.length - 1]] : null;
  const solutionHistory = current.kind === 'pairs' && solved.length ? solved.slice(0, -1) : solved;
  function selectSet(index: number) {
    setSetIndex(index); setOrder(shuffleIndices(itemCount(index))); setSelected(null); setSolved([]);
    setFeedback(matchingSets[index].kind === 'sequence' ? 'Wähle rechts die Karte für Schritt 1.' : 'Lies die erste Beschreibung und wähle nur den passenden Namen.');
  }
  function choose(index: number) {
    const original = order[index]; setSelected(index);
    if (original === expected) {
      setSolved((old) => [...old, original]); setOrder((old) => old.filter((_, position) => position !== index)); setSelected(null);
      setFeedback(expected + 1 === itemCount(setIndex) ? 'Geschafft - alle Antworten stimmen.' : current.kind === 'sequence' ? `Richtig. Jetzt suchst du Schritt ${expected + 2}.` : 'Richtig. Lies jetzt die nächste Beschreibung.');
    } else {
      setFeedback(current.kind === 'sequence' ? `Noch nicht. Gesucht ist die Station an Position ${expected + 1}.` : 'Dieser Name passt nicht zur Beschreibung. Lies das Erkennungsmerkmal noch einmal.');
    }
  }
  return <section className="matchingShell"><div className="sectionHeading"><div><p className="eyebrow">AKTIV ERINNERN</p><h2>Ordnen und zuordnen</h2></div><p>Oben wählst du die Aufgabe. Links steht immer genau, was gesucht ist. Rechts klickst du deine Antwort an.</p></div><div className="placeTabs">{matchingSets.map((set,index) => <button key={set.title} className={index === setIndex ? 'placeTab active' : 'placeTab'} onClick={() => selectSet(index)}><span>{index + 1}</span>{set.title}</button>)}</div><div className="matchingBoard"><div><p className="eyebrow">{current.kind === 'sequence' ? 'REIHENFOLGE BILDEN' : 'NAME ZUR BESCHREIBUNG'}</p><h3>{current.subtitle}</h3>{current.kind === 'pairs' && <p className="deityImageNote">Entscheide zuerst nur anhand der Beschreibung. Das Bild erscheint erst nach der richtigen Antwort.</p>}{order.length > 0 && <div className="matchInstruction"><span>{expected + 1}</span><div><small>{current.kind === 'sequence' ? `SCHRITT ${expected + 1} VON ${itemCount(setIndex)}` : `BESCHREIBUNG ${expected + 1} VON ${itemCount(setIndex)}`}</small><strong>{prompt}</strong></div></div>}<p className={feedback.startsWith('Noch') || feedback.startsWith('Dieser') ? 'matchStatus retry' : 'matchStatus'} aria-live="polite">{feedback}</p>{latestDeity && <article className="deityReveal"><Image src={latestDeity.image} alt={`Darstellung von ${latestDeity.name}`} width={600} height={600} /><div><p className="eyebrow">GERADE RICHTIG GELÖST</p><h4>{latestDeity.name}</h4><p>{latestDeity.clue}</p><small>Schau dir jetzt die Erkennungsmerkmale genau an.</small></div></article>}<div className="orderedSolution">{solutionHistory.map((original,index) => <article key={original}>{current.kind === 'pairs' && <Image src={current.pairs[original].image} alt={`Darstellung von ${current.pairs[original].name}`} width={100} height={100} />}<span>✓</span><div><small>{index + 1}</small><strong>{solution(original)}</strong></div></article>)}</div></div><aside className="choiceStack"><p className="choiceLabel">{current.kind === 'sequence' ? 'WÄHLE DIE NÄCHSTE STATION' : 'WÄHLE DEN PASSENDEN NAMEN'}</p>{order.map((original,index) => <button key={original} className={selected === index ? 'active wrongChoice' : ''} onClick={() => choose(index)}>{candidate(original)}</button>)}{!order.length && <div className="matchDone"><span>✦</span><strong>Alles richtig!</strong><button onClick={() => selectSet(setIndex)}>Noch einmal</button></div>}</aside></div></section>;
}

function ProgressView({ progress, overall, level, onStart, onReset, cloudState, onConnect }: { progress: Progress; overall: number; level: string; onStart: (topic: Topic | 'Alle') => void; onReset: () => void; cloudState: CloudState; onConnect: () => void }) { const weakest = [...topics].sort((a,b) => ratio(progress.topics[a]) - ratio(progress.topics[b]))[0]; return <><div className="sectionHeading"><div><p className="eyebrow">FORTSCHRITT · TEIL 2</p><h2>{level}: {overall}%</h2></div><button className="primaryButton small" onClick={() => onStart(weakest)}>Schwächstes Thema üben →</button></div><button className={`syncBanner ${cloudState}`} onClick={onConnect}><span>{cloudState === 'synced' ? '✓' : '☁'}</span><div><strong>{cloudState === 'synced' ? 'Mit dem Elternbereich verbunden' : 'Fortschritt mit den Eltern teilen'}</strong><p>{cloudState === 'synced' ? 'Teil 2 wird als eigene Lernanwendung ausgewertet.' : 'Ein einmaliger Code genügt. Du brauchst keine E-Mail.'}</p></div><b>→</b></button><div className="statGrid"><article><span>✦</span><strong>{progress.stars}</strong><p>Sterne gesammelt</p></article><article><span>🔥</span><strong>{progress.bestStreak}</strong><p>Beste Serie</p></article><article><span>✓</span><strong>{progress.totalAttempts}</strong><p>Fragen gelöst</p></article></div><section className="masteryCard"><h3>Themen-Meisterschaft</h3>{topics.map((topic) => { const stat = progress.topics[topic]; return <div className="masteryRow" key={topic}><div><strong>{topic}</strong><span>{stat.attempts ? `${stat.correct} von ${stat.attempts} richtig` : 'noch nicht begonnen'}</span></div><div className="wideBar"><span style={{ width: `${percent(stat)}%` }} /></div><b>{percent(stat)}%</b></div>; })}</section><button className="dangerLink" onClick={onReset}>Fortschritt geschützt zurücksetzen</button></>; }
function Modal({ onClose, eyebrow, title, children }: { onClose: () => void; eyebrow: string; title: string; children: React.ReactNode }) { return <div className="modalBackdrop" role="presentation" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="modalClose" onClick={onClose}>×</button><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</div></div>; }
