// IBIS-stijl Begroting Report Template
// Rendered via typst-as-lib from Open Calc Studio.
// Lookalike of the IBIS-TRAD calculatie-uitdraai (landscape, blauwe hoofdstukken).
// Brand-neutraal: logos worden meegegeven als bytes (logo-left.png / logo-right.png).

#let data = json("data.json")

// Page setup: dynamic size and orientation from data
#let page-size = if data.at("page_size", default: "a4") == "a3" { "a3" } else { "a4" }
#let is-landscape = data.at("page_orientation", default: "landscape") == "landscape"

// IBIS colour palette
#let col-chapter = rgb("#bfe3ee")   // hoofdstuk: lichtblauw/cyaan
#let col-subhead = rgb("#e3f2f8")   // subkop: lichter
#let col-subtotal = rgb("#dfe7ea")  // subtotaal: grijsblauw
#let col-line = rgb("#9fb6bf")
#let col-line-light = rgb("#d0dde2")

#set page(
  page-size,
  flipped: is-landscape,
  margin: (left: 8mm, right: 8mm, top: 34mm, bottom: 13mm),
  header: context {
    set text(font: "Arial", size: 6pt, fill: rgb("#000"))
    v(6mm)
    block(width: 100%, {
      grid(
        columns: (1fr, 70pt),
        align: (left, right),
        // Left: project header block
        {
          grid(
            columns: (auto, auto),
            column-gutter: 4pt,
            row-gutter: 1.2pt,
            align: (left, left),
            text(weight: "bold", "Documentnaam"), text(data.at("document_name", default: "")),
            text(weight: "bold", "Project"), text(data.project_name),
            text(weight: "bold", "Projectnummer"), text(data.project_number),
          )
          v(1.5pt)
          grid(
            columns: (auto, auto, 14pt, auto, auto),
            column-gutter: 4pt,
            row-gutter: 1.2pt,
            align: (left, left, left, left, left),
            text(weight: "bold", "Peildatum:"), text(data.at("report_date", default: "")), [],
              text(weight: "bold", "Opdrachtgever:"), text(data.client),
            text(weight: "bold", "Calculator"), text(data.author), [],
              text(weight: "bold", "Expert:"), text(data.at("expert", default: "")),
          )
        },
        // Right: logo
        image("logo-right.png", width: 70pt),
      )
    })
    v(1.5pt)
    line(length: 100%, stroke: 0.5pt + rgb("#000"))
  },
  footer: context {
    set text(size: 6pt, fill: rgb("#000"), font: "Arial")
    line(length: 100%, stroke: 0.3pt + col-line)
    v(2pt)
    grid(
      columns: (1fr, auto),
      align: (left, right),
      text(size: 6pt, data.at("document_name", default: "")),
      [#text(size: 7pt)[Pagina: #counter(page).display() van #counter(page).final().at(0)]],
    )
  },
)

// Default text style
#set text(font: "Arial", size: 6pt, fill: rgb("#000"))

// ── Hoofdtabel kolommen ──
// Stabucode | S | Omschrijving | Hoeveelheid | Eh | Uurnorm | Uren | Materiaal | Materieel | Onderaan | Eenheidsprijs | TOTAAL
#let col-widths = (34fr, 8fr, 230fr, 36fr, 22fr, 30fr, 30fr, 46fr, 46fr, 46fr, 48fr, 52fr)
#let headers = ("Stabucode", "S", "Omschrijving", "Hoeveelheid", "Eh", "Uurnorm", "Uren", "Materiaal", "Materieel", "Onderaan.", "Eenheidsprijs", "TOTAAL")

// Right-aligned numeric columns (0-based): Hoeveelheid(3), Uurnorm(5), Uren(6),
// Materiaal(7), Materieel(8), Onderaan(9), Eenheidsprijs(10), TOTAAL(11)
#let right-cols = (3, 5, 6, 7, 8, 9, 10, 11)
// Centered columns: S(1), Eh(4)
#let center-cols = (1, 4)

#let fmt-cell(idx, val, bold: false) = {
  let content = if bold { text(weight: "bold", val) } else { val }
  if idx in right-cols { align(right, content) }
  else if idx in center-cols { align(center, content) }
  else { content }
}

