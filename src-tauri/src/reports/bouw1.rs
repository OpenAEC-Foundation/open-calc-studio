//! Bouw 1 PDF report generation using Typst.
//! Template: tenants/bouw1/templates/begroting.typ (margin: top=37mm with 15mm header offset, bottom=14mm)
//! Generates Bouw 1 branded budget reports with:
//! - Landscape A4 with logos and project header
//! - 18-column budget tables per chapter
//! - Totalen (staartkosten) summary section
//! - Footer with company info and page numbers

use super::{CostItem, ReportRequest};

static BOUW1_TEMPLATE: &str = include_str!("../../../tenants/bouw1/templates/begroting.typ");
// Tiny 1x1 transparent PNG used when no logo is configured. Logos are no longer
// bundled - users supply their own via CompanyInfo.logoLeft/logoRight (PNG base64).
// Valid 8-bit gray+alpha 1x1 transparent PNG (68 bytes, verified by zlib).
static EMPTY_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x04, 0x00, 0x00, 0x00, 0xB5, 0x1C, 0x0C, 0x02, 0x00, 0x00, 0x00,
    0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x60, 0x00, 0x00,
    0x00, 0x03, 0x00, 0x01, 0xB8, 0xAD, 0x3A, 0x63, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

#[derive(serde::Serialize)]
struct Bouw1ReportData {
    project_name: String,
    project_number: String,
    client: String,
    author: String,
    report_date: String,
    chapters: Vec<Bouw1Chapter>,
    totalen: Option<Bouw1Totalen>,
    #[serde(default)]
    page_size: String,
    #[serde(default)]
    page_orientation: String,
    /// Rapportteksten in de rapporttaal (platte keys); het sjabloon valt per
    /// key terug op de Nederlandse tekst.
    labels: std::collections::HashMap<String, String>,
}

#[derive(serde::Serialize)]
struct Bouw1Chapter {
    title: String,
    rows: Vec<Bouw1Row>,
    subtotal: String,
}

#[derive(serde::Serialize)]
struct Bouw1Row {
    hst: String,
    par: String,
    nr: String,
    omschrijving: String,
    aantal_eh: String,
    norm: String,
    uren: String,
    tar: String,
    loon: String,
    prijs: String,
    materiaal: String,
    materieel: String,
    stelpost: String,
    ond_aann: String,
    kosten_eh: String,
    subtotaal: String,
    totaal: String,
    memo: String,
    is_chapter: bool,
    is_subtotal: bool,
}

#[derive(serde::Serialize)]
struct Bouw1Totalen {
    rows: Vec<Bouw1TotalenRow>,
}

#[derive(serde::Serialize)]
struct Bouw1TotalenRow {
    label: String,
    percentage: String,
    loon: String,
    materiaal: String,
    materieel: String,
    stelpost: String,
    ond_aann: String,
    bedrag: String,
    post: String,
    totaal: String,
    is_bold: bool,
}

/// Resource breakdown for a single item or aggregated from children.
struct ResourceBreakdown {
    loon: f64,
    materiaal: f64,
    materieel: f64,
    stelpost: f64,
    ond_aann: f64,
}

/// Compute resource breakdown for an item based on its resourceType.
/// For leaf items: map total to the correct column.
/// For parent items: caller should sum children.
fn compute_item_breakdown(item: &CostItem) -> ResourceBreakdown {
    let total = item.total;
    let rt = item.resource_type.as_deref().unwrap_or("");
    let mut bd = ResourceBreakdown { loon: 0.0, materiaal: 0.0, materieel: 0.0, stelpost: 0.0, ond_aann: 0.0 };

    match rt {
        "arbeid" => bd.loon = total,
        "materiaal" => bd.materiaal = total,
        "materieel" => bd.materieel = total,
        "onderaannemer" => bd.ond_aann = total,
        "overig" => bd.stelpost = total,
        _ => {
            // No resource type: use heuristics
            if item.labor_price.unwrap_or(0.0) > 0.0 {
                bd.loon = item.labor_price.unwrap_or(0.0);
                let rest = total - bd.loon;
                if rest > 0.0 { bd.materiaal = rest; }
            } else if item.norm_unit_price.unwrap_or(0.0) > 0.0 {
                bd.materiaal = total;
            } else {
                bd.ond_aann = total;
            }
        }
    }
    bd
}

