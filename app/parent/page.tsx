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
type ParentLanguage = 'de' | 'es' | 'en';

const PARENT_COPY = {
  de: {
    language: 'Sprache', error: 'Fehler', area: 'ELTERNBEREICH', privateArea: 'PRIVATER ELTERNBEREICH', loading: 'Fortschritt wird geladen …',
    setupTitle: 'Cloud-Verbindung vorbereiten', setupCopy: 'Der geschützte Elternbereich ist eingebaut. Trage die Supabase-Werte in der Hosting-Umgebung ein, damit Anmeldung und Synchronisierung aktiv werden.',
    loginTitle: 'Davids Lernweg begleiten', loginCopy: 'Du erhältst einen einmaligen Anmeldelink. Es wird kein Passwort gespeichert.', email: 'E-Mail der Eltern', sending: 'Wird gesendet …', sendLink: 'Sicheren Link senden', sent: 'Wir haben dir einen sicheren Anmeldelink per E-Mail geschickt.', back: '← Zur Lern-App',
    hub: 'FAMILIEN-LERNZENTRALE', dashboardTitle: (name: string) => `${name}s Lernweg`, dashboardCopy: 'Alle Lern-Apps und Schulfächer in einer gemeinsamen, geschützten Übersicht.', openApp: 'Lern-App öffnen', signOut: 'Abmelden', chooseApp: 'Lern-App auswählen', subject: 'Fach', learningApp: 'Lern-App',
    materials: 'MATERIALIEN FÜR FAMILIEN', materialsTitle: 'Lernstoff, Lösungen und Begleitung', materialsCopy: 'Die Dokumente in der gewählten Sprache sind ohne Zugriff auf die ursprünglichen Fotos verständlich und können heruntergeladen oder ausgedruckt werden.', download: 'PDF herunterladen ↓',
    accuracy: 'Genauigkeit', correctAnswers: (n: number) => `${n} richtige Antworten`, practiced: 'Geübte Aufgaben', practicedDays: (n: number) => `an ${n} Tagen online erfasst`, points: 'Punkte', bestStreak: (n: number) => `beste Serie: ${n}`, lastActivity: 'Letzte Aktivität', none: 'Noch keine', nextFocus: (topic: string) => `Nächster Fokus: ${topic}`, afterFirst: 'Nach dem ersten Training sichtbar',
    topics: 'THEMEN', topicConfidence: 'Sicherheit nach Thema', result: (score: number, attempts: number) => `${score} von ${attempts} richtig`, notPracticed: 'noch nicht geübt', recentDays: 'LETZTE LERNTAGE', activity: 'Aktivität', questions: (n: number) => `${n} Fragen`, empty: 'Sobald David nach der Verbindung trainiert, erscheint hier seine Aktivität.',
    connect: 'LERN-APP VERBINDEN', connectTitle: 'Ein neues Gerät oder eine neue App verbinden', connectCopy: 'Der Code verbindet die jeweilige Installation mit Davids zentralem Profil. So können später auch Mathematik, Sprachen und weitere Fächer dieselbe Lernzentrale verwenden.', codeValidity: '20 Minuten gültig · nur einmal verwendbar', createCode: 'Verbindungscode erzeugen', privacy: 'Gespeichert werden App, Fach, Thema, Ergebnis, Punkte und Zeitpunkt. Keine Antworten, Fotos, Schule oder Adresse.', clear: 'Fortschritt dieser App löschen', clearConfirm: (title: string) => `Den synchronisierten Fortschritt für „${title}“ wirklich löschen?`, cleared: 'Der synchronisierte Fortschritt wurde gelöscht.', grade: '6. Klasse', appTitle: 'Weltreligionen - Prüfung Teil 1',
  },
  es: {
    language: 'Idioma', error: 'Error', area: 'ZONA DE PADRES', privateArea: 'ZONA PRIVADA PARA PADRES', loading: 'Cargando el progreso…',
    setupTitle: 'Preparar la conexión en la nube', setupCopy: 'La zona protegida para padres está incorporada. Añade los valores de Supabase al entorno de alojamiento para activar el acceso y la sincronización.',
    loginTitle: 'Acompañar el aprendizaje de David', loginCopy: 'Recibirás un enlace de acceso de un solo uso. No se guarda ninguna contraseña.', email: 'Correo electrónico de los padres', sending: 'Enviando…', sendLink: 'Enviar enlace seguro', sent: 'Te hemos enviado por correo un enlace seguro de acceso.', back: '← Volver a la aplicación',
    hub: 'CENTRO DE APRENDIZAJE FAMILIAR', dashboardTitle: (name: string) => `El aprendizaje de ${name}`, dashboardCopy: 'Todas las aplicaciones y asignaturas en una vista común y protegida.', openApp: 'Abrir aplicación', signOut: 'Cerrar sesión', chooseApp: 'Elegir aplicación de aprendizaje', subject: 'Asignatura', learningApp: 'Aplicación',
    materials: 'MATERIALES PARA FAMILIAS', materialsTitle: 'Estudio, soluciones y acompañamiento', materialsCopy: 'Los documentos disponibles en el idioma elegido se entienden sin las fotografías originales y pueden descargarse o imprimirse.', download: 'Descargar PDF ↓',
    accuracy: 'Precisión', correctAnswers: (n: number) => `${n} respuestas correctas`, practiced: 'Ejercicios realizados', practicedDays: (n: number) => `registrados en ${n} días`, points: 'Puntos', bestStreak: (n: number) => `mejor racha: ${n}`, lastActivity: 'Última actividad', none: 'Todavía ninguna', nextFocus: (topic: string) => `Próximo enfoque: ${topic}`, afterFirst: 'Visible después del primer entrenamiento',
    topics: 'TEMAS', topicConfidence: 'Dominio por tema', result: (score: number, attempts: number) => `${score} de ${attempts} correctas`, notPracticed: 'todavía no practicado', recentDays: 'ÚLTIMOS DÍAS DE ESTUDIO', activity: 'Actividad', questions: (n: number) => `${n} preguntas`, empty: 'Cuando David practique después de conectar la aplicación, su actividad aparecerá aquí.',
    connect: 'CONECTAR APLICACIÓN', connectTitle: 'Conectar un dispositivo o una aplicación nueva', connectCopy: 'El código vincula esa instalación con el perfil central de David. En el futuro, Matemáticas, idiomas y otras asignaturas podrán utilizar el mismo centro familiar.', codeValidity: 'Válido durante 20 minutos · un solo uso', createCode: 'Generar código de conexión', privacy: 'Se guardan aplicación, asignatura, tema, resultado, puntos y momento. No se guardan respuestas, fotos, colegio ni dirección.', clear: 'Borrar progreso de esta aplicación', clearConfirm: (title: string) => `¿Borrar realmente el progreso sincronizado de «${title}»?`, cleared: 'Se ha borrado el progreso sincronizado.', grade: '6.º curso', appTitle: 'Religiones del mundo - Prueba 1',
  },
  en: {
    language: 'Language', error: 'Error', area: 'PARENT AREA', privateArea: 'PRIVATE PARENT AREA', loading: 'Loading progress…',
    setupTitle: 'Prepare the cloud connection', setupCopy: 'The protected parent area is built in. Add the Supabase values to the hosting environment to activate sign-in and synchronisation.',
    loginTitle: "Support David's learning", loginCopy: 'You will receive a one-time sign-in link. No password is stored.', email: 'Parent email', sending: 'Sending…', sendLink: 'Send secure link', sent: 'We sent a secure sign-in link to your email.', back: '← Back to the learning app',
    hub: 'FAMILY LEARNING HUB', dashboardTitle: (name: string) => `${name}'s learning journey`, dashboardCopy: 'All learning apps and school subjects in one shared, protected overview.', openApp: 'Open learning app', signOut: 'Sign out', chooseApp: 'Choose a learning app', subject: 'Subject', learningApp: 'Learning app',
    materials: 'FAMILY MATERIALS', materialsTitle: 'Study content, solutions and support', materialsCopy: 'Documents in the selected language are understandable without the original photographs and can be downloaded or printed.', download: 'Download PDF ↓',
    accuracy: 'Accuracy', correctAnswers: (n: number) => `${n} correct answers`, practiced: 'Tasks practised', practicedDays: (n: number) => `recorded on ${n} days`, points: 'Points', bestStreak: (n: number) => `best streak: ${n}`, lastActivity: 'Last activity', none: 'None yet', nextFocus: (topic: string) => `Next focus: ${topic}`, afterFirst: 'Visible after the first practice session',
    topics: 'TOPICS', topicConfidence: 'Confidence by topic', result: (score: number, attempts: number) => `${score} of ${attempts} correct`, notPracticed: 'not practised yet', recentDays: 'RECENT STUDY DAYS', activity: 'Activity', questions: (n: number) => `${n} questions`, empty: "David's activity will appear here after the learning app is connected and he practises.",
    connect: 'CONNECT LEARNING APP', connectTitle: 'Connect a new device or learning app', connectCopy: "The code links that installation to David's central profile. Mathematics, languages and future subjects can use the same family learning hub.", codeValidity: 'Valid for 20 minutes · one use only', createCode: 'Create connection code', privacy: 'The platform stores app, subject, topic, result, points and time. It does not store answers, photos, school or address.', clear: 'Delete progress for this app', clearConfirm: (title: string) => `Delete the synchronised progress for “${title}”?`, cleared: 'The synchronised progress was deleted.', grade: 'Grade 6', appTitle: 'World religions - Test 1',
  },
} as const;