// Render one chapter section (all rows belonging to one top-level hoofdstuk)
#let render-chapter(chapter) = {
  table(
    columns: col-widths,
    stroke: none,
    inset: (x: 1.5pt, y: 1.4pt),
    align: left,

    // Header row (repeats on page breaks)
    table.header(
      table.hline(stroke: 0.5pt + rgb("#000")),
      ..headers.enumerate().map(((idx, h)) => table.cell(
        fill: rgb("#e8eef0"),
        {
          set text(size: 5pt, weight: "bold")
          if idx in right-cols { align(right, h) }
          else if idx in center-cols { align(center, h) }
          else { h }
        },
      )),
      table.hline(stroke: 0.5pt + rgb("#000")),
    ),

    // Chapter title row (blauwe achtergrond, full width via colspan)
    table.cell(colspan: 12, fill: col-chapter, inset: (x: 2pt, y: 2.5pt),
      text(size: 7.5pt, weight: "bold", chapter.title)),

    // Data rows
    ..chapter.rows.map(row => {
      let vals = (row.stabucode, row.s, row.omschrijving, row.hoeveelheid, row.eh, row.uurnorm, row.uren, row.materiaal, row.materieel, row.onderaan, row.eenheidsprijs, row.totaal)

      if row.is_subtotal {
        (
          table.hline(stroke: 0.5pt + col-line),
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fill: col-subtotal,
            fmt-cell(idx, v, bold: true),
          )),
          table.hline(stroke: 0.5pt + col-line),
        )
      } else if row.level == 0 {
        // hoofdstuk-niveau regel binnen sectie (zelden) — blauw
        (
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fill: col-chapter,
            fmt-cell(idx, v, bold: true),
          )),
          table.hline(stroke: 0.4pt + col-line-light),
        )
      } else if row.level == 1 {
        // subkop — lichter
        (
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fill: col-subhead,
            fmt-cell(idx, v, bold: true),
          )),
          table.hline(stroke: 0.4pt + col-line-light),
        )
      } else {
        // normale regel
        (
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fmt-cell(idx, v),
          )),
          table.hline(stroke: 0.4pt + col-line-light),
        )
      }
    }).flatten()
  )

  v(5pt)
}

// ── Footer-cascade (TOTALEN) IBIS-stijl ──
#let render-totalen(totalen) = {
  v(4pt)
  // Header bar
  text(size: 8pt, weight: "bold", "Staart")
  v(2pt)

  // Symbol | Omschrijving | % / grondslag | Post (Totaal) | Totaal generaal
  let tot-widths = (16fr, 200fr, 60fr, 70fr, 80fr)
  let tot-headers = ("", "Omschrijving", "%", "Totaal", "Totaal generaal")

  table(
    columns: tot-widths,
    stroke: none,
    inset: (x: 2pt, y: 2pt),

    table.header(
      table.hline(stroke: 0.5pt + rgb("#000")),
      ..tot-headers.enumerate().map(((idx, h)) => table.cell({
          set text(size: 5pt, weight: "bold")
          if idx >= 2 { align(right, h) } else { h }
        },
      )),
      table.hline(stroke: 0.5pt + rgb("#000")),
    ),

    ..totalen.rows.map(row => {
      // % column shows percentage if present else grondslag (bedrag)
      let pct-or-base = if row.percentage != "" { row.percentage } else { row.bedrag }
      let vals = (row.symbol, row.label, pct-or-base, row.post, row.totaal)
      (
        ..vals.enumerate().map(((idx, v)) => table.cell(
          fill: if row.is_bold { col-subtotal } else { none },
          {
            let content = if row.is_bold { text(weight: "bold", v) } else { v }
            if idx >= 2 { align(right, content) }
            else if idx == 0 { align(center, content) }
            else { content }
          },
        )),
        table.hline(stroke: 0.3pt + col-line-light),
      )
    }).flatten()
  )
}

// === Main document ===

// Chapters
#for chapter in data.chapters {
  render-chapter(chapter)
}

// Staart / Totalen
#if data.totalen != none {
  render-totalen(data.totalen)
}