/// Compute aggregated breakdown for a parent item by summing all descendants.
fn compute_parent_breakdown(parent_id: &str, all_items: &[&CostItem]) -> ResourceBreakdown {
    let mut bd = ResourceBreakdown { loon: 0.0, materiaal: 0.0, materieel: 0.0, stelpost: 0.0, ond_aann: 0.0 };
    // Collect all descendants (not just direct children)
    let mut stack: Vec<&str> = vec![parent_id];
    while let Some(pid) = stack.pop() {
        for item in all_items.iter() {
            if item.parent_id.as_deref() == Some(pid) {
                let children: Vec<&&CostItem> = all_items.iter().filter(|i| i.parent_id.as_deref() == Some(&item.id)).collect();
                if children.is_empty() {
                    // Leaf node: compute breakdown
                    let child_bd = compute_item_breakdown(item);
                    bd.loon += child_bd.loon;
                    bd.materiaal += child_bd.materiaal;
                    bd.materieel += child_bd.materieel;
                    bd.stelpost += child_bd.stelpost;
                    bd.ond_aann += child_bd.ond_aann;
                } else {
                    // Has children: recurse
                    stack.push(&item.id);
                }
            }
        }
    }
    bd
}

/// Hst/Par/Nr-kolommen. Zoals de HTML-print (bouw1PrintService.ts): het
/// hiërarchische `nr` op punten splitsen. Zonder `nr` (CLI, MCP) valt het
/// terug op de code: met punten op dezelfde manier, anders de oude vaste
/// indeling 1/2/rest — per teken, niet per byte, zodat een en-dash of
/// andere niet-ASCII-tekens de export niet laten vastlopen.
fn split_hst_par_nr(item: &CostItem) -> (String, String, String) {
    let from_parts = |s: &str| {
        let parts: Vec<&str> = s.split('.').collect();
        (
            parts.first().map(|p| p.to_string()).unwrap_or_default(),
            parts.get(1).map(|p| p.to_string()).unwrap_or_default(),
            if parts.len() >= 3 { parts[2..].join(".") } else { String::new() },
        )
    };
    if let Some(nr) = item.nr.as_deref().filter(|n| !n.is_empty()) {
        return from_parts(nr);
    }
    let code = item.code.as_str();
    if code.contains('.') {
        return from_parts(code);
    }
    let chars: Vec<char> = code.chars().collect();
    let take = |a: usize, b: usize| chars[a.min(chars.len())..b.min(chars.len())].iter().collect::<String>();
    if chars.len() >= 6 {
        (take(0, 1), take(1, 3), take(3, chars.len()))
    } else if chars.len() >= 3 {
        (take(0, 1), take(1, 3), String::new())
    } else {
        (code.to_string(), String::new(), String::new())
    }
}

/// Hoofdstuktitel: "<code>. <omschrijving>", of alleen de omschrijving.
fn chapter_title(ch: &CostItem) -> String {
    if ch.code.is_empty() { ch.description.clone() } else { format!("{}. {}", ch.code, ch.description) }
}

fn build_bouw1_row(request: &ReportRequest, item: &CostItem, is_chapter: bool, all_items: &[&CostItem]) -> Bouw1Row {
    let nf = &request.number_format;
    let (hst, par, nr_val) = split_hst_par_nr(item);

    let qty_s = item.quantity.map(|q| nf.opt_number(Some(q))).unwrap_or_default();
    let unit = request.unit(item.unit.as_deref().unwrap_or(""));
    let aantal_eh = if qty_s.is_empty() { String::new() } else { format!("{} {}", qty_s, unit) };
    let labor = item.labor_price.unwrap_or(0.0);
    let labor_s = if labor != 0.0 { nf.currency(labor) } else { String::new() };
    let price_s = if item.unit_price != 0.0 { nf.currency(item.unit_price) } else { String::new() };
    let total_s = if item.total != 0.0 { nf.currency(item.total) } else { String::new() };
    let norm_s = item.norm_quantity.map(|n| nf.number(n, 3)).unwrap_or_default();
    let tg = item.tarief_groep.clone().unwrap_or_default();
    // Uren = aantal × norm ÷ productiecapaciteit (normFactor is een deler,
    // zoals in calculator.ts en urenProrate.ts; leeg of 0 telt als 1).
    let cap = item.norm_factor.filter(|c| *c != 0.0).unwrap_or(1.0);
    let uren = match (item.quantity, item.norm_quantity) {
        (Some(q), Some(n)) if q != 0.0 && n != 0.0 => nf.opt_number(Some(q * n / cap)),
        _ => String::new(),
    };
    let kosten_eh = if item.unit_price != 0.0 {
        nf.currency(item.unit_price)
    } else {
        String::new()
    };

    // Compute resource breakdown
    let has_children = all_items.iter().any(|i| i.parent_id.as_deref() == Some(&item.id));
    let bd = if has_children {
        compute_parent_breakdown(&item.id, all_items)
    } else {
        compute_item_breakdown(item)
    };

    Bouw1Row {
        hst,
        par,
        nr: nr_val,
        omschrijving: item.description.clone(),
        aantal_eh,
        norm: norm_s,
        uren,
        tar: tg,
        loon: if bd.loon != 0.0 { nf.currency(bd.loon) } else { labor_s },
        prijs: price_s,
        materiaal: if bd.materiaal != 0.0 { nf.currency(bd.materiaal) } else { String::new() },
        materieel: if bd.materieel != 0.0 { nf.currency(bd.materieel) } else { String::new() },
        stelpost: if bd.stelpost != 0.0 { nf.currency(bd.stelpost) } else { String::new() },
        ond_aann: if bd.ond_aann != 0.0 { nf.currency(bd.ond_aann) } else { String::new() },
        kosten_eh,
        subtotaal: total_s,
        // Totaal column: only show for top-level chapters (begrotingshoofdstukken)
        totaal: if is_chapter && item.depth == 0 { nf.currency(item.total) } else { String::new() },
        memo: String::new(),
        is_chapter,
        is_subtotal: false,
    }
}

