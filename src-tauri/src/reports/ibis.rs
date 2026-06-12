//! IBIS-style PDF report generation using Typst.
//! Template: tenants/bouw1/templates/ibis.typ (landscape A4, IBIS-TRAD style layout).
//!
//! Generates an IBIS-TRAD lookalike budget report:
//! - Landscape A4 with project header block (links) + logo (rechts)
//! - Hoofdtabel: Stabucode | S | Omschrijving | Hoeveelheid | Eh | Uurnorm | Uren |
//!   Materiaal | Materieel | Onderaanneming | Eenheidsprijs | TOTAAL
//! - Hoofdstukrijen (blauwe achtergrond), subkoprijen (lichter), subtotaalrijen (vet)
//! - Footer-cascade: Alle kosten -> AK% -> W&R% -> CAR% -> Transport -> Afronding ->
//!   Totaal excl BTW -> Grondslag BTW hoog/laag -> Totaal BTW -> Totaal incl BTW
//!
//! The staart (footer) cascade reuses the same item-driven computation as bouw1.rs:
//! percentages and amounts come from the live staart_* CostItems, never hardcoded.

use super::{CostItem, ReportRequest};
use super::generator::{fmt_currency, fmt_number};

static IBIS_TEMPLATE: &str = include_str!("../../../tenants/bouw1/templates/ibis.typ");
// Logos are user-supplied via CompanyInfo.logoLeft/logoRight (PNG base64).
// No third-party logos are bundled - fallback is a 1x1 transparent placeholder.
static EMPTY_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x04, 0x00, 0x00, 0x00, 0xB5, 0x1C, 0x0C, 0x02, 0x00, 0x00, 0x00,
    0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x60, 0x00, 0x00,
    0x00, 0x03, 0x00, 0x01, 0xB8, 0xAD, 0x3A, 0x63, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

#[derive(serde::Serialize)]
struct IbisReportData {
    document_name: String,
    project_name: String,
    project_number: String,
    client: String,
    author: String,
    location: String,
    expert: String,
    report_date: String,
    chapters: Vec<IbisChapter>,
    totalen: Option<IbisTotalen>,
    #[serde(default)]
    page_size: String,
    #[serde(default)]
    page_orientation: String,
}

#[derive(serde::Serialize)]
struct IbisChapter {
    title: String,
    rows: Vec<IbisRow>,
}

/// A single budget line in the IBIS table.
/// `level`: 0 = hoofdstuk (blauw), 1 = subgroep (lichter), 2 = regel (normaal).
#[derive(serde::Serialize)]
struct IbisRow {
    stabucode: String,
    s: String,          // soort-kolom (S) — verrekenbaar/markering
    omschrijving: String,
    hoeveelheid: String,
    eh: String,
    uurnorm: String,
    uren: String,
    materiaal: String,
    materieel: String,
    onderaan: String,
    eenheidsprijs: String,
    totaal: String,
    level: u8,
    is_subtotal: bool,
}

#[derive(serde::Serialize)]
struct IbisTotalen {
    rows: Vec<IbisTotalenRow>,
}

