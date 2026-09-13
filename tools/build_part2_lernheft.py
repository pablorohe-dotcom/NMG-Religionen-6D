from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Lernheft_Pruefung_2_David_DE.pdf"
PUBLIC = ROOT / "public" / "materials" / OUTPUT.name

NAVY = colors.HexColor("#1F2B4D")
ORANGE = colors.HexColor("#B65B13")
CREAM = colors.HexColor("#FAF7EF")
PALE = colors.HexColor("#EDF2EF")
INK = colors.HexColor("#273149")
MUTED = colors.HexColor("#59657A")
LINE = colors.HexColor("#D9D9D9")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverEyebrow", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=ORANGE, spaceAfter=12, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=31, leading=36, textColor=NAVY, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontName="Helvetica", fontSize=15, leading=21, textColor=MUTED, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=NAVY, spaceAfter=12, keepWithNext=True))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=NAVY, spaceBefore=9, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="Qx", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=14, textColor=INK, leftIndent=13, firstLineIndent=-13, spaceAfter=5))
styles.add(ParagraphStyle(name="Answerx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=INK, leftIndent=16, firstLineIndent=-16, spaceAfter=4))
styles.add(ParagraphStyle(name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white))
styles.add(ParagraphStyle(name="TableBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.6, leading=12, textColor=INK))


def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    if doc.page > 1:
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(18 * mm, 12 * mm, "DAVIDS WELTRELIGIONEN-TRAINING - PRUEFUNG TEIL 2")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def title(text, intro=None):
    out = [p(text, "H1x")]
    if intro:
        out.append(p(intro))
    return out


def ruled(lines=2):
    data = [[""] for _ in range(lines)]
    table = Table(data, colWidths=[170 * mm], rowHeights=[8 * mm] * lines)
    table.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE)]))
    return table


def checklist(items):
    return [p(f"[ ] {item}", "Bodyx") for item in items]


def questions(items, start=1, lines=False):
    out = []
    for idx, item in enumerate(items, start):
        out.append(p(f"<b>{idx}.</b> {item}", "Qx"))
        if lines:
            out.append(ruled(1))
            out.append(Spacer(1, 2 * mm))
    return out


def comparison_table(rows, widths=(36, 63, 63)):
    data = [[p("Merkmal", "TableHead"), p("Buddhismus", "TableHead"), p("Hinduismus", "TableHead")]]
    for a, b, c in rows:
        data.append([p(a, "TableBody"), p(b, "TableBody"), p(c, "TableBody")])
    table = Table(data, colWidths=[w * mm for w in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
    ]))
    return table


def answer_list(items, start=1):
    return [p(f"<b>{idx}.</b> {item}", "Answerx") for idx, item in enumerate(items, start)]


buddha_q = [
    "Nenne das Symbol des Buddhismus.",
    "Wie nennt man einen buddhistischen Tempelbau, in dem Reliquien aufbewahrt werden können?",
    "Was bedeutet Meditation im buddhistischen Alltag?",
    "Nenne zwei der fünf Übungsregeln.",
    "Warum verliess Siddhartha sein geschütztes Leben?",
    "Bringe in Reihenfolge: Erwachen - Askese - Palast - Mittlerer Weg.",
    "Was erkannte Siddhartha am Mittleren Weg?",
    "Wo wurde Siddhartha zum Buddha?",
    "Erkläre die erste edle Wahrheit in einem Satz.",
    "Welche drei Ursachen des Leidens nennt die zweite edle Wahrheit?",
    "Was sagt die dritte edle Wahrheit aus?",
    "Welche Aufgabe hat der achtfache Pfad?",
    "Nenne vier Teile des achtfachen Pfades.",
    "Was bedeutet Nirvana?",
    "Warum ist Buddha kein Schöpfergott?",
    "Was feiern viele Buddhisten an Vesakh?",
    "Nenne einen Unterschied zwischen Mönchen oder Nonnen und Laien.",
    "Formuliere eine Prüfungsantwort mit zuerst, danach und schliesslich zu Buddhas Weg.",
    "Richtig oder falsch: Im Buddhismus steht die Verehrung eines einzigen Schöpfergottes im Zentrum.",
    "Richtig oder falsch: Achtsamkeit gehört zum achtfachen Pfad.",
]

