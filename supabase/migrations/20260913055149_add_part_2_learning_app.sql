insert into public.learning_apps (app_key, title, subject, grade_label, topic_labels)
values (
  'nmg-religionen-pruefung-2',
  'Weltreligionen · Prüfung 2',
  'NMG',
  '6. Klasse',
  '["Überblick & Vergleich", "Buddhismus", "Buddhas Leben & Lehre", "Hinduismus", "Hinduistische Gottheiten"]'::jsonb
)
on conflict (app_key) do update set
  title = excluded.title,
  subject = excluded.subject,
  grade_label = excluded.grade_label,
  topic_labels = excluded.topic_labels,
  active = true;