/// A row in the footer cascade. `symbol` is the IBIS marker column (@, %, +, $, *, GH, GL, %H, BT).
#[derive(serde::Serialize)]
struct IbisTotalenRow {
    symbol: String,
    label: String,
    percentage: String,
    bedrag: String,   // grondslag / basisbedrag for this row
    post: String,     // amount this row adds (post-bedrag)
    totaal: String,   // cumulative running total (totaal generaal)
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
/// Mirrors bouw1.rs::compute_item_breakdown.
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

/// Aggregate breakdown for a parent by summing all leaf descendants.
/// Mirrors bouw1.rs::compute_parent_breakdown.
fn compute_parent_breakdown(parent_id: &str, all_items: &[&CostItem]) -> ResourceBreakdown {
    let mut bd = ResourceBreakdown { loon: 0.0, materiaal: 0.0, materieel: 0.0, stelpost: 0.0, ond_aann: 0.0 };
    let mut stack: Vec<&str> = vec![parent_id];
    while let Some(pid) = stack.pop() {
        for item in all_items.iter() {
            if item.parent_id.as_deref() == Some(pid) {
                let children: Vec<&&CostItem> = all_items.iter().filter(|i| i.parent_id.as_deref() == Some(&item.id)).collect();
                if children.is_empty() {
                    let child_bd = compute_item_breakdown(item);
                    bd.loon += child_bd.loon;
                    bd.materiaal += child_bd.materiaal;
                    bd.materieel += child_bd.materieel;
                    bd.stelpost += child_bd.stelpost;
                    bd.ond_aann += child_bd.ond_aann;
                } else {
                    stack.push(&item.id);
                }
            }
        }
    }
    bd
}

/// IBIS Stabucode: the original code as-is (e.g. "00", "0001", "1032").
fn build_ibis_row(item: &CostItem, level: u8, all_items: &[&CostItem]) -> IbisRow {
    let qty_s = item.quantity.map(|q| fmt_number(Some(q))).unwrap_or_default();
    let unit = item.unit.clone().unwrap_or_default();

    let price_s = if item.unit_price != 0.0 { fmt_currency(item.unit_price) } else { String::new() };
    let total_s = if item.total != 0.0 { fmt_currency(item.total) } else { String::new() };
    // Uurnorm = norm per eenheid (normQuantity). Uren = hoeveelheid x uurnorm.
    let uurnorm_s = item.norm_quantity
        .filter(|n| *n != 0.0)
        .map(|n| format!("{:.3}", n).replace('.', ","))
        .unwrap_or_default();
    let uren = match (item.quantity, item.norm_quantity) {
        (Some(q), Some(n)) if q != 0.0 && n != 0.0 => fmt_number(Some(q * n)),
        _ => String::new(),
    };

    // Resource breakdown (materiaal / materieel / onderaanneming columns).
    let has_children = all_items.iter().any(|i| i.parent_id.as_deref() == Some(&item.id));
    let bd = if has_children {
        compute_parent_breakdown(&item.id, all_items)
    } else {
        compute_item_breakdown(item)
    };
    // IBIS heeft geen aparte stelpost-kolom: tel stelpost (overig) bij materiaal.
    let materiaal_amt = bd.materiaal + bd.stelpost;

    // "S" markering: 'S' bij stelpost-regels, 'exc'/'inc' uit verrekenbaar indien aanwezig.
    let s_mark = item.verrekenbaar.clone().unwrap_or_default();

    IbisRow {
        stabucode: item.code.clone(),
        s: s_mark,
        omschrijving: item.description.clone(),
        hoeveelheid: qty_s,
        eh: unit,
        uurnorm: uurnorm_s,
        uren,
        materiaal: if materiaal_amt != 0.0 { fmt_currency(materiaal_amt) } else { String::new() },
        materieel: if bd.materieel != 0.0 { fmt_currency(bd.materieel) } else { String::new() },
        onderaan: if bd.ond_aann != 0.0 { fmt_currency(bd.ond_aann) } else { String::new() },
        eenheidsprijs: price_s,
        totaal: total_s,
        level,
        is_subtotal: false,
    }
}

fn subtotal_row(label: &str, subtotal: &str) -> IbisRow {
    IbisRow {
        stabucode: String::new(),
        s: String::new(),
        omschrijving: label.to_string(),
        hoeveelheid: String::new(),
        eh: String::new(),
        uurnorm: String::new(),
        uren: String::new(),
        materiaal: String::new(),
        materieel: String::new(),
        onderaan: String::new(),
        eenheidsprijs: String::new(),
        totaal: subtotal.to_string(),
        level: 2,
        is_subtotal: true,
    }
}

fn build_ibis_data(request: &ReportRequest) -> IbisReportData {
    let visible: Vec<&CostItem> = request.items.iter()
        .filter(|i| !i.row_type.starts_with("staart_") && i.row_type != "witregel")
        .collect();

    let mut chapters: Vec<IbisChapter> = Vec::new();
    let mut cur_ch: Option<&CostItem> = None;
    let mut ch_rows: Vec<IbisRow> = Vec::new();

    // Begrotingspost/bewakingspost mét kinderen zijn redundant: kinderen tonen we wel.
    let redundant_parents: std::collections::HashSet<&str> = visible.iter()
        .filter(|item| item.row_type == "begrotingspost" || item.row_type == "bewakingspost")
        .filter(|item| {
            visible.iter().any(|c| c.parent_id.as_deref() == Some(&item.id))
        })
        .map(|item| item.id.as_str())
        .collect();

    for item in &visible {
        if item.row_type == "chapter" && item.depth == 0 {
            // Flush previous chapter
            if let Some(ch) = cur_ch {
                if !ch_rows.is_empty() || ch.total != 0.0 {
                    let subtotal = fmt_currency(ch.total);
                    let title = if ch.code.is_empty() { ch.description.clone() } else { format!("{}  {}", ch.code, ch.description) };
                    ch_rows.push(subtotal_row(&ch.description, &subtotal));
                    chapters.push(IbisChapter { title, rows: std::mem::take(&mut ch_rows) });
                }
                ch_rows.clear();
            }
            cur_ch = Some(item);
        } else if redundant_parents.contains(item.id.as_str()) {
            continue;
        } else {
            // level: chapter(>0)=0 blue, begrotings/bewakingspost=1 lighter, regel=2 normal
            let level: u8 = match item.row_type.as_str() {
                "chapter" => 0,
                "begrotingspost" | "bewakingspost" => 1,
                _ => 2,
            };
            ch_rows.push(build_ibis_row(item, level, &visible));
        }
    }
    if let Some(ch) = cur_ch {
        if !ch_rows.is_empty() || ch.total != 0.0 {
            let subtotal = fmt_currency(ch.total);
            let title = if ch.code.is_empty() { ch.description.clone() } else { format!("{}  {}", ch.code, ch.description) };
            ch_rows.push(subtotal_row(&ch.description, &subtotal));
            chapters.push(IbisChapter { title, rows: std::mem::take(&mut ch_rows) });
        }
    }

    let totalen = build_ibis_totalen(request);

    let report_date = match request.schedule.report_date.as_deref() {
        Some(s) if !s.is_empty() => format_report_date(s),
        _ => chrono::Local::now().format("%d-%m-%y").to_string(),
    };

    IbisReportData {
        document_name: request.schedule.name.clone(),
        project_name: request.schedule.project_name.clone(),
        project_number: request.schedule.project_number.clone(),
        client: request.schedule.client.clone(),
        author: request.schedule.author.clone(),
        location: String::new(),
        expert: String::new(),
        report_date,
        chapters,
        totalen,
        page_size: String::new(),
        page_orientation: String::new(),
    }
}

/// Build the IBIS footer cascade from the live staart_* items.
///
/// Order mirrors the IBIS-TRAD uitdraai:
///   @  Alle kosten
///   %  <opslag>      (AK / W&R / CAR / verzekering — % over cumulatief)
///   +  (Transport)
///   $  Afronding
///   *  Totaal excl BTW
///   GH/GL Grondslag BTW hoog/laag  +  %H/%L
///   BT Totaal BTW
///   *  Totaal incl BTW
///
/// Percentages and amounts come from the staart items (never hardcoded). BTW splitting
/// hoog/laag: each staart_btw item becomes one "Grondslag BTW <desc>" + computed BTW.
fn build_ibis_totalen(request: &ReportRequest) -> Option<IbisTotalen> {
    let staart_items: Vec<&CostItem> = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_"))
        .collect();
    if staart_items.is_empty() {
        return None;
    }

    // Directe kosten (Alle kosten @) = som van top-level hoofdstukken.
    let alle_kosten: f64 = request.items.iter()
        .filter(|i| i.row_type == "chapter" && i.depth == 0)
        .map(|i| i.total)
        .sum();

    let mut rows: Vec<IbisTotalenRow> = Vec::new();
    let mut cumulative = alle_kosten;

    // @ Alle kosten
    rows.push(IbisTotalenRow {
        symbol: "@".into(),
        label: "Alle kosten".into(),
        percentage: String::new(),
        bedrag: String::new(),
        post: String::new(),
        totaal: fmt_currency(alle_kosten),
        is_bold: true,
    });

    // Walk staart items in order. Split into: opslag-fase (everything except btw/afronding),
    // afronding, btw-fase.
    let opslag: Vec<&&CostItem> = staart_items.iter()
        .filter(|i| i.row_type != "staart_btw" && i.row_type != "staart_afronding")
        .collect();
    let btw_items: Vec<&&CostItem> = staart_items.iter()
        .filter(|i| i.row_type == "staart_btw")
        .collect();
    let afronding_item = staart_items.iter().find(|i| i.row_type == "staart_afronding");

    // Onderaanneming-deel: nodig voor staart_ak_oa (AK over onderaanneming).
    let oa_total: f64 = request.items.iter()
        .filter(|i| i.row_type == "regel")
        .filter(|i| i.resource_type.as_deref() == Some("onderaannemer"))
        .map(|i| i.total)
        .sum();

    for si in &opslag {
        let pct = si.staart_percentage.unwrap_or(0.0);
        let pct_frac = pct / 100.0;
        let pct_str = if si.staart_percentage.is_some() {
            format!("{:.2}%", pct).replace('.', ",")
        } else {
            String::new()
        };

        // Base depends on staart type (mirrors calculator.ts cascade).
        let (base, post) = match si.row_type.as_str() {
            "staart_ak_oa" => {
                let v = oa_total * pct_frac;
                (oa_total, v)
            }
            // All other opslag types: percentage over running cumulative.
            _ => {
                let v = cumulative * pct_frac;
                (cumulative, v)
            }
        };
        cumulative += post;

        rows.push(IbisTotalenRow {
            symbol: "%".into(),
            label: clean_label(&si.description),
            percentage: pct_str,
            bedrag: fmt_currency(base),
            post: fmt_currency(post),
            totaal: fmt_currency(cumulative),
            is_bold: false,
        });
    }

    // (Transport): cumulatief vóór afronding — markeerregel zoals IBIS.
    let transport = cumulative;
    rows.push(IbisTotalenRow {
        symbol: "+".into(),
        label: "(Transport)".into(),
        percentage: String::new(),
        bedrag: String::new(),
        post: String::new(),
        totaal: fmt_currency(transport),
        is_bold: false,
    });

    // $ Afronding
    if let Some(af) = afronding_item {
        cumulative += af.total;
        rows.push(IbisTotalenRow {
            symbol: "$".into(),
            label: "Afronding".into(),
            percentage: String::new(),
            bedrag: String::new(),
            post: fmt_currency(af.total),
            totaal: String::new(),
            is_bold: false,
        });
    }

    // * Totaal excl BTW
    let excl_btw = cumulative;
    rows.push(IbisTotalenRow {
        symbol: "*".into(),
        label: "Totaal excl BTW".into(),
        percentage: String::new(),
        bedrag: String::new(),
        post: String::new(),
        totaal: fmt_currency(excl_btw),
        is_bold: true,
    });

    // BTW-fase. OCS heeft per staart_btw één tarief. IBIS toont grondslag hoog/laag apart.
    // Voor elk BTW-item: "Grondslag BTW <desc>" (grondslag = excl_btw, pct) + de BTW-post.
    // Met de OCS-default is er één item ("Btw hoog:", 21%) → alleen "Grondslag BTW hoog".
    let mut total_btw = 0.0;
    for bi in &btw_items {
        let pct = bi.staart_percentage.unwrap_or(0.0);
        let pct_frac = pct / 100.0;
        let pct_str = format!("{:.2}%", pct).replace('.', ",");
        let grondslag = excl_btw;
        let btw_amt = grondslag * pct_frac;
        total_btw += btw_amt;

        // Symbol GH for "hoog", GL for "laag", G otherwise. Detect from description.
        let desc_lc = bi.description.to_lowercase();
        let (g_sym, b_sym, kind) = if desc_lc.contains("hoog") {
            ("GH", "%H", "hoog")
        } else if desc_lc.contains("laag") {
            ("GL", "%L", "laag")
        } else {
            ("G", "%", "")
        };

        rows.push(IbisTotalenRow {
            symbol: g_sym.into(),
            label: if kind.is_empty() { "Grondslag BTW".into() } else { format!("Grondslag BTW {}", kind) },
            percentage: pct_str,
            bedrag: fmt_currency(grondslag),
            post: String::new(),
            totaal: String::new(),
            is_bold: false,
        });
        rows.push(IbisTotalenRow {
            symbol: b_sym.into(),
            label: if kind.is_empty() { clean_label(&bi.description) } else { format!("BTW {}", kind) },
            percentage: String::new(),
            bedrag: String::new(),
            post: fmt_currency(btw_amt),
            totaal: String::new(),
            is_bold: false,
        });
    }

    // BT Totaal BTW
    rows.push(IbisTotalenRow {
        symbol: "BT".into(),
        label: "Totaal BTW".into(),
        percentage: String::new(),
        bedrag: String::new(),
        post: fmt_currency(total_btw),
        totaal: fmt_currency(total_btw),
        is_bold: false,
    });

    // * Totaal incl BTW
    let incl_btw = excl_btw + total_btw;
    rows.push(IbisTotalenRow {
        symbol: "*".into(),
        label: "Totaal incl BTW".into(),
        percentage: String::new(),
        bedrag: String::new(),
        post: String::new(),
        totaal: fmt_currency(incl_btw),
        is_bold: true,
    });

    Some(IbisTotalen { rows })
}

/// Strip trailing colon and whitespace from a staart label for the cascade.
fn clean_label(s: &str) -> String {
    s.trim().trim_end_matches(':').trim().to_string()
}

/// Convert ISO YYYY-MM-DD to DD-MM-YY (IBIS uses 2-digit year). Pass through otherwise.
fn format_report_date(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    if parts.len() == 3 && parts[0].len() == 4 {
        let yy = &parts[0][2..];
        format!("{}-{}-{}", parts[2], parts[1], yy)
    } else {
        iso.to_string()
    }
}

pub fn generate_ibis_typst(request: &ReportRequest) -> Result<Vec<u8>, String> {
    use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};