hindu_q = [
    "Nenne das bekannte Symbol des Hinduismus.",
    "Was ist ein Mandir?",
    "Was bedeutet Puja?",
    "Erkläre Brahman mit eigenen Worten.",
    "Was bedeutet Atman?",
    "Erkläre Karma mit einem Beispiel.",
    "Was ist Samsara?",
    "Was bedeutet Moksha?",
    "Wie hängen Karma, Samsara und Moksha zusammen?",
    "Welche Aufgabe wird Brahma zugeordnet?",
    "Welche Aufgabe wird Vishnu zugeordnet?",
    "Welche Aufgabe wird Shiva zugeordnet?",
    "Woran erkennt man Ganesha?",
    "Wofür wird Lakshmi verehrt?",
    "Wofür steht Saraswati?",
    "Nenne zwei Avatare Vishnus.",
    "Was feiern viele Hindus an Diwali?",
    "Nenne zwei wichtige hinduistische Schriften.",
    "Beschreibe eine Gottheit nach dem Bauplan Name - Merkmal - Bedeutung.",
    "Richtig oder falsch: Alle Hindus verehren genau dieselben Gottheiten auf dieselbe Weise.",
]

mixed_q = [
    "Welches Paar passt? A Dharma-Rad/Buddhismus  B Dharma-Rad/Hinduismus  C Om/Buddhismus",
    "Welches Paar passt? A Mandir/Buddhismus  B Stupa/Hinduismus  C Mandir/Hinduismus",
    "Was gehört zum Buddhismus? A vier edle Wahrheiten  B Avatare Vishnus  C Puja am Hausaltar",
    "Was gehört zum Hinduismus? A Nirvana  B Moksha  C Bodhi-Baum als Ort des Erwachens",
    "Welche Aussage stimmt? A Karma betrifft Handlungen und Folgen  B Karma ist ein Tempel  C Karma ist eine Gottheit",
    "Welche Aussage stimmt? A Buddha lehrte den Mittleren Weg  B Buddha war ein Avatar Vishnus in allen Traditionen  C Buddha schrieb die Veden",
    "Wer passt zur Bewahrung? A Shiva  B Vishnu  C Saraswati",
    "Wer passt zu Wissen und Kunst? A Lakshmi  B Ganesha  C Saraswati",
    "Welche Reihenfolge stimmt? A Ursache-Ziel-Beobachtung-Weg  B Beobachtung-Ursache-Ziel-Weg  C Weg-Ziel-Ursache-Beobachtung",
    "Welcher Begriff bezeichnet den Kreislauf der Wiedergeburten? A Samsara  B Nirvana  C Puja",
    "Nenne je einen religiösen Ort beider Religionen.",
    "Nenne je einen wichtigen Brauch beider Religionen.",
    "Vergleiche Nirvana und Moksha in zwei Sätzen.",
    "Vergleiche Dharma im Buddhismus und im Hinduismus vereinfacht.",
    "Warum helfen Symbole beim Erkennen einer Religion, reichen aber nicht zum Erklären?",
    "Erkläre einen wichtigen Unterschied im Gottesverständnis.",
    "Was haben beide Religionen beim Thema Handeln gemeinsam?",
    "Formuliere eine Frage, die du nach dem SRF-Video zum Buddhismus noch hast.",
    "Formuliere eine Frage, die du nach dem SRF-Video zum Hinduismus noch hast.",
    "Schreibe eine vollständige Prüfungsantwort: Beschreibe eine hinduistische Gottheit und erkläre ihre Bedeutung.",
]

