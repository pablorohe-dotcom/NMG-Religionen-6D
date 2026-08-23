# NMG Religionen – 6. Klasse

Material de estudio bilingüe y aplicación interactiva en alemán para preparar la **primera prueba** de NMG sobre religiones, elaborados para un alumno de 6.º de Primaria del cantón de Zug.

## Aplicación

La aplicación entrena de forma progresiva los objetivos de la primera prueba:

- visión general de cristianismo, islam, judaísmo, hinduismo y budismo;
- profundización en cristianismo, islam y judaísmo;
- edificios, escrituras, símbolos, personas importantes, costumbres y reglas;
- preguntas con explicación inmediata, estrellas, rachas, niveles y progreso por tema;
- funcionamiento sin conexión después de la primera carga;
- progreso local sin conexión y sincronización opcional con un panel privado para padres.

Versión web: [Davids Weltreligionen-Training](https://nmg-religionen-6d.netlify.app/)

La guía para instalarla como aplicación en macOS y Windows está en [deliverables/Guia_instalacion_app_Mac_Windows_Web.md](deliverables/Guia_instalacion_app_Mac_Windows_Web.md).

## Materiales preparados

- [Lernheft_Pruefung_1_David_DE.docx](deliverables/Lernheft_Pruefung_1_David_DE.docx): cuaderno de estudio para David en alemán.
- [Material_estudio_y_guia_padres_Prueba_1_ES.docx](deliverables/Material_estudio_y_guia_padres_Prueba_1_ES.docx): material de estudio y guía para padres en español.
- [Loesungen_Pruefung_1_DE.docx](deliverables/Loesungen_Pruefung_1_DE.docx): soluciones autosuficientes en alemán.
- [Soluciones_Prueba_1_ES.docx](deliverables/Soluciones_Prueba_1_ES.docx): soluciones autosuficientes en español.
- [Solutions_Test_1_EN.docx](deliverables/Solutions_Test_1_EN.docx): soluciones autosuficientes en inglés.
- [Praxisleitfaden_Familie_Pruefung_1_DE.docx](deliverables/Praxisleitfaden_Familie_Pruefung_1_DE.docx): guía práctica para familias en alemán.
- [Practical_Family_Guide_Test_1_EN.docx](deliverables/Practical_Family_Guide_Test_1_EN.docx): guía práctica para familias en inglés.
- [`public/materials`](public/materials): las versiones PDF descargables que utiliza la aplicación.
- [build_documents.py](tools/build_documents.py): generador reproducible de los documentos Word.

## Ejecutar localmente

Requisitos: Node.js 22.13 o posterior y pnpm.

```bash
pnpm install
pnpm dev
```

La terminal mostrará la dirección local que debe abrirse en el navegador. Para comprobar una compilación de producción:

```bash
pnpm build
```

Para la compilación que detecta Netlify:

```bash
pnpm build:netlify
```

La aplicación es una PWA: en Chrome o Edge puede instalarse desde el icono de instalación; en Safari para Mac, con **Ablage > Zum Dock hinzufügen**.

## Progreso centralizado y panel de padres

La ruta `/parent` contiene una **central de aprendizaje familiar** protegida mediante enlace mágico por correo. Desde ella se puede:

- cambiar toda la interfaz entre alemán, español e inglés; el idioma inicial es alemán;
- consultar precisión, preguntas practicadas, estrellas y última actividad;
- ver el dominio de cada tema y los últimos días de entrenamiento;
- generar un código temporal para vincular el dispositivo de David;
- descargar únicamente las soluciones y guías correspondientes al idioma seleccionado;
- eliminar todo el progreso sincronizado.

El selector superior separa los resultados por aplicación y asignatura. NMG Religiones es la primera aplicación registrada, pero el modelo de datos no depende de esa materia.

David no necesita correo. Su dispositivo utiliza una sesión anónima de Supabase, introduce una sola vez el código de ocho caracteres y después envía únicamente tema, resultado, estrellas y fecha. Si está sin conexión, los intentos quedan en una cola local y se transmiten al recuperar internet.

### Activar Supabase

1. Crea un proyecto en Supabase, preferentemente en una región europea.
2. Abre **SQL Editor** y ejecuta [supabase/migrations/202608230001_parent_progress.sql](supabase/migrations/202608230001_parent_progress.sql).
3. En **Authentication > Sign In / Providers**, mantén activo Email y habilita **Anonymous Sign-Ins**.
4. En **Authentication > URL Configuration**, configura la URL definitiva de la aplicación y añade `http://localhost:3000/**` para desarrollo. Para previews de Netlify puedes añadir `https://**--TU-SITIO.netlify.app/**`.
5. Copia `.env.example` a `.env.local` para desarrollo y completa la URL del proyecto y su clave pública.
6. En Netlify, crea las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_SITE_URL` con la dirección definitiva; después vuelve a desplegar.

No debe utilizarse ni publicarse una clave `secret` o `service_role`. La clave pública funciona junto con las políticas RLS incluidas en la migración.

### Incorporar futuras aplicaciones y asignaturas

La misma base admite tantas aplicaciones como sean necesarias. Conserva un único perfil de David y organiza los eventos mediante:

- `learning_apps`: catálogo de aplicaciones, asignaturas, curso y temas;
- `learners`: perfiles infantiles, separados de las cuentas de acceso;
- `learner_devices`: instalaciones vinculadas mediante códigos temporales;
- `learning_events`: actividades genéricas con aplicación, tema, puntuación, puntos, duración opcional y fecha;
- `legacy_progress`: importación inicial del progreso que ya existía antes de vincular un dispositivo.

Para registrar una aplicación nueva se añade una fila al catálogo, por ejemplo:

```sql
insert into public.learning_apps
  (app_key, title, subject, grade_label, topic_labels)
values
  ('mathe-brueche-6', 'Brüche trainieren', 'Mathematik', '6. Klasse',
   '["Brüche erkennen", "Erweitern", "Kürzen", "Addieren"]'::jsonb);
```

La aplicación nueva reutiliza `lib/supabase.ts` y el patrón de `lib/progress-cloud.ts`, cambiando su `app_key`. Al instalarla en otro dominio o dispositivo se introduce un nuevo código temporal, pero todo queda asociado al mismo perfil y aparece en el mismo panel de padres.

## Base curricular y fuentes

El alcance se basa en los objetivos fotografiados del primer examen y en el Lehrplan 21 del cantón de Zug:

- [NMG.12.5 – Sich in der Vielfalt religiöser Traditionen und Weltanschauungen orientieren](https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C5)
- [NMG.12.2 – Religiöse Sprachformen, Geschichten und Figuren](https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C2)

Las fotografías educativas de iglesia, mezquita y sinagoga proceden de Wikimedia Commons. Las atribuciones y licencias concretas aparecen en la sección **Quellen & Bildnachweise** de la aplicación.

## Privacidad

Las fotografías originales del material escolar, los archivos de control de calidad y otros documentos de trabajo personales están excluidos del repositorio. Antes de vincularse, la aplicación guarda el progreso en `localStorage`. Después, sincroniza solamente los datos mínimos descritos anteriormente; las políticas RLS separan el acceso del alumno y de sus padres.

El contenido es una ayuda de estudio y debe contrastarse con las indicaciones finales del profesorado.
