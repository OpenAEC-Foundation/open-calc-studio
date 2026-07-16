//! PDF report generator using openaec-layout.
//!
//! Generates professional cost estimation reports with:
//! - Optional cover page
//! - Table with repeated headers across pages
//! - Automatic pagination via openaec-layout flowable engine
//! - Footer with company info + page numbers

use openaec_layout::*;
use std::path::Path;

use super::{CostItem, ReportRequest};

// ── Formatting helpers ──────────────────────────────────────────────────────

pub(crate) fn fmt_currency(value: f64) -> String {
    let abs = value.abs();
    let whole = abs as u64;
    let cents = ((abs - whole as f64) * 100.0).round() as u64;
    let formatted_whole = fmt_thousands(whole);
    let sign = if value < 0.0 { "-" } else { "" };
    format!("€ {}{},{:02}", sign, formatted_whole, cents)
}

pub(crate) fn fmt_number(value: Option<f64>) -> String {
    match value {
        Some(v) if v != 0.0 => {
            let abs = v.abs();
            let whole = abs as u64;
            let frac = ((abs - whole as f64) * 100.0).round() as u64;
            let sign = if v < 0.0 { "-" } else { "" };
            format!("{}{},{:02}", sign, fmt_thousands(whole), frac)
        }
        _ => String::new(),
    }
}

fn fmt_thousands(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push('.');
        }
        result.push(c);
    }
    result.chars().rev().collect()
}

#[allow(dead_code)]
fn today_str() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = now / 86400;
    let y = 1970 + (days * 400 / 146097);
    // Simplified date formatting
    format!("{:04}", y)
}

fn view_title(view: &str) -> &str {
    match view {
        "werkbeschrijving" => "Werkbeschrijving",
        "hoofdaanneming" => "Hoofdaanneming",
        "onderaanneming" => "Onderaanneming",
        "inschrijfstaat" => "Inschrijfstaat",
        "nacalculatie" => "Nacalculatie",
        "bouw1" => "Bouw 1 begroting",
        "ibis" => "IBIS-stijl begroting",
        _ => "Rapport",
    }
}

// ── Column definitions ──────────────────────────────────────────────────────

struct Col {
    key: &'static str,
    label: &'static str,
    width_mm: f64,
}

fn get_columns(view: &str, show_hoeveelheid: bool) -> Vec<Col> {
    let qty_keys: &[&str] = &["quantity", "unit", "unitPrice", "normUnitPrice"];
    let cols: Vec<Col> = match view {
        // Besteksopmaak: smalle codekolom, brede omschrijving (ook op staand A4)
        "werkbeschrijving" => vec![
            Col { key: "code", label: "Code", width_mm: 18.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 22.0 },
            Col { key: "unit", label: "Eh.", width_mm: 12.0 },
            Col { key: "verrekenbaar", label: "S", width_mm: 8.0 },
        ],
        "hoofdaanneming" => vec![
            Col { key: "code", label: "Code", width_mm: 18.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 20.0 },
            Col { key: "unit", label: "Eh.", width_mm: 12.0 },
            Col { key: "verrekenbaar", label: "S", width_mm: 8.0 },
            Col { key: "unitPrice", label: "Eh. Prijs", width_mm: 24.0 },
            Col { key: "total", label: "Bedrag", width_mm: 26.0 },
        ],
        "onderaanneming" => vec![
            Col { key: "nr", label: "Nr", width_mm: 30.0 },
            Col { key: "code", label: "Code", width_mm: 45.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "total", label: "Bedrag", width_mm: 35.0 },
        ],
        "inschrijfstaat" => vec![
            Col { key: "nr", label: "Nr", width_mm: 25.0 },
            Col { key: "code", label: "Code", width_mm: 40.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 25.0 },
            Col { key: "unit", label: "Eenheid", width_mm: 20.0 },
            Col { key: "verrekenbaar", label: "Verr.", width_mm: 15.0 },
            Col { key: "unitPrice", label: "Eenheidsprijs", width_mm: 30.0 },
            Col { key: "total", label: "Bedrag", width_mm: 35.0 },
        ],
        "nacalculatie" => vec![
            Col { key: "nr", label: "Nr", width_mm: 25.0 },
            Col { key: "code", label: "Code", width_mm: 40.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 25.0 },
            Col { key: "unit", label: "Eenheid", width_mm: 20.0 },
            Col { key: "normUnitPrice", label: "Prijs/middel", width_mm: 28.0 },
            Col { key: "unitPrice", label: "Eenheidsprijs", width_mm: 30.0 },
            Col { key: "total", label: "Bedrag", width_mm: 35.0 },
        ],
        _ => vec![
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "total", label: "Totaal", width_mm: 35.0 },
        ],
    };
    if !show_hoeveelheid {
        cols.into_iter()
            .filter(|c| !qty_keys.contains(&c.key))
            .collect()
    } else {
        cols
    }
}