buddha_a = [
    "Dharma-Rad.", "Stupa.", "Den Geist sammeln, aufmerksam beobachten und Ruhe üben.",
    "Zum Beispiel: nicht töten, nicht stehlen, nicht lügen, keine berauschenden Mittel, kein schädigendes sexuelles Verhalten.",
    "Er begegnete Alter, Krankheit, Tod und einem Suchenden und wollte einen Weg aus dem Leid finden.",
    "Palast - Askese - Mittlerer Weg - Erwachen.", "Weder Luxus noch Selbstquälerei führen zum Ziel.",
    "Unter dem Bodhi-Baum in Bodh Gaya.", "Leid und Unzufriedenheit gehören zum Leben.",
    "Gier, Hass und Unwissenheit.", "Wenn die Ursachen des Leidens enden, kann auch das Leiden enden.",
    "Er zeigt den praktischen Weg zur Überwindung des Leidens.",
    "Mögliche Auswahl: Sicht, Absicht, Rede, Handeln, Lebensunterhalt, Bemühen, Achtsamkeit, Sammlung.",
    "Befreiung von Gier, Hass und Unwissenheit und damit vom Leiden.",
    "Er gilt als erwachter Lehrer, der den Weg zeigt, nicht als Schöpfer der Welt.",
    "Geburt, Erwachen und Tod Buddhas werden je nach Tradition gemeinsam erinnert.",
    "Mönche und Nonnen leben meist nach mehr Regeln; Laien leben im Alltag und unterstützen die Gemeinschaft.",
    "Beispiel: Zuerst lebte Siddhartha geschützt im Palast. Danach verliess er ihn und suchte einen Weg aus dem Leid. Schliesslich fand er den Mittleren Weg und erwachte unter dem Bodhi-Baum.",
    "Falsch.", "Richtig.",
]

hindu_a = [
    "Om.", "Ein hinduistischer Tempel.", "Verehrung, oft mit Licht, Blumen, Gebeten und Gaben.",
    "Die umfassende göttliche Wirklichkeit, die allem zugrunde liegt.", "Das innerste Selbst oder die Seele.",
    "Handlungen haben Folgen, zum Beispiel kann hilfsbereites Handeln gutes Karma bewirken.",
    "Der Kreislauf von Geburt, Tod und Wiedergeburt.", "Befreiung aus Samsara.",
    "Handlungen prägen Karma; Karma beeinflusst weitere Wiedergeburten; Moksha beendet den Kreislauf.",
    "Schöpfung.", "Bewahrung und Schutz.", "Verwandlung, Zerstörung und Neubeginn.",
    "Am Elefantenkopf.", "Für Glück und Wohlstand.", "Für Wissen, Musik und Kunst.",
    "Rama und Krishna.", "Das Lichterfest und den Sieg des Lichts über die Dunkelheit.",
    "Zum Beispiel Veden, Upanishaden oder Bhagavad Gita.",
    "Beispiel: Ganesha erkennt man an seinem Elefantenkopf. Er steht für Neuanfänge und hilft symbolisch beim Überwinden von Hindernissen.",
    "Falsch. Hinduistische Traditionen sind vielfältig.",
]