const MATERIALS: Record<ParentLanguage, Array<{ href: string; title: string; description: string }>> = {
  de: [
    { href: '/materials/Lernheft_Pruefung_1_David_DE.pdf', title: 'Lernheft für Prüfung Teil 1', description: 'Prüfungswissen, Merksätze und Probeprüfung' },
    { href: '/materials/Loesungen_Pruefung_1_DE.pdf', title: 'Lösungen zu Prüfung Teil 1', description: 'Vollständige und selbstständige Erklärungen' },
    { href: '/materials/Praxisleitfaden_Familie_Pruefung_1_DE.pdf', title: 'Praxisleitfaden für Familien', description: '15-Minuten-Routine und hilfreiche Rückfragen' },
  ],
  es: [
    { href: '/materials/Material_estudio_y_guia_padres_Prueba_1_ES.pdf', title: 'Material de estudio y guía para padres', description: 'Contenido, plan de cinco días y respuestas' },
    { href: '/materials/Soluciones_Prueba_1_ES.pdf', title: 'Soluciones de la primera prueba', description: 'Explicaciones completas e independientes' },
  ],
  en: [
    { href: '/materials/Solutions_Test_1_EN.pdf', title: 'Solutions for Test 1', description: 'Complete, self-contained explanations' },
    { href: '/materials/Practical_Family_Guide_Test_1_EN.pdf', title: 'Practical family guide', description: 'Short routines, feedback and sensitive language' },
  ],
};

