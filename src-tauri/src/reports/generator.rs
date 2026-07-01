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
        "werkbeschrijving" => vec![
            Col { key: "code", label: "Code", width_mm: 50.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 25.0 },
            Col { key: "unit", label: "Eenheid", width_mm: 20.0 },
            Col { key: "verrekenbaar", label: "Verr.", width_mm: 15.0 },
        ],
        "hoofdaanneming" => vec![
            Col { key: "code", label: "Code", width_mm: 45.0 },
            Col { key: "description", label: "Omschrijving", width_mm: 0.0 },
            Col { key: "quantity", label: "Hoeveelheid", width_mm: 25.0 },
            Col { key: "unit", label: "Eenheid", width_mm: 20.0 },
            Col { key: "unitPrice", label: "Eenheidsprijs", width_mm: 30.0 },
            Col { key: "total", label: "Bedrag", width_mm: 35.0 },
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
            "werkbeschrijving" => i.row_type == "chapter" || i.row_type == "begrotingspost",
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

fn get_cell_value(item: &CostItem, key: &str) -> String {
    match key {
        "nr" => item.nr.clone().unwrap_or_default(),
        "code" => item.code.clone(),
        "description" => item.description.clone(),
        "quantity" => fmt_number(item.quantity),
        "unit" => item.unit.clone().unwrap_or_default(),
        "verrekenbaar" => {
            if item.row_type == "chapter" {
                item.verrekenbaar.clone().unwrap_or_default()
            } else {
                String::new()
            }
        }
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

// ── PDF Generation ──────────────────────────────────────────────────────────

/// Load system fonts into the registry.
pub(crate) fn load_system_fonts(fonts: &SharedFontRegistry) {
    let mut reg = fonts.lock().unwrap();

    // Try common font paths on Windows
    let font_dir = std::path::Path::new("C:/Windows/Fonts");
    let font_candidates = [
        ("Inter", "segoeui.ttf"),          // Regular
        ("Inter-Bold", "segoeuib.ttf"),    // Bold
        ("Inter-Italic", "segoeuii.ttf"),  // Italic
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

    let callback = ReportPageCallback {
        project_name: request.schedule.project_name.clone(),
        report_title: view_title(&request.report_view).to_string(),
        company_name,
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
    let columns = get_columns(&request.report_view, request.show_hoeveelheid);
    let filtered = filter_items(&request.items, &request.report_view);

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

    // Build rows
    let rows: Vec<Vec<String>> = filtered
        .iter()
        .map(|item| {
            columns
                .iter()
                .map(|col| get_cell_value(item, col.key))
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
        (!request.schedule.project_number.is_empty()).then(|| format!("Nr: {}", request.schedule.project_number)),
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

    // For hoofdaanneming: split into per-chapter tables with subtotals
    let use_chapter_subtotals = request.report_view == "hoofdaanneming";
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
    let table_style = TableStyleConfig {
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
    };

    // For hoofdaanneming with chapter subtotals: build separate tables per chapter section
    if use_chapter_subtotals && filtered.len() > 1 {
        let mut chapter_rows: Vec<Vec<String>> = Vec::new();
        let mut current_chapter_total: f64 = 0.0;
        let mut in_chapter = false;

        for (i, item) in filtered.iter().enumerate() {
            let is_new_top_chapter = item.row_type == "chapter" && item.depth == 0;

            // If we hit a new top-level chapter and have accumulated rows, flush them
            if is_new_top_chapter && in_chapter && !chapter_rows.is_empty() {
                // Build table for this chapter section
                let mut t = Table::new(headers.clone(), chapter_rows.clone())
                    .with_col_widths_mm(col_widths.clone())
                    .with_style(table_style.clone())
                    .with_repeat_header(true);
                flowables.push(Box::new(t));

                // Add subtotal paragraph
                if current_chapter_total != 0.0 {
                    let sub_text = format!("Subtotaal: {}", fmt_currency(current_chapter_total));
                    flowables.push(Box::new(Paragraph::new(&sub_text, ParagraphStyle {
                        font_size: Pt(8.0),
                        leading: Pt(11.0),
                        bold: true,
                        space_after: Pt(12.0),
                        alignment: Alignment::Right,
                        ..Default::default()
                    })));
                }

                chapter_rows.clear();
            }

            if is_new_top_chapter {
                in_chapter = true;
                current_chapter_total = item.total;
            }

            // Add row data
            let row: Vec<String> = columns.iter().map(|col| get_cell_value(item, col.key)).collect();
            chapter_rows.push(row);
        }

        // Flush last chapter section
        if !chapter_rows.is_empty() {
            let t = Table::new(headers.clone(), chapter_rows)
                .with_col_widths_mm(col_widths.clone())
                .with_style(table_style.clone())
                .with_repeat_header(true);
            flowables.push(Box::new(t));

            if current_chapter_total != 0.0 {
                let sub_text = format!("Subtotaal: {}", fmt_currency(current_chapter_total));
                flowables.push(Box::new(Paragraph::new(&sub_text, ParagraphStyle {
                    font_size: Pt(8.0),
                    leading: Pt(11.0),
                    bold: true,
                    space_after: Pt(12.0),
                    alignment: Alignment::Right,
                    ..Default::default()
                })));
            }
        }
    } else {
        // Standard table for other views
        let table = Table::new(headers.clone(), rows)
            .with_col_widths_mm(col_widths.clone())
            .with_style(table_style.clone())
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