    // Resolve tenant path (shared fonts with bouw1).
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

    let mut data = build_ibis_data(request);
    data.page_size = request.page_size.to_lowercase();
    data.page_orientation = request.page_orientation.clone();
    let json_bytes = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;

    // Logos: user-supplied via CompanyInfo, fallback to bundled placeholder/brand logos.
    let logo_left_bytes: Vec<u8> = request.company_info.as_ref()
        .and_then(|ci| ci.logo_left.as_ref())
        .filter(|s| !s.is_empty())
        .and_then(|b64| {
            let raw = if let Some(pos) = b64.find(",") { &b64[pos + 1..] } else { b64.as_str() };
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.decode(raw).ok()
        })
        .unwrap_or_else(|| EMPTY_PNG.to_vec());

    let logo_right_bytes: Vec<u8> = request.company_info.as_ref()
        .and_then(|ci| ci.logo_right.as_ref())
        .filter(|s| !s.is_empty())
        .and_then(|b64| {
            let raw = if let Some(pos) = b64.find(",") { &b64[pos + 1..] } else { b64.as_str() };
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.decode(raw).ok()
        })
        .unwrap_or_else(|| EMPTY_PNG.to_vec());

    let engine = TypstEngine::builder()
        .main_file(IBIS_TEMPLATE)
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

    let compiled = engine.compile();
    let doc = compiled.output.map_err(|errs| {
        format!("Typst compile errors: {:?}", errs)
    })?;

    let options = typst_pdf::PdfOptions::default();
    let pdf = typst_pdf::pdf(&doc, &options)
        .map_err(|errs| format!("Typst PDF errors: {:?}", errs))?;

    Ok(pdf)
}