fn empty_subtotal_row(subtotal: &str) -> Bouw1Row {
    Bouw1Row {
        hst: String::new(), par: String::new(), nr: String::new(),
        omschrijving: String::new(), aantal_eh: String::new(),
        norm: String::new(), uren: String::new(), tar: String::new(),
        loon: String::new(), prijs: String::new(),
        materiaal: String::new(), materieel: String::new(),
        stelpost: String::new(), ond_aann: String::new(), kosten_eh: String::new(),
        subtotaal: subtotal.to_string(), totaal: subtotal.to_string(), memo: String::new(),
        is_chapter: false, is_subtotal: true,
    }
}

fn build_bouw1_data(request: &ReportRequest) -> Bouw1ReportData {
    let nf = &request.number_format;
    // Alleen hoofdstuktotalen: alleen de getoonde rijen filteren; de staart
    // hieronder rekent over alle regels (request.items).
    let visible: Vec<&CostItem> = request.items.iter()
        .filter(|i| !i.row_type.starts_with("staart_") && i.row_type != "witregel")
        .filter(|i| request.shows_row(i))
        .collect();

    let mut chapters: Vec<Bouw1Chapter> = Vec::new();
    let mut cur_ch: Option<&CostItem> = None;
    let mut ch_rows: Vec<Bouw1Row> = Vec::new();

    // Pre-compute which items are "redundant parents": begrotingspost/bewakingspost
    // with children that just repeat the same info. Skip them in the report.
    let redundant_parents: std::collections::HashSet<&str> = visible.iter()
        .filter(|item| item.row_type == "begrotingspost" || item.row_type == "bewakingspost")
        .filter(|item| {
            let children: Vec<&&CostItem> = visible.iter()
                .filter(|c| c.parent_id.as_deref() == Some(&item.id))
                .collect();
            // Skip if has children (their details are shown instead)
            !children.is_empty()
        })
        .map(|item| item.id.as_str())
        .collect();

    for item in &visible {
        if item.row_type == "chapter" && item.depth == 0 {
            if let Some(ch) = cur_ch {
                if !ch_rows.is_empty() || ch.total != 0.0 {
                    let subtotal = nf.currency(ch.total);
                    ch_rows.push(empty_subtotal_row(&subtotal));
                    chapters.push(Bouw1Chapter {
                        title: chapter_title(ch),
                        rows: std::mem::take(&mut ch_rows),
                        subtotal,
                    });
                }
                ch_rows.clear();
            }
            cur_ch = Some(item);
        } else if redundant_parents.contains(item.id.as_str()) {
            // Skip begrotingspost/bewakingspost that has children - children shown instead
            continue;
        } else {
            ch_rows.push(build_bouw1_row(request, item, item.row_type == "chapter", &visible));
        }
    }
    if let Some(ch) = cur_ch {
        if !ch_rows.is_empty() || ch.total != 0.0 {
            let subtotal = nf.currency(ch.total);
            ch_rows.push(empty_subtotal_row(&subtotal));
            chapters.push(Bouw1Chapter {
                title: chapter_title(ch),
                rows: std::mem::take(&mut ch_rows),
                subtotal,
            });
        }
    }

    // Totalen: items-driven. De cascade (kostprijskolommen, opslagen en
    // afronding) volgt computeStaartItemBreakdowns in calculator.ts: eerst
    // alle niet-btw-regels in volgorde, daarna de btw over het excl-eindbedrag
    // (inclusief afronding), ongeacht waar de btw-regels in de staart staan.
    let staart_items: Vec<&CostItem> = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_"))
        .collect();

    let totalen = if !staart_items.is_empty() {
        let kp = super::staart::kostprijs_kolommen(&request.items);
        let kp_total = kp.totaal();

        let mut all_rows: Vec<Bouw1TotalenRow> = Vec::new();

        // Header: "Totaal kolommen"
        all_rows.push(Bouw1TotalenRow {
            label: request.lbl("summary.columnTotals", "Totaal kolommen:").into(),
            percentage: String::new(),
            loon: nf.currency(kp.loon),
            materiaal: nf.currency(kp.materiaal),
            materieel: nf.currency(kp.materieel),
            stelpost: nf.currency(kp.stelpost),
            ond_aann: nf.currency(kp.onderaanneming),
            bedrag: String::new(),
            post: String::new(),
            totaal: nf.currency(kp_total),
            is_bold: true,
        });

        let is_btw = |si: &CostItem| si.row_type == "staart_btw" || si.row_type == "staart_btw_laag";
        let pct_str = |si: &CostItem| match si.staart_percentage {
            Some(p) => nf.percent(p, 2),
            None => String::new(),
        };
        let amount = |v: f64| if v != 0.0 { nf.currency(v) } else { String::new() };
        let bold_total = |label: String, v: f64| Bouw1TotalenRow {
            label,
            percentage: String::new(),
            loon: String::new(), materiaal: String::new(), materieel: String::new(),
            stelpost: String::new(), ond_aann: String::new(), bedrag: String::new(),
            post: String::new(),
            totaal: nf.currency(v),
            is_bold: true,
        };

        // Ronde 1: opslagen en afronding (excl. btw), in staartvolgorde.
        let mut cascade = super::staart::Cascade::new(kp, kp_total);
        let mut after_kostprijs = false; // vóór risico/winst/verzekering
        for si in staart_items.iter().copied().filter(|si| !is_btw(si)) {
            let is_winst_phase = matches!(
                si.row_type.as_str(),
                "staart_risico" | "staart_winst" | "staart_verzekering" | "staart_wr"
            );
            if is_winst_phase && !after_kostprijs {
                all_rows.push(bold_total(
                    request.lbl("summary.totalCostPrice", "Totaal kostprijs:").into(),
                    cascade.cumulatief,
                ));
                after_kostprijs = true;
            }
            let st = cascade.apply(si);
            // Afronding van € 0 (standaardstaart zonder stap): geen lege rij.
            if si.row_type == "staart_afronding" && st.post.abs() < 0.005 {
                continue;
            }
            all_rows.push(Bouw1TotalenRow {
                label: si.description.clone(),
                percentage: pct_str(si),
                loon: amount(st.loon),
                materiaal: amount(st.materiaal),
                materieel: amount(st.materieel),
                stelpost: String::new(),
                ond_aann: amount(st.onderaanneming),
                bedrag: amount(st.bedrag),
                post: amount(st.post),
                totaal: String::new(),
                is_bold: false,
            });
        }
        let excl_eind = cascade.cumulatief;

        // Ronde 2: btw over het excl-eindbedrag. Laag btw-tarief: de
        // per-onderdeel markering (btw_tarief) gaat vóór de handmatige
        // grondslag; die fractie wordt pro rata over het excl-eindbedrag gelegd.
        let btw_items: Vec<&CostItem> = staart_items.iter().copied().filter(|si| is_btw(si)).collect();
        let mut last_total = excl_eind;
        if !btw_items.is_empty() {
            all_rows.push(bold_total(
                request.lbl("summary.totalExclVat", "Totaal excl. btw.:").into(),
                excl_eind,
            ));
            let laag_direct = crate::reports::btw_laag_direct(&request.items);
            let dir_totaal = crate::reports::direct_totaal(&request.items);
            let laag_fractie = if laag_direct > 0.0 && dir_totaal > 0.0 {
                Some(laag_direct / dir_totaal)
            } else {
                None
            };
            let raw = match laag_fractie {
                Some(f) => f * excl_eind,
                None => btw_items.iter()
                    .filter(|i| i.row_type == "staart_btw_laag")
                    .map(|i| i.staart_btw_basis.unwrap_or(0.0).max(0.0))
                    .sum(),
            };
            let laag_grondslag_totaal = raw.max(0.0).min(excl_eind.max(0.0));
            let mut laag_resterend = laag_grondslag_totaal;
            for si in &btw_items {
                let pct = si.staart_percentage.unwrap_or(0.0) / 100.0;
                let basis = if si.row_type == "staart_btw" {
                    // Hoog tarief over de rest van het excl-eindbedrag.
                    excl_eind - laag_grondslag_totaal
                } else {
                    // Laag tarief: bij markering de berekende grondslag,
                    // anders de eigen (geclampte) handmatige grondslag.
                    let b = if laag_fractie.is_some() {
                        laag_resterend
                    } else {
                        si.staart_btw_basis.unwrap_or(0.0).max(0.0).min(laag_resterend)
                    };
                    laag_resterend -= b;
                    b
                };
                let post = basis * pct;
                last_total += post;
                all_rows.push(Bouw1TotalenRow {
                    label: si.description.clone(),
                    percentage: pct_str(si),
                    loon: String::new(), materiaal: String::new(), materieel: String::new(),
                    stelpost: String::new(), ond_aann: String::new(),
                    bedrag: amount(basis),
                    post: amount(post),
                    totaal: String::new(),
                    is_bold: false,
                });
            }
        }

        // Finally: "Totaalprijs incl. btw." with last cumulative
        all_rows.push(Bouw1TotalenRow {
            label: request.lbl("summary.totalInclVat", "Totaalprijs incl. btw.:").into(),
            percentage: String::new(),
            loon: String::new(), materiaal: String::new(), materieel: String::new(),
            stelpost: String::new(), ond_aann: String::new(), bedrag: String::new(),
            post: String::new(),
            totaal: nf.currency(last_total),
            is_bold: true,
        });

        Some(Bouw1Totalen { rows: all_rows })
    } else {
        None
    };

    // Rapportdatum in de notatie van de rapporttaal; zonder datum: vandaag
    let report_date = match request.schedule.report_date.as_deref() {
        Some(s) if !s.is_empty() => nf.date(s),
        _ => nf.today(),
    };

    Bouw1ReportData {
        project_name: request.schedule.project_name.clone(),
        project_number: request.schedule.project_number.clone(),
        client: request.schedule.client.clone(),
        author: request.schedule.author.clone(),
        report_date,
        chapters,
        totalen,
        page_size: String::new(),
        page_orientation: String::new(),
        labels: request.labels.clone(),
    }
}

