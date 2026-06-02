// Bouw 1 Begroting Report Template
// Rendered via typst-as-lib from Open Calc Studio
// Default neutral budget layout for the Bouw 1 tenant.

#let data = json("data.json")

// Page setup: dynamic size and orientation from data
#let page-size = if data.at("page_size", default: "a4") == "a3" { "a3" } else { "a4" }
#let is-landscape = data.at("page_orientation", default: "landscape") == "landscape"

#set page(
  page-size,
  flipped: is-landscape,
  margin: (left: 10mm, right: 10mm, top: 37mm, bottom: 14mm),
  header: context {
    set text(font: "Arial", size: 6pt, fill: rgb("#000"))
    v(15mm)
    block(width: 100%, {
      grid(
        columns: (60pt, 1fr, 60pt),
        align: (left, center, right),
        image("logo-left.png", width: 60pt),
        {
          set text(size: 6.5pt)
          grid(
            columns: (auto, auto),
            column-gutter: 3pt,
            row-gutter: 1.5pt,
            align: (right, left),
            text("Volgnr.:"), text(data.project_number),
            text("T.b.v.:"), text(data.client),
            text("Project:"), text(data.project_name),
            text("Auteur:"), text(data.author),
          )
          v(2pt)
          text(size: 10pt, weight: "bold", "Begroting")
        },
        image("logo-right.png", width: 60pt),
      )
    })
    v(2pt)
  },
  footer: context {
    set text(size: 6pt, fill: rgb("#000"), font: "Arial")
    line(length: 100%, stroke: 0.3pt + rgb("#b0b0b0"))
    v(2pt)
    text(size: 6pt, "Op al onze offertes zijn de algemene voorwaarden van toepassing. Deze voorwaarden zijn bij dit document als bijlage bijgesloten.")
    linebreak()
    text(size: 6pt, "Bouw 1 - Open Calc Studio voorbeeld huisstijl")
    h(1fr)
    set text(size: 7pt)
    [#counter(page).display() - #counter(page).final().at(0)]
  },
)

// Default text style
#set text(font: "Arial", size: 6pt, fill: rgb("#000"))

// Right-align helper
#let rcell(content) = align(right, content)

// Column widths: use fractional units matching reference proportions (total ~630 parts)
// Hst(10) Par(10) Nr(10) Omschrijving(160) AantalEh(40) Norm(18) Uren(18) Tar(8) Loon(40) Prijs(34) Materiaal(34) Materieel(36) Stelpost(32) Ond.aann(36) Kosten/eh(38) Subtotaal(46) Totaal(60) Memo(40)
#let col-widths = (10fr, 10fr, 10fr, 160fr, 40fr, 18fr, 18fr, 8fr, 40fr, 34fr, 34fr, 36fr, 32fr, 36fr, 38fr, 46fr, 60fr, 40fr)

// Table headers
#let headers = ("Hst", "Par", "Nr", "Omschrijving", "Aantal Eh.", "Norm", "Uren", "Tar.", "Loon", "Prijs", "Materiaal", "Materieel", "Stelpost", "Ond.aann.", "Kosten/eh", "Subtotaal", "Totaal", "Memo")

// Right-aligned column indices (0-based): Loon(8), Prijs(9), Materiaal(10), Materieel(11), Stelpost(12), Ond.aann(13), Kosten/eh(14), Subtotaal(15), Totaal(16)
#let right-cols = (8, 9, 10, 11, 12, 13, 14, 15, 16)

// Format a cell value, right-aligning numeric columns
#let fmt-cell(idx, val, bold: false) = {
  let content = if bold { text(weight: "bold", val) } else { val }
  if idx in right-cols { align(right, content) } else { content }
}

// === Header is now rendered via page header (repeats on every page) ===

// Render a chapter section
#let render-chapter(chapter) = {
  // Chapter title
  text(size: 10pt, chapter.title)
  v(2pt)

  // Chapter table
  table(
    columns: col-widths,
    stroke: none,
    inset: (x: 1pt, y: 1.5pt),
    align: left,

    // Header row (repeats on page breaks)
    table.header(
      table.hline(stroke: 0.5pt + rgb("#000")),
      ..headers.enumerate().map(((idx, h)) => table.cell({
          set text(size: 5pt)
          if idx in right-cols { align(right, h) } else { h }
        },
      )),
      table.hline(stroke: 0.5pt + rgb("#000")),
    ),

    // Data rows
    ..chapter.rows.map(row => {
      let vals = (row.hst, row.par, row.nr, row.omschrijving, row.aantal_eh, row.norm, row.uren, row.tar, row.loon, row.prijs, row.materiaal, row.materieel, row.stelpost, row.ond_aann, row.kosten_eh, row.subtotaal, row.totaal, row.memo)

      if row.is_subtotal {
        (
          table.hline(stroke: 0.5pt + rgb("#808080")),
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fill: rgb("#d3d3d3"),
            fmt-cell(idx, v, bold: true),
          )),
          table.hline(stroke: 0.5pt + rgb("#808080")),
        )
      } else {
        (
          ..vals.enumerate().map(((idx, v)) => table.cell(
            fmt-cell(idx, v, bold: row.is_chapter),
          )),
          table.hline(stroke: 0.5pt + rgb("#b0b0b0")),
        )
      }
    }).flatten()
  )

  v(4pt)
}

// Totalen section
#let render-totalen(totalen) = {
  text(size: 10pt, weight: "bold", "TOTALEN")
  v(3pt)

  let tot-widths = (160fr, 30fr, 50fr, 50fr, 50fr, 50fr, 50fr, 50fr, 50fr, 60fr)
  let tot-headers = ("Omschrijving", "%", "Loon", "Materiaal", "Materieel", "Stelpost", "Ond.Aann.", "Bedrag", "Post", "Totaal")

  table(
    columns: tot-widths,
    stroke: none,
    inset: (x: 2pt, y: 2pt),

    table.header(
      table.hline(stroke: 0.5pt + rgb("#000")),
      ..tot-headers.enumerate().map(((idx, h)) => table.cell({
          set text(size: 5pt)
          if idx >= 2 { align(right, h) } else { h }
        },
      )),
      table.hline(stroke: 0.5pt + rgb("#000")),
    ),

    ..totalen.rows.map(row => {
      let vals = (row.label, row.percentage, row.loon, row.materiaal, row.materieel, row.stelpost, row.ond_aann, row.bedrag, row.post, row.totaal)
      (
        ..vals.enumerate().map(((idx, v)) => table.cell({
            let content = if row.is_bold { text(weight: "bold", v) } else { v }
            if idx >= 2 { align(right, content) } else { content }
          },
        )),
        table.hline(stroke: 0.5pt + rgb("#b0b0b0")),
      )
    }).flatten()
  )
}

// === Main document ===

// Rapportdatum (alleen op eerste pagina, rechtsboven in body)
#align(right)[#text(size: 7pt, weight: "bold")[Datum: #data.at("report_date", default: "")]]
#v(2pt)

// Chapters
#for chapter in data.chapters {
  render-chapter(chapter)
}

// Totalen
#if data.totalen != none {
  render-totalen(data.totalen)
}