mixed_a = [
    "A", "C", "A", "B", "A", "A", "B", "C", "B", "A",
    "Zum Beispiel Stupa oder Kloster; Mandir oder Hausaltar.",
    "Zum Beispiel Meditation oder Vesakh; Puja oder Diwali.",
    "Beide bezeichnen Befreiung. Nirvana beendet im Buddhismus die Ursachen des Leidens; Moksha ist im Hinduismus die Befreiung aus Samsara.",
    "Im Buddhismus meint Dharma vor allem Buddhas Lehre; im Hinduismus kann Dharma Pflicht, Ordnung und richtiges Handeln bedeuten.",
    "Symbole helfen beim Zuordnen, aber eine Erklärung braucht zusätzlich Bedeutung, Lehre und Praxis.",
    "Im Buddhismus steht kein Schöpfergott im Zentrum; im Hinduismus werden viele Gottheiten als Formen oder Zugänge zur göttlichen Wirklichkeit verehrt.",
    "In beiden Religionen zählt verantwortliches Handeln und seine Wirkung auf den eigenen Weg.",
    "Individuelle Antwort.", "Individuelle Antwort.",
    "Individuelle Antwort mit Name, sichtbarem Merkmal und Bedeutung; zum Beispiel Ganesha - Elefantenkopf - Neuanfang und Hindernisse überwinden.",
]


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm, title="Lernheft Prüfung Teil 2", author="Davids Weltreligionen-Training")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=page)])
    story = []

    story += [Spacer(1, 34 * mm), p("NMG - 6. KLASSE", "CoverEyebrow"), p("Lernheft Weltreligionen", "CoverTitle"), p("Prüfung Teil 2", "CoverTitle"), Spacer(1, 8 * mm), p("Buddhismus, Buddhas Leben und Lehre, Hinduismus und hinduistische Gottheiten", "CoverSub"), Spacer(1, 18 * mm), p("Für David", "CoverSub"), p("60 Übungsfragen mit Lösungen und zwei SRF-Videos", "CoverEyebrow"), PageBreak()]

    story += title("So arbeitest du mit diesem Heft", "Lies zuerst die Wissensseiten. Löse danach die drei Übungsblöcke ohne Lösungen. Korrigiere erst am Schluss und markiere Fragen, die du im Site noch einmal trainieren möchtest.")
    story += checklist(["Ich kann Buddhismus und Hinduismus anhand wichtiger Merkmale vergleichen.", "Ich kann Buddhas Lebensweg in der richtigen Reihenfolge erzählen.", "Ich kann die vier edlen Wahrheiten und den achtfachen Pfad erklären.", "Ich kann Karma, Samsara und Moksha miteinander verbinden.", "Ich kann eine hinduistische Gottheit mit Name, Merkmal und Bedeutung beschreiben."])
    story += [p("Mein Lernrhythmus", "H2x"), p("1. Lernen: 15 Minuten lesen und Schlüsselwörter markieren.<br/>2. Erinnern: Seite schliessen und laut erklären.<br/>3. Üben: 10 Fragen lösen.<br/>4. Verbessern: Fehler im Online-Training wiederholen."), p("SRF-Videos", "H2x"), p('<link href="https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/die-weltreligion-buddhismus?urn=urn%3Asrf%3Avideo%3A108463a7-a364-4397-906a-51f07867d885" color="#B65B13">Die Weltreligion Buddhismus - SRF Kids</link>'), p('<link href="https://www.srf.ch/play/tv/srf-kids---clip-und-klar/video/die-weltreligion-hinduismus?urn=urn%3Asrf%3Avideo%3Acb5925cd-6358-4659-bca5-e96ad0b0ddd1" color="#B65B13">Die Weltreligion Hinduismus - SRF Kids</link>'), p("Video-Auftrag: Beim ersten Schauen nur zuhören. Beim zweiten Schauen drei Schlüsselwörter und eine offene Frage notieren."), ruled(3), PageBreak()]

    story += title("Buddhismus und Hinduismus vergleichen", "Diese Übersicht hilft beim Zuordnen. In einer guten Prüfungsantwort nennst du nicht nur ein Symbol, sondern auch Lehre, Ort, Regeln oder Bräuche.")
    story += [comparison_table([
        ("Verbreitung", "Vor allem Ost-, Südost- und Teile Südasiens", "Vor allem Indien und Südasien"),
        ("Symbol", "Dharma-Rad", "Om"),
        ("Gottesverständnis", "Kein Schöpfergott im Zentrum", "Viele Gottheiten; Brahman als göttliche Wirklichkeit"),
        ("Religiöse Orte", "Tempel, Kloster, Stupa", "Mandir, Hausaltar"),
        ("Schriften", "Verschiedene Sammlungen, zum Beispiel Pali-Kanon", "Veden, Upanishaden, Bhagavad Gita"),
        ("Wichtige Regeln", "Fünf Übungsregeln; achtfacher Pfad", "Dharma; gutes Handeln und Karma"),
        ("Bräuche", "Meditation, Gaben, Vesakh", "Puja, Diwali, Pilgerreisen"),
        ("Ziel", "Nirvana", "Moksha"),
    ]), Spacer(1, 5 * mm), p("Merksatz", "H2x"), p("Buddhismus: Buddha - Dharma-Rad - vier Wahrheiten - achtfacher Pfad - Nirvana.<br/>Hinduismus: Om - Brahman - Atman - Karma - Samsara - Moksha."), PageBreak()]

    story += title("Buddhas Lebensweg", "Siddhartha Gautama suchte einen Weg, das Leiden zu verstehen und zu überwinden.")
    timeline = [
        ("1 Palast", "Siddhartha wächst geschützt und wohlhabend auf."),
        ("2 Vier Begegnungen", "Alter, Krankheit, Tod und ein Suchender verändern seinen Blick."),
        ("3 Auszug", "Er verlässt den Palast, um Antworten zu finden."),
        ("4 Askese", "Er lebt sehr streng, erkennt aber, dass Selbstquälerei nicht zum Ziel führt."),
        ("5 Mittlerer Weg", "Er wählt einen Weg zwischen Luxus und extremer Entbehrung."),
        ("6 Erwachen", "Unter dem Bodhi-Baum versteht er die Ursachen des Leidens und wird zum Buddha."),
        ("7 Lehren", "Er erklärt den Weg aus dem Leiden und gründet eine Gemeinschaft."),
    ]
    for head, body in timeline:
        story += [KeepTogether([p(head, "H2x"), p(body)])]
    story += [p("Erzählhilfe", "H2x"), p("Verwende Verbindungswörter: zuerst - dann - weil - deshalb - schliesslich."), PageBreak()]

    story += title("Vier Wahrheiten und achtfacher Pfad", "Die vier edlen Wahrheiten führen vom Erkennen des Problems zum praktischen Lösungsweg.")
    story += [comparison_table([
        ("1 Beobachtung", "Leid und Unzufriedenheit gehören zum Leben.", "Was ist das Problem?"),
        ("2 Ursache", "Gier, Hass und Unwissenheit lassen Leid entstehen.", "Warum entsteht es?"),
        ("3 Ziel", "Wenn die Ursachen enden, kann auch das Leiden enden.", "Was ist möglich?"),
        ("4 Weg", "Der achtfache Pfad führt zur Überwindung des Leidens.", "Wie gelingt es?"),
    ], widths=(36, 83, 43)), Spacer(1, 5 * mm), p("Der achtfache Pfad", "H2x"), p("Rechte Sicht, rechte Absicht, rechte Rede, rechtes Handeln, rechter Lebensunterhalt, rechtes Bemühen, rechte Achtsamkeit und rechte Sammlung. 'Recht' bedeutet hier hilfreich, angemessen und auf das Ziel ausgerichtet."), p("Nirvana", "H2x"), p("Nirvana bedeutet Befreiung von Gier, Hass und Unwissenheit. Dadurch endet das Leiden."), PageBreak()]

    story += title("Übungsblock A Buddhismus", "Beantworte alle 20 Fragen. Nutze bei Erklärfragen ganze Sätze.") + questions(buddha_q[:10], 1, True) + [PageBreak()]
    story += title("Übungsblock A Buddhismus", "Fragen 11 bis 20") + questions(buddha_q[10:], 11, True) + [PageBreak()]

    story += title("Hinduismus verstehen", "Der Hinduismus ist vielfältig. Begriffe und Bräuche können je nach Tradition unterschiedlich wichtig sein.")
    story += [p("Brahman und Atman", "H2x"), p("Brahman bezeichnet die umfassende göttliche Wirklichkeit. Atman ist das innerste Selbst. Viele hinduistische Lehren fragen nach der Verbindung zwischen Atman und Brahman."), p("Karma, Samsara und Moksha", "H2x"), p("Handlungen haben Folgen: Das ist Karma. Diese Folgen beeinflussen den Kreislauf von Geburt, Tod und Wiedergeburt, den Samsara. Moksha bedeutet Befreiung aus diesem Kreislauf."), p("Religiöser Alltag", "H2x"), p("Bei einer Puja werden Gottheiten verehrt, zum Beispiel mit Licht, Blumen, Gebeten oder Gaben. Puja kann im Mandir oder am Hausaltar stattfinden. Diwali ist ein wichtiges Lichterfest."), p("Schriften", "H2x"), p("Zu den wichtigen Schriften gehören die Veden, die Upanishaden und die Bhagavad Gita."), p("Prüfungstipp", "H2x"), p("Verknüpfe Begriffe: Eine Handlung prägt das Karma. Karma beeinflusst weitere Wiedergeburten im Samsara. Moksha ist die Befreiung aus diesem Kreislauf."), PageBreak()]

    story += title("Hinduistische Gottheiten", "Beschreibe eine Gottheit immer nach demselben Bauplan: Name - Erkennungsmerkmal - Bedeutung oder Aufgabe.")
    story += [comparison_table([
        ("Brahma", "Oft vier Köpfe", "Schöpfung"),
        ("Vishnu", "Krone und Diskus; Avatare Rama und Krishna", "Bewahrung und Schutz"),
        ("Shiva", "Dreizack und Tanz", "Verwandlung, Zerstörung und Neubeginn"),
        ("Ganesha", "Elefantenkopf", "Neuanfänge und Hindernisse überwinden"),
        ("Lakshmi", "Lotus", "Glück und Wohlstand"),
        ("Saraswati", "Buch oder Instrument", "Wissen, Musik und Kunst"),
    ], widths=(36, 70, 56)), Spacer(1, 5 * mm), p("Antwortbeispiel", "H2x"), p("Ich beschreibe Ganesha. Man erkennt ihn an seinem Elefantenkopf. Viele Hindus verehren ihn als Helfer bei Neuanfängen und beim Überwinden von Hindernissen."), p("Meine eigene Beschreibung", "H2x"), ruled(6), PageBreak()]

    story += title("Übungsblock B Hinduismus", "Beantworte alle 20 Fragen. Nutze bei Erklärfragen ganze Sätze.") + questions(hindu_q[:10], 1, True) + [PageBreak()]
    story += title("Übungsblock B Hinduismus", "Fragen 11 bis 20") + questions(hindu_q[10:], 11, True) + [PageBreak()]

    story += title("Übungsblock C Gemischter Test", "20 Fragen wie in einer Probeprüfung. Kreuze bei A bis C genau eine Antwort an.") + questions(mixed_q[:10], 1, False) + [Spacer(1, 3 * mm), ruled(3), PageBreak()]
    story += title("Übungsblock C Gemischter Test", "Fragen 11 bis 20") + questions(mixed_q[10:], 11, True) + [PageBreak()]

    story += title("Lösungen Übungsblock A", "Vergleiche sinngemäss. Eigene Formulierungen sind richtig, wenn die Kernaussage stimmt.") + answer_list(buddha_a[:10], 1) + [PageBreak()]
    story += title("Lösungen Übungsblock A", "Fragen 11 bis 20") + answer_list(buddha_a[10:], 11) + [p("Auswertung", "H2x"), p("17-20 richtig: sehr sicher. 13-16 richtig: gut, einzelne Lücken üben. 0-12 richtig: Wissensseiten noch einmal lesen und danach im Site trainieren."), PageBreak()]

    story += title("Lösungen Übungsblock B", "Vergleiche sinngemäss. Bei Frage 19 sind andere passende Gottheiten möglich.") + answer_list(hindu_a[:10], 1) + [PageBreak()]
    story += title("Lösungen Übungsblock B", "Fragen 11 bis 20") + answer_list(hindu_a[10:], 11) + [p("Auswertung", "H2x"), p("17-20 richtig: sehr sicher. 13-16 richtig: gut, einzelne Lücken üben. 0-12 richtig: Wissensseiten noch einmal lesen und danach im Site trainieren."), PageBreak()]

    story += title("Lösungen Übungsblock C", "Die offenen Antworten sind Beispiele. Entscheidend sind korrekte Begriffe und verständliche Zusammenhänge.") + answer_list(mixed_a, 1)
    story += [Spacer(1, 4 * mm), p("Mein nächster Schritt", "H2x"), p("Drei Themen, die ich noch einmal übe:"), ruled(3)]

    doc.build(story)
    PUBLIC.write_bytes(OUTPUT.read_bytes())
    print(OUTPUT)
    print(PUBLIC)


if __name__ == "__main__":
    build()
