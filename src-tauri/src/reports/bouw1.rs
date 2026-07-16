//! Bouw 1 PDF report generation using Typst.
//! Template: tenants/bouw1/templates/begroting.typ (margin: top=37mm with 15mm header offset, bottom=14mm)
//! Generates Bouw 1 branded budget reports with:
//! - Landscape A4 with logos and project header
//! - 18-column budget tables per chapter
//! - Totalen (staartkosten) summary section
//! - Footer with company info and page numbers

use super::{CostItem, ReportRequest};
use super::generator::{fmt_currency, fmt_number};

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

fn build_bouw1_row(item: &CostItem, is_chapter: bool, all_items: &[&CostItem]) -> Bouw1Row {
    let code = &item.code;
    let (hst, par, nr_val) = if code.len() >= 6 {
        (code[..1].to_string(), code[1..3].to_string(), code[3..].to_string())
    } else if code.len() >= 3 {
        (code[..1].to_string(), code[1..3].to_string(), String::new())
    } else {
        (code.clone(), String::new(), String::new())
    };

    let qty_s = item.quantity.map(|q| fmt_number(Some(q))).unwrap_or_default();
    let unit = item.unit.clone().unwrap_or_default();
    let aantal_eh = if qty_s.is_empty() { String::new() } else { format!("{} {}", qty_s, unit) };
    let labor = item.labor_price.unwrap_or(0.0);
    let labor_s = if labor != 0.0 { fmt_currency(labor) } else { String::new() };
    let price_s = if item.unit_price != 0.0 { fmt_currency(item.unit_price) } else { String::new() };
    let total_s = if item.total != 0.0 { fmt_currency(item.total) } else { String::new() };
    let norm_s = item.norm_quantity.map(|n| format!("{:.3}", n).replace('.', ",")).unwrap_or_default();
    let tg = item.tarief_groep.clone().unwrap_or_default();
    let uren = match (item.quantity, item.norm_quantity) {
        (Some(q), Some(n)) if q != 0.0 && n != 0.0 => fmt_number(Some(q * n)),
        _ => String::new(),
    };
    let kosten_eh = if item.unit_price != 0.0 {
        fmt_currency(item.unit_price)
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
        loon: if bd.loon != 0.0 { fmt_currency(bd.loon) } else { labor_s },
        prijs: price_s,
        materiaal: if bd.materiaal != 0.0 { fmt_currency(bd.materiaal) } else { String::new() },
        materieel: if bd.materieel != 0.0 { fmt_currency(bd.materieel) } else { String::new() },
        stelpost: if bd.stelpost != 0.0 { fmt_currency(bd.stelpost) } else { String::new() },
        ond_aann: if bd.ond_aann != 0.0 { fmt_currency(bd.ond_aann) } else { String::new() },
        kosten_eh,
        subtotaal: total_s,
        // Totaal column: only show for top-level chapters (begrotingshoofdstukken)
        totaal: if is_chapter && item.depth == 0 { fmt_currency(item.total) } else { String::new() },
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
    let visible: Vec<&CostItem> = request.items.iter()
        .filter(|i| !i.row_type.starts_with("staart_") && i.row_type != "witregel")
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
                    let subtotal = fmt_currency(ch.total);
                    ch_rows.push(empty_subtotal_row(&subtotal));
                    chapters.push(Bouw1Chapter {
                        title: if ch.code.is_empty() { ch.description.clone() } else { format!("{}. {}", ch.code, ch.description) },
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
            ch_rows.push(build_bouw1_row(item, item.row_type == "chapter", &visible));
        }
    }
    if let Some(ch) = cur_ch {
        if !ch_rows.is_empty() || ch.total != 0.0 {
            let subtotal = fmt_currency(ch.total);
            ch_rows.push(empty_subtotal_row(&subtotal));
            chapters.push(Bouw1Chapter {
                title: ch.description.clone(),
                rows: std::mem::take(&mut ch_rows),
                subtotal,
            });
        }
    }

    // Totalen: items-driven. Read live staart breakdowns from each staart_* item
    // (computed by recalculateItems â†’ computeStaartItemBreakdowns in TS).
    let staart_items: Vec<&CostItem> = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_") && i.row_type != "staart_afronding")
        .collect();

    let totalen = if !staart_items.is_empty() {
        // Compute kostprijs columns from items (mirrors TS computeKostprijsBreakdown)
        let mut kp_loon = 0f64;
        let mut kp_mat = 0f64;
        let mut kp_matrl = 0f64;
        let mut kp_stelp = 0f64;
        let mut kp_oa = 0f64;
        for it in request.items.iter().filter(|i| i.row_type == "regel") {
            let qty = it.quantity.unwrap_or(0.0);
            let lab = it.labor_price.unwrap_or(0.0);
            let mp = it.norm_unit_price.unwrap_or(0.0);
            let total = it.total;
            let rt = it.resource_type.as_deref().unwrap_or("materiaal");
            if rt == "onderaannemer" {
                kp_oa += total;
                continue;
            }
            let split_loon = lab * qty;
            let split_mat = mp * qty;
            let used_split = (split_loon + split_mat - total).abs() < 0.01
                && (split_loon + split_mat) > 0.0;
            let loon_amt = if used_split { split_loon } else { 0.0 };
            let mat_amt = if used_split { split_mat } else { total };
            kp_loon += loon_amt;
            match rt {
                "arbeid" => kp_loon += mat_amt,
                "materieel" => kp_matrl += mat_amt,
                "overig" => kp_stelp += mat_amt,
                _ => kp_mat += mat_amt,
            }
        }
        let kp_total = kp_loon + kp_mat + kp_matrl + kp_stelp + kp_oa;

        let mut all_rows: Vec<Bouw1TotalenRow> = Vec::new();

        // Header: "Totaal kolommen"
        all_rows.push(Bouw1TotalenRow {
            label: "Totaal kolommen:".into(),
            percentage: String::new(),
            loon: fmt_currency(kp_loon),
            materiaal: fmt_currency(kp_mat),
            materieel: fmt_currency(kp_matrl),
            stelpost: fmt_currency(kp_stelp),
            ond_aann: fmt_currency(kp_oa),
            bedrag: String::new(),
            post: String::new(),
            totaal: fmt_currency(kp_total),
            is_bold: true,
        });

        // Compute staart cascade locally, mirroring TS computeStaartItemBreakdowns.
        // This makes the report robust regardless of whether TS already populated
        // staart_item_breakdown on each item.
        let mut run_loon = kp_loon;
        let mut run_mat = kp_mat;
        let mut run_matrl = kp_matrl;
        let mut cumulative = kp_total;
        let mut after_kostprijs = false; // before risico/winst/verzekering
        let mut after_excl = false;       // before btw
        let mut last_total = cumulative;

        for si in &staart_items {
            let pct = si.staart_percentage.unwrap_or(0.0) / 100.0;
            let pct_str = if si.staart_percentage.is_some() {
                format!("{:.2}%", si.staart_percentage.unwrap())
            } else {
                String::new()
            };
            let is_winst_phase = matches!(
                si.row_type.as_str(),
                "staart_risico" | "staart_winst" | "staart_verzekering" | "staart_wr"
            );
            let is_btw = si.row_type == "staart_btw";

            if is_winst_phase && !after_kostprijs {
                all_rows.push(Bouw1TotalenRow {
                    label: "Totaal kostprijs:".into(),
                    percentage: String::new(),
                    loon: String::new(), materiaal: String::new(), materieel: String::new(),
                    stelpost: String::new(), ond_aann: String::new(), bedrag: String::new(),
                    post: String::new(),
                    totaal: fmt_currency(cumulative),
                    is_bold: true,
                });
                after_kostprijs = true;
            }
            if is_btw && !after_excl {
                all_rows.push(Bouw1TotalenRow {
                    label: "Totaal excl. btw.:".into(),
                    percentage: String::new(),
                    loon: String::new(), materiaal: String::new(), materieel: String::new(),
                    stelpost: String::new(), ond_aann: String::new(), bedrag: String::new(),
                    post: String::new(),
                    totaal: fmt_currency(cumulative),
                    is_bold: true,
                });
                after_excl = true;
            }

            // Compute this row's contribution
            let mut row_loon = 0.0;
            let mut row_mat = 0.0;
            let mut row_matrl = 0.0;
            let mut row_stelp = 0.0;
            let mut row_oa = 0.0;
            let mut row_bedrag = 0.0;
            let mut row_subtotaal = 0.0;

            // Vlakke staart (BasCalc): percentage over de directe kosten
            // i.p.v. het opgehoogde bedrag — spiegel van CostItem.staartBasis.
            let vlak = si.staart_basis.as_deref() == Some("kostprijs");

            match si.row_type.as_str() {
                "staart_ak_oa" => {
                    let v = kp_oa * pct;
                    row_oa = v;
                    row_subtotaal = v;
                    cumulative += v;
                }
                "staart_abk" | "staart_garanties" | "staart_wvpm" => {
                    let (b_loon, b_mat, b_matrl) = if vlak {
                        (kp_loon, kp_mat, kp_matrl)
                    } else {
                        (run_loon, run_mat, run_matrl)
                    };
                    row_bedrag = b_loon + b_mat + b_matrl;
                    row_loon = b_loon * pct;
                    row_mat = b_mat * pct;
                    row_matrl = b_matrl * pct;
                    row_subtotaal = row_loon + row_mat + row_matrl;
                    if !vlak {
                        run_loon += row_loon;
                        run_mat += row_mat;
                        run_matrl += row_matrl;
                    }
                    cumulative += row_subtotaal;
                }
                "staart_risico" | "staart_winst" | "staart_verzekering"
                | "staart_ukk" | "staart_ak" | "staart_wr" => {
                    row_bedrag = if vlak { kp_total } else { cumulative };
                    row_subtotaal = row_bedrag * pct;
                    cumulative += row_subtotaal;
                }
                "staart_btw" => {
                    row_bedrag = cumulative;
                    row_subtotaal = cumulative * pct;
                    cumulative += row_subtotaal;
                }
                "staart_afronding" => {
                    if let Some(doel) = si.staart_doelbedrag {
                        // Vaste sluitpost: afronding = doelbedrag − som tot hier.
                        row_subtotaal = doel - cumulative;
                        cumulative = doel;
                    }
                }
                _ => {}
            }
            last_total = cumulative;

            all_rows.push(Bouw1TotalenRow {
                label: si.description.clone(),
                percentage: pct_str,
                loon: if row_loon != 0.0 { fmt_currency(row_loon) } else { String::new() },
                materiaal: if row_mat != 0.0 { fmt_currency(row_mat) } else { String::new() },
                materieel: if row_matrl != 0.0 { fmt_currency(row_matrl) } else { String::new() },
                stelpost: if row_stelp != 0.0 { fmt_currency(row_stelp) } else { String::new() },
                ond_aann: if row_oa != 0.0 { fmt_currency(row_oa) } else { String::new() },
                bedrag: if row_bedrag != 0.0 { fmt_currency(row_bedrag) } else { String::new() },
                post: if row_subtotaal != 0.0 { fmt_currency(row_subtotaal) } else { String::new() },
                totaal: String::new(),
                is_bold: false,
            });
        }

        // Finally: "Totaalprijs incl. btw." with last cumulative
        all_rows.push(Bouw1TotalenRow {
            label: "Totaalprijs incl. btw.:".into(),
            percentage: String::new(),
            loon: String::new(), materiaal: String::new(), materieel: String::new(),
            stelpost: String::new(), ond_aann: String::new(), bedrag: String::new(),
            post: String::new(),
            totaal: fmt_currency(last_total),
            is_bold: true,
        });

        Some(Bouw1Totalen { rows: all_rows })
    } else {
        None
    };

    // Format report date: if provided as ISO YYYY-MM-DD, render as DD-MM-YYYY; else today
    let report_date = match request.schedule.report_date.as_deref() {
        Some(s) if !s.is_empty() => format_report_date(s),
        _ => chrono::Local::now().format("%d-%m-%Y").to_string(),
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
    }
}

/// Convert ISO YYYY-MM-DD to DD-MM-YYYY. Pass through other formats unchanged.
fn format_report_date(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    if parts.len() == 3 && parts[0].len() == 4 {
        format!("{}-{}-{}", parts[2], parts[1], parts[0])
    } else {
        iso.to_string()
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

    // Logos are user-supplied via CompanyInfo.logoLeft/logoRight (PNG base64).
    // No third-party logos are bundled - fallback is a 1x1 transparent placeholder.
    let logo_left_bytes: Vec<u8> = request.company_info.as_ref()
        .and_then(|ci| ci.logo_left.as_ref())
        .filter(|s| !s.is_empty())
        .and_then(|b64| {
            // Strip data URI prefix if present (e.g., "data:image/jpeg;base64,...")
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