pub fn generate_bouw1_typst(request: &ReportRequest) -> Result<Vec<u8>, String> {
    use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};

    // Ensure tenant fonts directory has required fonts
    let tenant_path = {
        let candidates = [
            option_env!("CARGO_MANIFEST_DIR").map(|d| std::path::PathBuf::from(d).join("..").join("tenants").join("bouw1")),
            Some(std::path::PathBuf::from("tenants/bouw1")),
        ];
        candidates.into_iter().flatten().find(|p| p.exists())
            .unwrap_or_else(|| std::path::PathBuf::from("tenants/bouw1"))
    };
    let fonts_dir = tenant_path.join("fonts");
    let _ = std::fs::create_dir_all(&fonts_dir);
    let sys_fonts = std::path::Path::new("C:/Windows/Fonts");
    for (src, dst) in [("arial.ttf","Arial.ttf"),("arialbd.ttf","Arial-Bold.ttf"),("ariali.ttf","Arial-Italic.ttf")] {
        let d = fonts_dir.join(dst);
        if !d.exists() { let _ = std::fs::copy(sys_fonts.join(src), &d); }
    }

    // Build JSON data (include page settings)
    let mut data = build_bouw1_data(request);
    data.page_size = request.page_size.to_lowercase();
    data.page_orientation = request.page_orientation.clone();
    let json_bytes = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;

    // Logo's komen van de gebruiker via CompanyInfo.logoLeft/logoRight. Ze
    // worden hieronder als "logo-*.png" geregistreerd en Typst leidt het
    // formaat uit die naam af, dus alles wat geen PNG is wordt eerst
    // omgezet — een aangeleverde JPEG liet anders het hele rapport stranden
    // op "failed to decode image (Invalid PNG signature)".
    let logo_left_bytes: Vec<u8> = request.company_info.as_ref()
        .and_then(|ci| ci.logo_left.as_ref())
        .filter(|s| !s.is_empty())
        .and_then(|b64| super::generator::logo_as_png(b64))
        .unwrap_or_else(|| EMPTY_PNG.to_vec());

    let logo_right_bytes: Vec<u8> = request.company_info.as_ref()
        .and_then(|ci| ci.logo_right.as_ref())
        .filter(|s| !s.is_empty())
        .and_then(|b64| super::generator::logo_as_png(b64))
        .unwrap_or_else(|| EMPTY_PNG.to_vec());

    // Build Typst engine
    let engine = TypstEngine::builder()
        .main_file(BOUW1_TEMPLATE)
        .with_static_file_resolver([
            ("data.json", json_bytes.as_slice()),
            ("logo-left.png", logo_left_bytes.as_slice()),
            ("logo-right.png", logo_right_bytes.as_slice()),
        ])
        .search_fonts_with(
            TypstKitFontOptions::default()
                .include_system_fonts(false)
                .include_dirs([fonts_dir.to_str().unwrap_or("tenants/bouw1/fonts")]),
        )
        .build();

    // Compile
    let compiled = engine.compile();
    let doc = compiled.output.map_err(|errs| {
        format!("Typst compile errors: {:?}", errs)
    })?;

    // Generate PDF
    let options = typst_pdf::PdfOptions::default();
    let pdf = typst_pdf::pdf(&doc, &options)
        .map_err(|errs| format!("Typst PDF errors: {:?}", errs))?;

    Ok(pdf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(labels: serde_json::Value) -> ReportRequest {
        serde_json::from_value(serde_json::json!({
            "schedule": { "name": "Test", "projectName": "Testproject" },
            "items": [
                { "id": "ch1", "code": "1", "description": "GRONDWERK", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 800.0 },
                { "id": "r1", "code": "100010", "description": "graven", "rowType": "regel",
                  "depth": 1, "parentId": "ch1", "quantity": 10.0, "unit": "uur",
                  "unitPrice": 80.0, "total": 800.0, "resourceType": "arbeid" },
                { "id": "s1", "code": "", "description": "Winst:", "rowType": "staart_winst",
                  "depth": 0, "parentId": null, "staartPercentage": 5.0, "total": 40.0 },
                { "id": "s2", "code": "", "description": "Btw hoog:", "rowType": "staart_btw",
                  "depth": 0, "parentId": null, "staartPercentage": 21.0, "total": 176.4 }
            ],
            "reportView": "bouw1",
            "labels": labels,
        }))
        .expect("ReportRequest parsen")
    }

    fn en_labels() -> serde_json::Value {
        serde_json::json!({
            "summary.columnTotals": "Column totals:",
            "summary.totalCostPrice": "Total cost price:",
            "summary.totalExclVat": "Total excl. VAT:",
            "summary.totalInclVat": "Total price incl. VAT:",
            "summary.totalsTitle": "TOTALS",
            "meta.sequenceNo": "Ref. no.",
            "columns.description": "Description",
            "units.uur": "h"
        })
    }

    #[test]
    fn totalen_en_eenheden_volgen_labels() {
        let nl = build_bouw1_data(&request(serde_json::json!({})));
        let rows = &nl.totalen.as_ref().unwrap().rows;
        assert_eq!(rows.first().unwrap().label, "Totaal kolommen:");
        assert!(rows.iter().any(|r| r.label == "Totaal kostprijs:"));
        assert_eq!(rows.last().unwrap().label, "Totaalprijs incl. btw.:");
        assert_eq!(nl.chapters[0].rows[0].aantal_eh, "10,00 uur");

        let en = build_bouw1_data(&request(en_labels()));
        let rows = &en.totalen.as_ref().unwrap().rows;
        assert_eq!(rows.first().unwrap().label, "Column totals:");
        assert!(rows.iter().any(|r| r.label == "Total cost price:"));
        assert!(rows.iter().any(|r| r.label == "Total excl. VAT:"));
        assert_eq!(rows.last().unwrap().label, "Total price incl. VAT:");
        assert_eq!(en.chapters[0].rows[0].aantal_eh, "10,00 h");
    }

    #[test]
    fn notatie_volgt_number_format() {
        let nl = build_bouw1_data(&request(serde_json::json!({})));
        assert_eq!(nl.chapters[0].subtotal, "€ 800,00");

        let mut en = request(en_labels());
        en.schedule.report_date = Some("2026-09-11".into());
        en.number_format = serde_json::from_value(serde_json::json!({
            "decimal": ".", "group": ",", "currency": "€{{n}}", "currencyNegative": "-€{{n}}",
            "date": "DD/MM/YYYY"
        }))
        .unwrap();
        let en = build_bouw1_data(&en);
        assert_eq!(en.report_date, "11/09/2026");
        assert_eq!(en.chapters[0].subtotal, "€800.00");
        assert_eq!(en.chapters[0].rows[0].aantal_eh, "10.00 h");
        let rows = &en.totalen.as_ref().unwrap().rows;
        assert!(rows.iter().any(|r| r.percentage == "5.00%"), "{:?}", rows.iter().map(|r| &r.percentage).collect::<Vec<_>>());
    }

    fn totalen_row<'a>(data: &'a Bouw1ReportData, label: &str) -> &'a Bouw1TotalenRow {
        data.totalen.as_ref().unwrap().rows.iter().find(|r| r.label == label)
            .unwrap_or_else(|| panic!("rij {label} ontbreekt"))
    }

    #[test]
    fn afronding_telt_mee_voor_de_btw() {
        // Bug 139: 800 arbeid, 5 % winst, 21 % btw, afronding naar 850 (staat
        // ná de btw, zoals in de standaardstaart): 850 + 178,50 = 1.028,50.
        let mut req = request(serde_json::json!({}));
        req.items.push(serde_json::from_value(serde_json::json!({
            "id": "s3", "description": "Afronding", "rowType": "staart_afronding",
            "depth": 0, "parentId": null, "staartDoelbedrag": 850.0, "total": 10.0
        })).unwrap());
        let data = build_bouw1_data(&req);
        assert_eq!(totalen_row(&data, "Afronding").post, "€ 10,00");
        assert_eq!(totalen_row(&data, "Totaal excl. btw.:").totaal, "€ 850,00");
        assert_eq!(totalen_row(&data, "Btw hoog:").bedrag, "€ 850,00");
        assert_eq!(totalen_row(&data, "Btw hoog:").post, "€ 178,50");
        assert_eq!(totalen_row(&data, "Totaalprijs incl. btw.:").totaal, "€ 1.028,50");
        // De afronding staat vóór "Totaal excl. btw." en de btw erna.
        let labels: Vec<&str> = data.totalen.as_ref().unwrap().rows.iter().map(|r| r.label.as_str()).collect();
        let pos = |l: &str| labels.iter().position(|x| *x == l).unwrap();
        assert!(pos("Afronding") < pos("Totaal excl. btw.:"));
        assert!(pos("Totaal excl. btw.:") < pos("Btw hoog:"));
    }

    #[test]
    fn afronding_vast_bedrag_uit_de_regel() {
        let mut req = request(serde_json::json!({}));
        req.items.push(serde_json::from_value(serde_json::json!({
            "id": "s3", "description": "Afronding", "rowType": "staart_afronding",
            "depth": 0, "parentId": null, "total": -40.0
        })).unwrap());
        let data = build_bouw1_data(&req);
        assert_eq!(totalen_row(&data, "Totaal excl. btw.:").totaal, "€ 800,00");
        assert_eq!(totalen_row(&data, "Totaalprijs incl. btw.:").totaal, "€ 968,00");
    }

    #[test]
    fn abk_niet_over_onderaanneming() {
        let req: ReportRequest = serde_json::from_value(serde_json::json!({
            "schedule": { "name": "Test" },
            "items": [
                { "id": "ch1", "code": "1", "description": "WERK", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 2000.0 },
                { "id": "r1", "rowType": "regel", "depth": 1, "parentId": "ch1",
                  "total": 1000.0, "resourceType": "arbeid" },
                { "id": "r2", "rowType": "regel", "depth": 1, "parentId": "ch1",
                  "total": 1000.0, "resourceType": "onderaannemer" },
                { "id": "s1", "description": "AK OA:", "rowType": "staart_ak_oa",
                  "parentId": null, "staartPercentage": 9.0 },
                { "id": "s2", "description": "ABK:", "rowType": "staart_abk",
                  "parentId": null, "staartPercentage": 6.0 },
                { "id": "s3", "description": "Btw hoog:", "rowType": "staart_btw",
                  "parentId": null, "staartPercentage": 21.0 }
            ],
            "reportView": "bouw1",
        })).unwrap();
        let data = build_bouw1_data(&req);
        assert_eq!(totalen_row(&data, "ABK:").post, "€ 60,00");
        assert_eq!(totalen_row(&data, "Totaalprijs incl. btw.:").totaal, "€ 2.601,50");
    }

    /// 1000 arbeid in een hoofdstuk, ABK 6 %, winst 5 %, btw 21 %.
    /// App (computeStaartItemBreakdowns): ABK 60, excl. 1.113, incl. 1.346,73.
    fn abk_winst_request(chapter_totals_only: bool) -> ReportRequest {
        serde_json::from_value(serde_json::json!({
            "schedule": { "name": "Test", "reportChapterTotalsOnly": chapter_totals_only },
            "items": [
                { "id": "ch1", "code": "1", "description": "WERK", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 1000.0 },
                { "id": "r1", "description": "metselen", "rowType": "regel", "depth": 1,
                  "parentId": "ch1", "quantity": 10.0, "unit": "uur", "total": 1000.0,
                  "resourceType": "arbeid" },
                { "id": "s1", "description": "ABK:", "rowType": "staart_abk",
                  "parentId": null, "staartPercentage": 6.0 },
                { "id": "s2", "description": "Winst:", "rowType": "staart_winst",
                  "parentId": null, "staartPercentage": 5.0 },
                { "id": "s3", "description": "Btw hoog:", "rowType": "staart_btw",
                  "parentId": null, "staartPercentage": 21.0 }
            ],
            "reportView": "bouw1",
        }))
        .expect("ReportRequest parsen")
    }

    #[test]
    fn alleen_hoofdstuktotalen_rekent_over_alle_regels() {
        // Review f5c6cb0: met "alleen hoofdstuktotalen" was Totaal kolommen
        // € 0 en kregen de opslagen grondslag € 0.
        let data = build_bouw1_data(&abk_winst_request(true));
        // Alleen het hoofdstuk (subtotaalregel), geen rekenregel.
        assert_eq!(data.chapters.len(), 1);
        assert!(data.chapters[0].rows.iter().all(|r| r.is_subtotal), "{:?}",
            data.chapters[0].rows.iter().map(|r| &r.omschrijving).collect::<Vec<_>>());
        assert_eq!(totalen_row(&data, "Totaal kolommen:").totaal, "€ 1.000,00");
        assert_eq!(totalen_row(&data, "ABK:").post, "€ 60,00");
        assert_eq!(totalen_row(&data, "Totaal excl. btw.:").totaal, "€ 1.113,00");
        assert_eq!(totalen_row(&data, "Totaalprijs incl. btw.:").totaal, "€ 1.346,73");
        // Zonder de optie: dezelfde totalen, mét de rekenregel.
        let vol = build_bouw1_data(&abk_winst_request(false));
        assert!(vol.chapters[0].rows.iter().any(|r| r.omschrijving == "metselen"));
        assert_eq!(totalen_row(&vol, "Totaalprijs incl. btw.:").totaal, "€ 1.346,73");
    }

    #[test]
    fn afronding_van_nul_geeft_geen_rij() {
        // Standaardstaart: afronding zonder stap of doelbedrag = € 0.
        let mut req = request(serde_json::json!({}));
        req.items.push(serde_json::from_value(serde_json::json!({
            "id": "s3", "description": "Afronding", "rowType": "staart_afronding",
            "depth": 0, "parentId": null, "total": 0.0
        })).unwrap());
        let data = build_bouw1_data(&req);
        assert!(data.totalen.as_ref().unwrap().rows.iter().all(|r| r.label != "Afronding"));
        assert_eq!(totalen_row(&data, "Totaalprijs incl. btw.:").totaal, "€ 1.016,40");
    }

    fn code_item(code: &str, nr: Option<&str>) -> CostItem {
        let mut v = serde_json::json!({ "id": "x", "code": code, "rowType": "regel", "parentId": null });
        if let Some(n) = nr {
            v["nr"] = serde_json::json!(n);
        }
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn hst_par_nr_uit_nr_en_veilig_voor_niet_ascii() {
        let s = |a: &str, b: &str, c: &str| (a.to_string(), b.to_string(), c.to_string());
        // Zoals de HTML-print: nr op punten splitsen.
        assert_eq!(split_hst_par_nr(&code_item("21.10.010", Some("21.10.010"))), s("21", "10", "010"));
        assert_eq!(split_hst_par_nr(&code_item("x", Some("21.01.02.03"))), s("21", "01", "02.03"));
        assert_eq!(split_hst_par_nr(&code_item("x", Some("21"))), s("21", "", ""));
        // Zonder nr: code met punten op dezelfde manier.
        assert_eq!(split_hst_par_nr(&code_item("21.10.010", None)), s("21", "10", "010"));
        // En-dash: geen paniek op een bytegrens.
        assert_eq!(split_hst_par_nr(&code_item("1–2", None)), s("1", "–2", ""));
        assert_eq!(split_hst_par_nr(&code_item("1–2345", None)), s("1", "–2", "345"));
        // Oude vaste indeling voor codes zonder punten blijft gelijk.
        assert_eq!(split_hst_par_nr(&code_item("100010", None)), s("1", "00", "010"));
    }

    #[test]
    fn export_met_en_dash_en_titel_laatste_hoofdstuk() {
        let req: ReportRequest = serde_json::from_value(serde_json::json!({
            "schedule": { "name": "Test" },
            "items": [
                { "id": "ch1", "code": "1", "description": "EERSTE", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 100.0 },
                { "id": "r1", "code": "1–2", "description": "regel", "rowType": "regel",
                  "depth": 1, "parentId": "ch1", "total": 100.0 },
                { "id": "ch2", "code": "2", "description": "LAATSTE", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 50.0 },
                { "id": "r2", "code": "2–1", "description": "regel", "rowType": "regel",
                  "depth": 1, "parentId": "ch2", "total": 50.0 }
            ],
            "reportView": "bouw1",
        })).unwrap();
        let data = build_bouw1_data(&req);
        assert_eq!(data.chapters[0].title, "1. EERSTE");
        assert_eq!(data.chapters[1].title, "2. LAATSTE");
        let pdf = generate_bouw1_typst(&req).expect("export met en-dash");
        assert_eq!(&pdf[0..4], b"%PDF");
    }

    #[test]
    fn sjabloon_compileert_met_en_zonder_labels() {
        for labels in [serde_json::json!({}), en_labels()] {
            let pdf = generate_bouw1_typst(&request(labels)).expect("Typst-compilatie");
            assert_eq!(&pdf[0..4], b"%PDF");
        }
    }
}