// ── Item filtering ──────────────────────────────────────────────────────────

fn filter_items<'a>(items: &'a [CostItem], view: &str) -> Vec<&'a CostItem> {
    items
        .iter()
        .filter(|i| !i.row_type.starts_with("staart_") && i.row_type != "witregel")
        .filter(|i| match view {
            // Werkbeschrijving: ook tekstregels (opmerkingen bij de posten)
            "werkbeschrijving" => {
                i.row_type == "chapter"
                    || i.row_type == "begrotingspost"
                    || i.row_type == "tekstregel"
            }
            "hoofdaanneming" => {
                i.row_type == "chapter"
                    || i.row_type == "begrotingspost"
                    || i.row_type == "tekstregel"
            }
            "onderaanneming" => i.row_type == "chapter" || i.row_type == "begrotingspost",
            _ => true,
        })
        .collect()
}

/// Lettertype-afwijking per rij voor de "clean" rapportstijl
/// (werkbeschrijving/hoofdaanneming): hoofdstukken vet mét lijnen erboven en
/// eronder, diepere paragrafen vet-cursief, opmerkingen (tekstregels)
/// vet-cursief — naar de klassieke besteksopmaak.
fn row_font_for(item: &CostItem) -> Option<RowOverride> {
    match item.row_type.as_str() {
        "chapter" if item.depth >= 2 => Some(RowOverride {
            font_name: Some("LiberationSans-BoldItalic".to_string()),
            ..Default::default()
        }),
        "chapter" => Some(RowOverride {
            font_name: Some("LiberationSans-Bold".to_string()),
            top_rule: true,
            bottom_rule: true,
            ..Default::default()
        }),
        "tekstregel" => Some(RowOverride {
            font_name: Some("LiberationSans-BoldItalic".to_string()),
            ..Default::default()
        }),
        _ => None,
    }
}

/// Bedrag-notatie in de besteksopmaak: kaal NL-getal zonder valutateken
/// (zoals de referentie-opmaak), lege string bij 0.
fn fmt_bedrag(value: f64) -> String {
    if value == 0.0 {
        return String::new();
    }
    fmt_number(Some(value))
}

/// Inspring in de omschrijving-kolom per hiërarchie-diepte.
fn indent_for(depth: u32) -> String {
    "  ".repeat(depth as usize)
}