const TOPIC_LABELS: Record<ParentLanguage, Record<string, string>> = {
  de: {},
  es: { Grundwissen: 'Conocimientos básicos', Christentum: 'Cristianismo', Islam: 'Islam', Judentum: 'Judaísmo', 'Gebäude & Schriften': 'Edificios y escrituras' },
  en: { Grundwissen: 'Basic knowledge', Christentum: 'Christianity', Islam: 'Islam', Judentum: 'Judaism', 'Gebäude & Schriften': 'Buildings and scriptures' },
};

export default function ParentPage() {
  const supabase = getSupabaseClient();
  const [language, setLanguage] = useState<ParentLanguage>('de');
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
  const c = PARENT_COPY[language];

  useEffect(() => {
    const restoreLanguage = window.setTimeout(() => {
      const saved = window.localStorage.getItem('nmg-parent-language');
      if (saved === 'de' || saved === 'es' || saved === 'en') setLanguage(saved);
    }, 0);
    return () => window.clearTimeout(restoreLanguage);
  }, []);

  function changeLanguage(next: ParentLanguage) {
    setLanguage(next);
    window.localStorage.setItem('nmg-parent-language', next);
  }

  const loadDashboard = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user || user.is_anonymous) {
      setSignedIn(false); setLoading(false); return;
    }

    setSignedIn(true);
    const setup = await supabase.rpc('ensure_parent_setup', { p_display_name: 'David' });
    if (setup.error) { setNotice(`${c.error}: ${setup.error.message}`); setLoading(false); return; }
    const current = (setup.data?.[0] ?? null) as { learner_id: string; display_name: string } | null;
    if (!current) { setLoading(false); return; }
    const nextLearner = { id: current.learner_id, display_name: current.display_name };
    setLearner(nextLearner);

    const [eventResult, legacyResult, appsResult] = await Promise.all([
      supabase.from('learning_events').select('id,app_key,topic,score,reward_points,occurred_at').eq('learner_id', nextLearner.id).order('occurred_at', { ascending: true }),
      supabase.from('legacy_progress').select('app_key,snapshot').eq('learner_id', nextLearner.id),
      supabase.from('learning_apps').select('app_key,title,subject,grade_label,topic_labels').eq('active', true).order('subject'),
    ]);
    if (eventResult.error || legacyResult.error || appsResult.error) setNotice(`${c.error}: ${eventResult.error?.message ?? legacyResult.error?.message ?? appsResult.error?.message}`);
    setEvents((eventResult.data ?? []) as LearningEvent[]);
    setLegacy((legacyResult.data ?? []) as LegacyRow[]);
    const apps = (appsResult.data ?? []) as LearningApp[];
    setLearningApps(apps);
    if (apps.length && !apps.some((app) => app.app_key === selectedAppKey)) setSelectedAppKey(apps[0].app_key);
    setLoading(false);
  }, [c.error, selectedAppKey, supabase]);

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

  const locale = language === 'de' ? 'de-CH' : language === 'es' ? 'es-ES' : 'en-GB';
  const displayTopic = (topic: string) => TOPIC_LABELS[language][topic] ?? topic;
  const selectedTitle = selectedAppKey === DEFAULT_APP_KEY ? c.appTitle : selectedApp?.title ?? c.learningApp;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/parent` } });
    setNotice(error ? `${c.error}: ${error.message}` : c.sent);
    setBusy(false);
  }

  async function generateCode() {
    if (!supabase || !learner) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('create_pairing_code', { p_learner_id: learner.id });
    if (error) setNotice(`${c.error}: ${error.message}`); else setPairingCode(data as string);
    setBusy(false);
  }

  async function clearProgress() {
    if (!supabase || !learner || !selectedApp || !window.confirm(c.clearConfirm(selectedTitle))) return;
    setBusy(true);
    const first = await supabase.from('learning_events').delete().eq('learner_id', learner.id).eq('app_key', selectedApp.app_key);
    const second = await supabase.from('legacy_progress').delete().eq('learner_id', learner.id).eq('app_key', selectedApp.app_key);
    setNotice(first.error || second.error ? `${c.error}: ${first.error?.message ?? second.error?.message}` : c.cleared);
    await loadDashboard(); setBusy(false);
  }

  const languageSwitcher = <LanguageSwitcher language={language} label={c.language} onChange={changeLanguage}/>;

  if (!supabase) return <ParentShell>{languageSwitcher}<section className="parentLogin"><p className="eyebrow">{c.area}</p><h1>{c.setupTitle}</h1><p>{c.setupCopy}</p><Link className="secondaryButton" href="/">{c.back}</Link></section></ParentShell>;
  if (loading) return <ParentShell>{languageSwitcher}<section className="parentLogin"><p className="eyebrow">{c.area}</p><h1>{c.loading}</h1></section></ParentShell>;
  if (!signedIn) return <ParentShell>{languageSwitcher}<section className="parentLogin"><p className="eyebrow">{c.privateArea}</p><h1>{c.loginTitle}</h1><p>{c.loginCopy}</p><form onSubmit={sendMagicLink}><label htmlFor="parent-email">{c.email}</label><input id="parent-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required/><button className="primaryButton" disabled={busy}>{busy ? c.sending : c.sendLink}</button></form>{notice && <p className="noticeBox">{notice}</p>}<Link className="parentBack" href="/">{c.back}</Link></section></ParentShell>;

  return <ParentShell>
    {languageSwitcher}
    <header className="parentHeader"><div><p className="eyebrow">{c.hub}</p><h1>{c.dashboardTitle(learner?.display_name ?? 'David')}</h1><p>{c.dashboardCopy}</p></div><div className="parentActions"><Link className="secondaryButton" href="/">{c.openApp}</Link><button className="plainButton" onClick={() => supabase.auth.signOut()}>{c.signOut}</button></div></header>
    {notice && <p className="noticeBox">{notice}</p>}
    <section className="appSwitcher" aria-label={c.chooseApp}>{learningApps.map((app) => <button key={app.app_key} className={app.app_key === selectedAppKey ? 'active' : ''} onClick={() => { setSelectedAppKey(app.app_key); setPairingCode(''); }}><span>{app.subject}</span><strong>{app.app_key === DEFAULT_APP_KEY ? c.appTitle : app.title}</strong><small>{app.app_key === DEFAULT_APP_KEY ? c.grade : app.grade_label}</small></button>)}</section>
    <div className="selectedAppTitle"><span>{selectedApp?.subject ?? c.subject}</span><h2>{selectedTitle}</h2></div>
    {selectedAppKey === DEFAULT_APP_KEY && <section className="materialsPanel"><div className="materialsHeading"><div><p className="eyebrow">{c.materials}</p><h2>{c.materialsTitle}</h2></div><p>{c.materialsCopy}</p></div><div className="materialsGrid">{MATERIALS[language].map((item) => <a className="materialCard" href={item.href} download key={item.href}><span className="materialLanguage">{language.toUpperCase()}</span><strong>{item.title}</strong><small>{item.description}</small><b>{c.download}</b></a>)}</div></section>}
    <section className="parentStats"><article><span>{c.accuracy}</span><strong>{stats.overall}%</strong><small>{c.correctAnswers(stats.correct)}</small></article><article><span>{c.practiced}</span><strong>{stats.totalAttempts}</strong><small>{c.practicedDays(stats.practicedDays)}</small></article><article><span>{c.points}</span><strong>{stats.points}</strong><small>{c.bestStreak(stats.bestStreak)}</small></article><article><span>{c.lastActivity}</span><strong className="dateStat">{stats.lastActivity ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stats.lastActivity)) : c.none}</strong><small>{stats.weakest ? c.nextFocus(displayTopic(stats.weakest)) : c.afterFirst}</small></article></section>
    <div className="parentGrid"><section className="parentPanel"><div className="panelHeading"><div><p className="eyebrow">{c.topics}</p><h2>{c.topicConfidence}</h2></div></div>{topicNames.map((topic) => { const row = stats.byTopic[topic]; const value = row.attempts ? Math.round(row.score / row.attempts * 100) : 0; return <div className="parentTopic" key={topic}><div><strong>{displayTopic(topic)}</strong><span>{row.attempts ? c.result(Math.round(row.score), row.attempts) : c.notPracticed}</span></div><div className="wideBar"><span style={{ width: `${value}%` }}/></div><b>{value}%</b></div>; })}</section>
      <section className="parentPanel"><p className="eyebrow">{c.recentDays}</p><h2>{c.activity}</h2>{recentDays.length ? <div className="dayList">{recentDays.map(([date, day]) => <div key={date}><time>{new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00Z`))}</time><span>{c.questions(day.attempts)}</span><b>{Math.round(day.correct / day.attempts * 100)}%</b></div>)}</div> : <p className="emptyState">{c.empty}</p>}</section></div>
    <section className="pairingPanel"><div><p className="eyebrow">{c.connect}</p><h2>{c.connectTitle}</h2><p>{c.connectCopy}</p></div><div className="pairingAction">{pairingCode ? <><code>{pairingCode}</code><small>{c.codeValidity}</small></> : <button className="primaryButton" onClick={generateCode} disabled={busy}>{c.createCode}</button>}</div></section>
    <div className="privacyRow"><p>{c.privacy}</p><button className="dangerLink" onClick={clearProgress} disabled={busy}>{c.clear}</button></div>
  </ParentShell>;
}

function ParentShell({ children }: { children: React.ReactNode }) {
  return <main className="parentShell">{children}</main>;
}

function LanguageSwitcher({ language, label, onChange }: { language: ParentLanguage; label: string; onChange: (language: ParentLanguage) => void }) {
  return <div className="parentLanguageRow"><span>{label}</span><div className="languageSwitcher" role="group" aria-label={label}>{(['de', 'es', 'en'] as ParentLanguage[]).map((item) => <button type="button" key={item} className={language === item ? 'active' : ''} onClick={() => onChange(item)} aria-pressed={language === item}>{item.toUpperCase()}</button>)}</div></div>;
}
