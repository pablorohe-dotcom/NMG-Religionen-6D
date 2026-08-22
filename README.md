# NMG Religionen – 6. Klasse

Material de estudio bilingüe y aplicación interactiva en alemán para preparar la **primera prueba** de NMG sobre religiones, elaborados para un alumno de 6.º de Primaria del cantón de Zug.

## Aplicación

La aplicación entrena de forma progresiva los objetivos de la primera prueba:

- visión general de cristianismo, islam, judaísmo, hinduismo y budismo;
- profundización en cristianismo, islam y judaísmo;
- edificios, escrituras, símbolos, personas importantes, costumbres y reglas;
- preguntas con explicación inmediata, estrellas, rachas, niveles y progreso por tema;
- funcionamiento sin conexión después de la primera carga;
- progreso guardado únicamente en el navegador y dispositivo del alumno.

Versión web privada: [Davids Weltreligionen-Training](https://nmg-weltreligionen-training-zug-6.pablorohe.chatgpt.site)

La guía para instalarla como aplicación en macOS y Windows está en [deliverables/Guia_instalacion_app_Mac_Windows_Web.md](deliverables/Guia_instalacion_app_Mac_Windows_Web.md).

## Materiales preparados

- [Lernheft_Pruefung_1_David_DE.docx](deliverables/Lernheft_Pruefung_1_David_DE.docx): cuaderno de estudio para David en alemán.
- [Material_estudio_y_guia_padres_Prueba_1_ES.docx](deliverables/Material_estudio_y_guia_padres_Prueba_1_ES.docx): material de estudio y guía para padres en español.
- [Loesungen_Broschuere_Pruefung_1_DE_ES.docx](deliverables/Loesungen_Broschuere_Pruefung_1_DE_ES.docx): soluciones razonadas del folleto en alemán y español.
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

La aplicación es una PWA: en Chrome o Edge puede instalarse desde el icono de instalación; en Safari para Mac, con **Ablage > Zum Dock hinzufügen**.

## Base curricular y fuentes

El alcance se basa en los objetivos fotografiados del primer examen y en el Lehrplan 21 del cantón de Zug:

- [NMG.12.5 – Sich in der Vielfalt religiöser Traditionen und Weltanschauungen orientieren](https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C5)
- [NMG.12.2 – Religiöse Sprachformen, Geschichten und Figuren](https://zg.lehrplan.ch/index.php?code=a%7C6%7C1%7C12%7C0%7C2)

Las fotografías educativas de iglesia, mezquita y sinagoga proceden de Wikimedia Commons. Las atribuciones y licencias concretas aparecen en la sección **Quellen & Bildnachweise** de la aplicación.

## Privacidad

Las fotografías originales del material escolar, los archivos de control de calidad y otros documentos de trabajo personales están excluidos del repositorio. La aplicación no envía el progreso a ningún servidor; lo guarda en `localStorage` en el dispositivo usado.

El contenido es una ayuda de estudio y debe contrastarse con las indicaciones finales del profesorado.