fn get_cell_value(item: &CostItem, key: &str) -> String {
    match key {
        "nr" => item.nr.clone().unwrap_or_default(),
        "code" => item.code.clone(),
        "description" => item.description.clone(),
        "quantity" => fmt_number(item.quantity),
        "unit" => item.unit.clone().unwrap_or_default(),
        // V/N/… per regel — ook op posten (S-kolom in de besteksopmaak)
        "verrekenbaar" => item.verrekenbaar.clone().unwrap_or_default(),
        "normUnitPrice" => fmt_number(item.norm_unit_price),
        "unitPrice" => {
            if item.unit_price != 0.0 {
                fmt_currency(item.unit_price)
            } else {
                String::new()
            }
        }
        "total" => {
            if item.total != 0.0 {
                fmt_currency(item.total)
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

// ── Page configuration ──────────────────────────────────────────────────────

fn page_size_for(size: &str, orientation: &str) -> Size {
    let (w, h) = match size {
        "A3" => (Mm(297.0).into(), Mm(420.0).into()),
        _ => (Mm(210.0).into(), Mm(297.0).into()),
    };
    match orientation {
        "landscape" => Size { width: h, height: w },
        _ => Size { width: w, height: h },
    }
}

// ── Header/Footer callback ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct ReportPageCallback {
    project_name: String,
    report_title: String,
    company_name: String,
    /// Bedrijfslogo rechtsboven: (bytes, hoogte/breedte-verhouding)
    logo_right: Option<(Vec<u8>, f32)>,
}

impl PageCallback for ReportPageCallback {
    fn on_page(
        &self,
        draw_list: &mut DrawList,
        page_num: usize,
        total_pages: usize,
        page_size: Size,
    ) {
        let margin: Pt = Mm(12.0).into();
        let right_edge = Pt(page_size.width.0 - margin.0);

        if let Some((bytes, aspect)) = &self.logo_right {
            // Koptekst mét logo: alleen het logo rechtsboven; projectnaam en
            // rapporttitel samen links. Compact en hoog tegen de paginarand.
            let mut h: Pt = Mm(8.0).into();
            let mut w = Pt(if *aspect > 0.0 { h.0 / aspect } else { h.0 });
            let max_w: Pt = Mm(45.0).into();
            if w.0 > max_w.0 {
                w = max_w;
                h = Pt(w.0 * aspect);
            }
            // Witte fill vóór het tekenen: de compositing-fallback (voor
            // viewers zonder SMask-ondersteuning) hoort tegen wit.
            draw_list.set_fill_color(Color::rgb(255, 255, 255));
            draw_list.draw_image(bytes.clone(), Pt(right_edge.0 - w.0), Mm(1.0).into(), w, h);

            let header_y: Pt = Mm(10.0).into();
            draw_list.set_stroke_color(Color::rgb(217, 119, 6)); // Amber
            draw_list.set_line_width(Pt(1.5));
            draw_list.draw_line(margin, header_y, right_edge, header_y);

            draw_list.set_font("LiberationSans-Bold", Pt(9.0));
            draw_list.set_fill_color(Color::rgb(54, 54, 62));
            draw_list.draw_text(margin, Mm(4.5).into(), &self.project_name);

            draw_list.set_font("LiberationSans", Pt(8.0));
            draw_list.set_fill_color(Color::rgb(161, 161, 170));
            draw_list.draw_text(margin, Mm(8.2).into(), &self.report_title);
        } else {
            // Header: amber accent line at top
            let header_y: Pt = Mm(8.0).into(); // top-left origin: Y=8mm from top
            draw_list.set_stroke_color(Color::rgb(217, 119, 6)); // Amber
            draw_list.set_line_width(Pt(1.5));
            draw_list.draw_line(margin, header_y, right_edge, header_y);

            // Project name (top left, above the line)
            draw_list.set_font("LiberationSans-Bold", Pt(9.0));
            draw_list.set_fill_color(Color::rgb(54, 54, 62));
            draw_list.draw_text(margin, Mm(5.0).into(), &self.project_name);

            // Report title (top right)
            draw_list.set_font("LiberationSans", Pt(8.0));
            draw_list.set_fill_color(Color::rgb(161, 161, 170));
            draw_list.draw_text_right(right_edge, Mm(5.0).into(), &self.report_title);
        }

        // Footer: thin line near bottom
        let footer_line_y = Pt(page_size.height.0 - Mm(12.0).0);
        draw_list.set_stroke_color(Color::rgb(231, 229, 228));
        draw_list.set_line_width(Pt(0.5));
        draw_list.draw_line(margin, footer_line_y, right_edge, footer_line_y);

        // Company name (bottom left)
        let footer_text_y = Pt(page_size.height.0 - Mm(10.0).0);
        draw_list.set_font("LiberationSans", Pt(7.0));
        draw_list.set_fill_color(Color::rgb(161, 161, 170));
        draw_list.draw_text(margin, footer_text_y, &self.company_name);

        // Page number (bottom right)
        let page_text = format!("Pagina {} / {}", page_num, total_pages);
        draw_list.draw_text_right(right_edge, footer_text_y, &page_text);
    }
}

/// Decodeer een logo uit een data-URL ("data:image/png;base64,....") naar
/// (bytes, hoogte/breedte-verhouding). None bij lege of onleesbare input.
fn decode_logo(data_url: &str) -> Option<(Vec<u8>, f32)> {
    let trimmed = data_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let b64 = trimmed.split(',').next_back().unwrap_or(trimmed);
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let dims = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()?;
    if dims.0 == 0 || dims.1 == 0 {
        return None;
    }
    Some((bytes, dims.1 as f32 / dims.0 as f32))
}

// ── PDF Generation ──────────────────────────────────────────────────────────

/// Load system fonts into the registry.
pub(crate) fn load_system_fonts(fonts: &SharedFontRegistry) {
    let mut reg = fonts.lock().unwrap();

    // Try common font paths on Windows
    let font_dir = std::path::Path::new("C:/Windows/Fonts");
    let font_candidates = [
        ("Inter", "segoeui.ttf"),                // Regular
        ("Inter-Bold", "segoeuib.ttf"),          // Bold
        ("Inter-Italic", "segoeuii.ttf"),        // Italic
        ("Inter-BoldItalic", "segoeuiz.ttf"),    // Bold Italic (paragraaf-koppen)
    ];

    for (name, file) in &font_candidates {
        let path = font_dir.join(file);
        if path.exists() {
            match reg.register_ttf(name, &path) {
                Ok(_) => {}
                Err(e) => eprintln!("Failed to load font {}: {}", name, e),
            }
        }
    }

    // Register aliases
    reg.register_alias("LiberationSans", "Inter");
    reg.register_alias("LiberationSans-Bold", "Inter-Bold");
    reg.register_alias("LiberationSans-Italic", "Inter-Italic");
    reg.register_alias("LiberationSans-BoldItalic", "Inter-BoldItalic");
    reg.register_alias("LiberationSans-Regular", "Inter");
}

// Bouw 1 report generation is in bouw1.rs

/// Generate PDF bytes from a report request.
pub fn generate_bytes(request: &ReportRequest) -> Result<Vec<u8>, String> {
    // Route Bouw 1 view through Typst engine
    if request.report_view == "bouw1" {
        return super::bouw1::generate_bouw1_typst(request);
    }
    // Route IBIS-stijl view through its own Typst template
    if request.report_view == "ibis" {
        return super::ibis::generate_ibis_typst(request);
    }

    let fonts = shared_font_registry();
    load_system_fonts(&fonts);
    let page = page_size_for(&request.page_size, &request.page_orientation);

    // Margins
    let margin_left: Pt = Mm(12.0).into();
    let margin_right: Pt = Mm(12.0).into();
    let margin_top: Pt = Mm(18.0).into();
    let margin_bottom: Pt = Mm(15.0).into();

    // Content frame
    let frame = Frame::new(Rect::new(
        margin_left,
        margin_bottom,
        Pt(page.width.0 - margin_left.0 - margin_right.0),
        Pt(page.height.0 - margin_top.0 - margin_bottom.0),
    ));

    // Page template with header/footer callback
    let company_name = request
        .company_info
        .as_ref()
        .map(|c| c.name.clone())
        .unwrap_or_default();

    // Bedrijfslogo rechtsboven in de koptekst (indien ingesteld)
    let logo_right = request
        .company_info
        .as_ref()
        .and_then(|c| c.logo_right.as_deref())
        .and_then(decode_logo);

    let callback = ReportPageCallback {
        project_name: request.schedule.project_name.clone(),
        report_title: view_title(&request.report_view).to_string(),
        company_name,
        logo_right,
    };

    let template = PageTemplate::new("content", page, frame)
        .with_callback(Box::new(callback));

    let mut doc = DocTemplate::new(
        format!("{} - {}", request.schedule.project_name, view_title(&request.report_view)),
        fonts.clone(),
    );
    doc.add_page_template(template);

    // Build flowables
    let mut flowables: Vec<Box<dyn Flowable>> = Vec::new();

    // Cover page title (as a large paragraph)
    if request.include_cover.unwrap_or(false) {
        let title_style = ParagraphStyle {
            font_size: Pt(24.0),
            leading: Pt(30.0),
            bold: true,
            space_after: Pt(12.0),
            ..Default::default()
        };
        flowables.push(Box::new(Paragraph::new(
            &request.schedule.project_name,
            title_style,
        )));

        let subtitle_style = ParagraphStyle {
            font_size: Pt(14.0),
            leading: Pt(18.0),
            text_color: Color::rgb(161, 161, 170),
            space_after: Pt(8.0),
            ..Default::default()
        };
        flowables.push(Box::new(Paragraph::new(
            view_title(&request.report_view),
            subtitle_style.clone(),
        )));
        flowables.push(Box::new(Paragraph::new(
            &request.schedule.name,
            subtitle_style,
        )));

        flowables.push(Box::new(PageBreak));
    }

    // Main table
    let mut columns = get_columns(&request.report_view, request.show_hoeveelheid);
    // Verrekenbaar-kolom is optioneel (rapport-eigenschap); default aan.
    if !request.schedule.report_show_verrekenbaar.unwrap_or(true) {
        columns.retain(|c| c.key != "verrekenbaar");
    }
    let filtered = filter_items(&request.items, &request.report_view);

    // Verrekenbaar erft van het dichtstbijzijnde hoofdstuk erboven: in de
    // begroting staat de 'V' meestal op hoofdstukniveau, terwijl het rapport
    // hem per postregel toont.
    let verr_of: std::collections::HashMap<&str, String> = {
        let by_id: std::collections::HashMap<&str, &CostItem> =
            request.items.iter().map(|i| (i.id.as_str(), i)).collect();
        request
            .items
            .iter()
            .map(|i| {
                let mut v = i.verrekenbaar.clone().unwrap_or_default();
                let mut cur = i.parent_id.as_deref();
                while v.is_empty() {
                    match cur.and_then(|id| by_id.get(id)) {
                        Some(p) => {
                            v = p.verrekenbaar.clone().unwrap_or_default();
                            cur = p.parent_id.as_deref();
                        }
                        None => break,
                    }
                }
                (i.id.as_str(), v)
            })
            .collect()
    };

    // Build headers
    let headers: Vec<String> = columns.iter().map(|c| c.label.to_string()).collect();

    // Calculate column widths in mm
    let content_width_mm: f64 = match request.page_orientation.as_str() {
        "landscape" => match request.page_size.as_str() {
            "A3" => 420.0 - 24.0,
            _ => 297.0 - 24.0,
        },
        _ => match request.page_size.as_str() {
            "A3" => 297.0 - 24.0,
            _ => 210.0 - 24.0,
        },
    };

    // Resolve auto-width columns (width_mm == 0.0)
    let fixed_total: f64 = columns.iter().filter(|c| c.width_mm > 0.0).map(|c| c.width_mm).sum();
    let auto_count = columns.iter().filter(|c| c.width_mm == 0.0).count();
    let auto_width = if auto_count > 0 {
        (content_width_mm - fixed_total) / auto_count as f64
    } else {
        0.0
    };

    let col_widths: Vec<f64> = columns
        .iter()
        .map(|c| if c.width_mm == 0.0 { auto_width } else { c.width_mm })
        .collect();

    // Getalkolommen rechts uitlijnen (zoals in de besteksopmaak).
    let col_alignments: Vec<Alignment> = columns
        .iter()
        .map(|c| match c.key {
            "quantity" | "unitPrice" | "normUnitPrice" | "total" => Alignment::Right,
            _ => Alignment::Left,
        })
        .collect();

    // Build rows
    let rows: Vec<Vec<String>> = filtered
        .iter()
        .map(|item| {
            columns
                .iter()
                .map(|col| match col.key {
                    "verrekenbaar" if item.row_type != "tekstregel" && item.row_type != "witregel" => {
                        verr_of.get(item.id.as_str()).cloned().unwrap_or_default()
                    }
                    "verrekenbaar" => String::new(),
                    key => get_cell_value(item, key),
                })
                .collect()
        })
        .collect();

    // Report title
    let title_text = format!(
        "{} — {}",
        request.schedule.project_name,
        view_title(&request.report_view),
    );
    flowables.push(Box::new(Paragraph::new(&title_text, ParagraphStyle {
        font_size: Pt(12.0),
        leading: Pt(16.0),
        bold: true,
        space_after: Pt(4.0),
        ..Default::default()
    })));

    // Metadata line
    let meta_parts: Vec<String> = [
        (!request.schedule.project_number.is_empty()).then(|| format!("Projectnummer: {}", request.schedule.project_number)),
        (!request.schedule.client.is_empty()).then(|| format!("Opdrachtgever: {}", request.schedule.client)),
        (!request.schedule.author.is_empty()).then(|| format!("Auteur: {}", request.schedule.author)),
    ].into_iter().flatten().collect();

    if !meta_parts.is_empty() {
        flowables.push(Box::new(Paragraph::new(&meta_parts.join("  |  "), ParagraphStyle {
            font_size: Pt(8.0),
            leading: Pt(11.0),
            text_color: Color::rgb(161, 161, 170),
            space_after: Pt(8.0),
            ..Default::default()
        })));
    }

    if rows.is_empty() {
        flowables.push(Box::new(Paragraph::plain("Geen items gevonden voor deze rapportage view.")));
    }

    // ── Build table(s) with view-specific logic ──

    // Werkbeschrijving en hoofdaanneming renderen in de "clean" stijl:
    // geen cellijnen, inspringende paragrafen, typografische hiërarchie en
    // (hoofdaanneming) een subtotaal per paragraaf — naar de klassieke
    // besteksopmaak.
    let clean_view = request.report_view == "werkbeschrijving"
        || request.report_view == "hoofdaanneming";
    let use_chapter_subtotals = request.report_view == "hoofdaanneming";
    // Rapportoptie: alleen subtotaal-bedragen tonen (hoeveelheden blijven)
    let hide_line_amounts = use_chapter_subtotals
        && request.schedule.report_amounts_subtotals_only.unwrap_or(false);
    let has_total_col = columns.iter().any(|c| c.key == "total");

    // Detect staartkosten
    let staart_items: Vec<&CostItem> = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_"))
        .collect();
    let has_staart = !staart_items.is_empty();
    let show_staart = has_staart && has_total_col
        && (request.report_view == "hoofdaanneming"
            || request.report_view == "inschrijfstaat"
            || request.report_view == "nacalculatie");

    // Create table with OpenAEC styling
    let table_style = if clean_view {
        // Clean besteksopmaak: geen cellijnen/zebra/vulling, alleen een
        // dunne lijn onder de koprij.
        TableStyleConfig {
            header_background: None,
            header_text_color: Color::rgb(54, 54, 62),
            grid_color: Color::rgb(168, 162, 158),
            grid_width: Pt(0.0),
            row_backgrounds: vec![None],
            cell_padding: Padding::new(Pt(2.0), Pt(3.0), Pt(2.0), Pt(3.0)),
            font_name: "LiberationSans".to_string(),
            header_font_name: "LiberationSans-Bold".to_string(),
            font_size: Pt(7.5),
            header_font_size: Pt(7.0),
            header_rule: true,
        }
    } else {
        TableStyleConfig {
            header_background: Some(Color::rgb(254, 243, 199)), // Amber light #FEF3C7
            header_text_color: Color::rgb(54, 54, 62),
            grid_color: Color::rgb(231, 229, 228),
            grid_width: Pt(0.5),
            row_backgrounds: vec![None, Some(Color::rgb(250, 250, 249))], // Zebra
            cell_padding: Padding::new(Pt(2.0), Pt(3.0), Pt(2.0), Pt(3.0)),
            font_name: "LiberationSans".to_string(),
            header_font_name: "LiberationSans-Bold".to_string(),
            font_size: Pt(7.5),
            header_font_size: Pt(7.0),
            header_rule: false,
        }
    };

    if clean_view && !filtered.is_empty() {
        // Eén doorlopende tabel in besteksopmaak: inspringende omschrijvingen,
        // hoofdstukken vet / paragrafen vet-cursief / opmerkingen cursief, en
        // bij hoofdaanneming een vetgedrukte subtotaalregel per paragraaf
        // (het hoofdstuk dat de posten direct bevat), gevolgd door een
        // witregel.
        let desc_idx = columns.iter().position(|c| c.key == "description").unwrap_or(1);
        let total_idx = columns.iter().position(|c| c.key == "total");
        let n_cols = columns.len();

        let mut body_rows: Vec<Vec<String>> = Vec::new();
        let mut overrides: Vec<Option<RowOverride>> = Vec::new();
        // Paragraaf waarvan nog een subtotaal openstaat: (chapter_id, total)
        let mut pending_subtotal: Option<(String, f64)> = None;

        let push_subtotal = |body: &mut Vec<Vec<String>>,
                             ovs: &mut Vec<Option<RowOverride>>,
                             sum: f64| {
            if sum == 0.0 {
                return;
            }
            let mut r = vec![String::new(); n_cols];
            r[desc_idx] = format!("{}Subtotaal", indent_for(1));
            if let Some(t) = total_idx {
                r[t] = fmt_bedrag(sum);
            }
            body.push(r);
            ovs.push(Some(RowOverride {
                font_name: Some("LiberationSans-Bold".to_string()),
                // Som-lijn tussen de laatste post en het subtotaal
                top_rule_sum: true,
                ..Default::default()
            }));
            // Witregel na het subtotaal
            body.push(vec![String::new(); n_cols]);
            ovs.push(None);
        };

        for item in &filtered {
            if item.row_type == "chapter" {
                if use_chapter_subtotals {
                    if let Some((_, sum)) = pending_subtotal.take() {
                        push_subtotal(&mut body_rows, &mut overrides, sum);
                    }
                }
                let row: Vec<String> = columns
                    .iter()
                    .map(|col| match col.key {
                        "description" => {
                            format!("{}{}", indent_for(item.depth), item.description)
                        }
                        // Hoofdaanneming: geen bedragen naast hoofdstukregels —
                        // die staan in de subtotalen per paragraaf.
                        "total" | "unitPrice" if use_chapter_subtotals => String::new(),
                        "total" => fmt_bedrag(item.total),
                        // S-kolom (V/N) alleen op posten, niet op hoofdstukken
                        "verrekenbaar" => String::new(),
                        key => get_cell_value(item, key),
                    })
                    .collect();
                body_rows.push(row);
                overrides.push(row_font_for(item));
            } else {
                let row: Vec<String> = columns
                    .iter()
                    .map(|col| match col.key {
                        "description" => {
                            format!("{}{}", indent_for(item.depth), item.description)
                        }
                        // Rapportoptie: alleen subtotaal-bedragen — individuele
                        // regelbedragen leeg, hoeveelheden blijven staan.
                        "unitPrice" | "total" if hide_line_amounts => String::new(),
                        // Besteksopmaak: kale bedragen zonder valutateken
                        "unitPrice" => fmt_bedrag(item.unit_price),
                        "total" => fmt_bedrag(item.total),
                        // V/N: eigen waarde of geërfd van het hoofdstuk —
                        // alleen op rekenende regels, niet op opmerkingen
                        "verrekenbaar" if item.row_type != "tekstregel" && item.row_type != "witregel" => {
                            verr_of.get(item.id.as_str()).cloned().unwrap_or_default()
                        }
                        "verrekenbaar" => String::new(),
                        key => get_cell_value(item, key),
                    })
                    .collect();
                body_rows.push(row);
                overrides.push(row_font_for(item));

                // Posten bepalen de paragraaf waarvoor een subtotaal volgt.
                if item.row_type == "begrotingspost" {
                    if let Some(pid) = &item.parent_id {
                        let sum = request
                            .items
                            .iter()
                            .find(|i| &i.id == pid)
                            .map(|p| p.total)
                            .unwrap_or(0.0);
                        pending_subtotal = Some((pid.clone(), sum));
                    }
                }
            }
        }
        if use_chapter_subtotals {
            if let Some((_, sum)) = pending_subtotal.take() {
                push_subtotal(&mut body_rows, &mut overrides, sum);
            }
        }

        let table = Table::new(headers.clone(), body_rows)
            .with_col_widths_mm(col_widths.clone())
            .with_style(table_style.clone())
            .with_row_overrides(overrides)
            .with_col_alignments(col_alignments.clone())
            .with_repeat_header(true);
        flowables.push(Box::new(table));
    } else {
        // Standard table for other views
        let table = Table::new(headers.clone(), rows)
            .with_col_widths_mm(col_widths.clone())
            .with_style(table_style.clone())
            .with_col_alignments(col_alignments.clone())
            .with_repeat_header(true);
        flowables.push(Box::new(table));
    }

    // ── Staartkosten / totaalregel ──
    if show_staart {
        flowables.push(Box::new(Spacer::from_mm(4.0)));

        // Kostprijs subtotal
        let kostprijs: f64 = filtered.iter()
            .filter(|i| i.row_type == "chapter" && i.depth == 0)
            .map(|i| i.total)
            .sum();

        flowables.push(Box::new(Paragraph::new(
            &format!("Subtotaal directe kosten (Kostprijs): {}", fmt_currency(kostprijs)),
            ParagraphStyle {
                font_size: Pt(8.0),
                leading: Pt(11.0),
                bold: true,
                space_after: Pt(2.0),
                ..Default::default()
            },
        )));

        // Individual staart items (exclude BTW and afronding — shown separately below)
        for si in &staart_items {
            if si.row_type == "staart_btw" || si.row_type == "staart_afronding" {
                continue;
            }
            let pct_str = si.staart_percentage.map(|p| format!(" ({:.2}%)", p)).unwrap_or_default();
            flowables.push(Box::new(Paragraph::new(
                &format!("{}{}:  {}", si.description, pct_str, fmt_currency(si.total)),
                ParagraphStyle {
                    font_size: Pt(7.5),
                    leading: Pt(10.0),
                    space_after: Pt(1.0),
                    ..Default::default()
                },
            )));
        }

        // Aanneemsom excl. BTW (exclude staart_btw and staart_afronding from sum)
        let aanneemsom_excl: f64 = kostprijs + staart_items.iter()
            .filter(|i| i.row_type != "staart_btw" && i.row_type != "staart_afronding")
            .map(|i| i.total).sum::<f64>();
        let btw_amount: f64 = staart_items.iter()
            .filter(|i| i.row_type == "staart_btw")
            .map(|i| i.total).sum();
        let aanneemsom_incl = aanneemsom_excl + btw_amount;
        flowables.push(Box::new(Spacer::from_mm(2.0)));
        flowables.push(Box::new(Paragraph::new(
            &format!("Aanneemsom excl. BTW: {}", fmt_currency(aanneemsom_excl)),
            ParagraphStyle {
                font_size: Pt(9.0),
                leading: Pt(12.0),
                bold: true,
                space_after: Pt(1.0),
                ..Default::default()
            },
        )));
        if btw_amount > 0.0 {
            flowables.push(Box::new(Paragraph::new(
                &format!("BTW 21%: {}", fmt_currency(btw_amount)),
                ParagraphStyle {
                    font_size: Pt(8.0),
                    leading: Pt(11.0),
                    space_after: Pt(1.0),
                    ..Default::default()
                },
            )));
            flowables.push(Box::new(Paragraph::new(
                &format!("Totaal incl. BTW: {}", fmt_currency(aanneemsom_incl)),
                ParagraphStyle {
                    font_size: Pt(9.0),
                    leading: Pt(12.0),
                    bold: true,
                    space_after: Pt(4.0),
                    ..Default::default()
                },
            )));
        }
    } else if has_total_col {
        // Simple total row for views without staart
        let grand_total: f64 = filtered.iter()
            .filter(|i| i.row_type == "chapter" && i.depth == 0)
            .map(|i| i.total)
            .sum();

        if grand_total != 0.0 {
            flowables.push(Box::new(Spacer::from_mm(4.0)));
            flowables.push(Box::new(Paragraph::new(
                &format!("Totaal excl. BTW: {}", fmt_currency(grand_total)),
                ParagraphStyle {
                    font_size: Pt(9.0),
                    leading: Pt(12.0),
                    bold: true,
                    ..Default::default()
                },
            )));
        }
    }

    // Build PDF
    doc.build_to_bytes(flowables).map_err(|e| e.to_string())
}

pub fn generate(request: &ReportRequest, output_path: &str) -> Result<(), String> {
    let pdf_bytes = generate_bytes(request)?;
    std::fs::write(Path::new(output_path), pdf_bytes).map_err(|e| e.to_string())
}
