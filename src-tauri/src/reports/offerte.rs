//! Offerte PDF generator using openaec-layout.

use openaec_layout::*;
use std::path::Path;

use super::OfferteReportRequest;
use super::generator::fmt_currency;

#[derive(Debug, Clone)]
struct BriefhoofdCallback {
    image_bytes: Option<Vec<u8>>,
}

impl PageCallback for BriefhoofdCallback {
    fn on_page(&self, draw_list: &mut DrawList, page_num: usize, total_pages: usize, page_size: Size) {
        if let Some(ref bytes) = self.image_bytes {
            draw_list.draw_image(bytes.clone(), Pt(0.0), Pt(0.0), page_size.width, page_size.height);
        }
        let right_edge = Pt(page_size.width.0 - Mm(20.0).0);
        let bottom = Pt(page_size.height.0 - Mm(12.0).0);
        draw_list.set_font("LiberationSans", Pt(7.0));
        draw_list.set_fill_color(Color::rgb(120, 120, 120));
        draw_list.draw_text_right(right_edge, bottom, &format!("{} / {}", page_num, total_pages));
    }
}

fn section_title_style() -> ParagraphStyle {
    ParagraphStyle {
        font_size: Pt(14.0), leading: Pt(18.0), bold: true,
        space_after: Pt(8.0), text_color: Color::rgb(54, 54, 62),
        ..Default::default()
    }
}

fn body_style() -> ParagraphStyle {
    ParagraphStyle {
        font_size: Pt(9.0), leading: Pt(13.0), space_after: Pt(4.0),
        text_color: Color::rgb(54, 54, 62), ..Default::default()
    }
}

fn small_style() -> ParagraphStyle {
    ParagraphStyle {
        font_size: Pt(8.0), leading: Pt(11.0), space_after: Pt(2.0),
        text_color: Color::rgb(100, 100, 100), ..Default::default()
    }
}

pub fn generate_bytes(request: &OfferteReportRequest) -> Result<Vec<u8>, String> {
    let fonts = shared_font_registry();
    super::generator::load_system_fonts(&fonts);

    let page = Size { width: Mm(210.0).into(), height: Mm(297.0).into() };
    let margin_left: Pt = Mm(55.0).into();
    let margin_right: Pt = Mm(25.0).into();
    let margin_top: Pt = Mm(40.0).into();
    let margin_bottom: Pt = Mm(25.0).into();

    let frame = Frame::new(Rect::new(
        margin_left, margin_bottom,
        Pt(page.width.0 - margin_left.0 - margin_right.0),
        Pt(page.height.0 - margin_top.0 - margin_bottom.0),
    ));

    let briefhoofd_bytes = request.briefhoofd_path.as_ref().and_then(|p| std::fs::read(p).ok());
    let callback = BriefhoofdCallback { image_bytes: briefhoofd_bytes };
    let template = PageTemplate::new("offerte", page, frame).with_callback(Box::new(callback));

    let mut doc = DocTemplate::new(
        format!("Offerte {}", request.offerte.offerte_nummer), fonts.clone(),
    );
    doc.add_page_template(template);

    let mut flowables: Vec<Box<dyn Flowable>> = Vec::new();

    // Cover page
    build_cover(request, &mut flowables);
    flowables.push(Box::new(PageBreak));

    // Sections
    for section in &request.offerte.secties {
        match section.section_type.as_str() {
            "technisch" => build_technical_section(section, &mut flowables),
            "meerwerk" => build_meerwerk_section(section, &mut flowables),
            "opdrachtgever" => build_opdrachtgever_section(section, &mut flowables),
            "vrij" => build_vrij_section(section, &mut flowables),
            _ => {}
        }
    }

    // Total price
    build_total_price(request, &mut flowables);

    // Payment terms
    if !request.offerte.betalingstermijnen.is_empty() {
        flowables.push(Box::new(Spacer::from_mm(8.0)));
        flowables.push(Box::new(Paragraph::new("Betalingstermijnen", section_title_style())));
        for (i, term) in request.offerte.betalingstermijnen.iter().enumerate() {
            flowables.push(Box::new(Paragraph::new(
                &format!("{}. {} — {}%", i + 1, term.beschrijving, term.percentage), body_style(),
            )));
            if !term.toelichting.is_empty() {
                flowables.push(Box::new(Paragraph::new(&term.toelichting, small_style())));
            }
        }
    }

    // Warranties
    if !request.offerte.garanties.is_empty() {
        flowables.push(Box::new(Spacer::from_mm(8.0)));
        flowables.push(Box::new(Paragraph::new("Garanties", section_title_style())));
        for g in &request.offerte.garanties {
            flowables.push(Box::new(Paragraph::new(
                &format!("• {} — {}", g.onderdeel, g.termijn), body_style(),
            )));
            if !g.toelichting.is_empty() {
                flowables.push(Box::new(Paragraph::new(&g.toelichting, small_style())));
            }
        }
    }

    // Conditions
    if !request.offerte.voorwaarden.is_empty() {
        flowables.push(Box::new(Spacer::from_mm(8.0)));
        flowables.push(Box::new(Paragraph::new("Voorwaarden", section_title_style())));
        for line in request.offerte.voorwaarden.lines() {
            flowables.push(Box::new(Paragraph::new(line, body_style())));
        }
        flowables.push(Box::new(Paragraph::new(
            &format!("Deze offerte is {} dagen geldig.", request.offerte.geldigheid),
            ParagraphStyle { bold: true, ..body_style() },
        )));
    }

    // Signature
    flowables.push(Box::new(Spacer::from_mm(12.0)));
    flowables.push(Box::new(Paragraph::new("Voor akkoord:", ParagraphStyle {
        font_size: Pt(10.0), leading: Pt(14.0), bold: true, space_after: Pt(20.0),
        ..Default::default()
    })));
    flowables.push(Box::new(Paragraph::new("____________________________",
        ParagraphStyle { space_after: Pt(4.0), ..body_style() })));
    flowables.push(Box::new(Paragraph::new(&request.offerte.geadresseerde.naam, small_style())));
    flowables.push(Box::new(Spacer::from_mm(8.0)));
    for sig in &request.offerte.ondertekening {
        if sig.naam.is_empty() { continue; }
        flowables.push(Box::new(Paragraph::new(
            &format!("{} — {}", sig.naam, sig.functie), body_style(),
        )));
        let contact = [&sig.email, &sig.telefoon].iter()
            .filter(|s| !s.is_empty()).map(|s| s.as_str()).collect::<Vec<_>>().join(" | ");
        if !contact.is_empty() {
            flowables.push(Box::new(Paragraph::new(&contact, small_style())));
        }
    }

    doc.build_to_bytes(flowables).map_err(|e| e.to_string())
}

pub fn generate(request: &OfferteReportRequest, output_path: &str) -> Result<(), String> {
    let pdf_bytes = generate_bytes(request)?;
    std::fs::write(Path::new(output_path), pdf_bytes).map_err(|e| e.to_string())
}

fn build_cover(request: &OfferteReportRequest, flowables: &mut Vec<Box<dyn Flowable>>) {
    let addr = &request.offerte.geadresseerde;
    flowables.push(Box::new(Paragraph::new(&addr.naam, body_style())));
    flowables.push(Box::new(Paragraph::new(&addr.adres, body_style())));
    flowables.push(Box::new(Paragraph::new(
        &format!("{} {}", addr.postcode, addr.plaats),
        ParagraphStyle { space_after: Pt(12.0), ..body_style() },
    )));
    flowables.push(Box::new(Paragraph::new(
        &format!("Offerte {} — {}", request.offerte.offerte_nummer, request.offerte.offerte_datum),
        ParagraphStyle { bold: true, font_size: Pt(11.0), leading: Pt(15.0), space_after: Pt(12.0), ..Default::default() },
    )));
    for line in request.offerte.begeleidend_schrijven.lines() {
        if line.trim().is_empty() {
            flowables.push(Box::new(Spacer::from_mm(4.0)));
        } else {
            flowables.push(Box::new(Paragraph::new(line, body_style())));
        }
    }
}

fn build_technical_section(section: &super::OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if !section.begeleidende_tekst.is_empty() {
        flowables.push(Box::new(Paragraph::new(&section.begeleidende_tekst, body_style())));
    }
    if section.items.is_empty() { return; }

    let headers = vec!["Onderdeel".to_string(), "Omschrijving".to_string(), "Afbeelding".to_string()];
    let col_widths_mm = vec![30.0, 50.0, 50.0];

    let rows: Vec<Vec<String>> = section.items.iter().map(|item| {
        let mut desc_parts = vec![item.omschrijving.clone()];
        for sub in &item.sub_items { desc_parts.push(format!("• {}", sub)); }
        for prop in &item.properties {
            let unit = prop.unit.as_deref().unwrap_or("");
            desc_parts.push(format!("{}: {} {}", prop.name, prop.value, unit).trim().to_string());
        }
        let img_label = if item.afbeeldingen.is_empty() { String::new() } else { format!("[{} afb.]", item.afbeeldingen.len()) };
        vec![item.onderdeel.clone(), desc_parts.join("\n"), img_label]
    }).collect();

    let style = TableStyleConfig {
        header_background: Some(Color::rgb(245, 245, 245)),
        header_text_color: Color::rgb(54, 54, 62),
        grid_color: Color::rgb(220, 220, 220),
        grid_width: Pt(0.3),
        row_backgrounds: vec![None],
        cell_padding: Padding::new(Pt(3.0), Pt(4.0), Pt(3.0), Pt(4.0)),
        font_name: "LiberationSans".to_string(),
        header_font_name: "LiberationSans-Bold".to_string(),
        font_size: Pt(8.0),
        header_font_size: Pt(8.0),
        header_rule: false,
    };

    flowables.push(Box::new(
        Table::new(headers, rows).with_col_widths_mm(col_widths_mm).with_style(style).with_repeat_header(true)
    ));
}

fn build_meerwerk_section(section: &super::OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if section.items.is_empty() { return; }

    let headers = vec!["Onderdeel".to_string(), "Omschrijving".to_string(), "Prijs".to_string()];
    let col_widths_mm = vec![40.0, 60.0, 30.0];
    let rows: Vec<Vec<String>> = section.items.iter().map(|item| {
        let price = item.price_override.or(item.price_per_unit).map(|p| fmt_currency(p)).unwrap_or_default();
        let unit = item.price_unit.clone().unwrap_or_default();
        let price_str = if unit.is_empty() { price } else { format!("{} / {}", price, unit) };
        vec![item.onderdeel.clone(), item.omschrijving.clone(), price_str]
    }).collect();

    let style = TableStyleConfig {
        header_background: Some(Color::rgb(245, 245, 245)),
        header_text_color: Color::rgb(54, 54, 62),
        grid_color: Color::rgb(220, 220, 220),
        grid_width: Pt(0.3),
        row_backgrounds: vec![None],
        cell_padding: Padding::new(Pt(3.0), Pt(4.0), Pt(3.0), Pt(4.0)),
        font_name: "LiberationSans".to_string(),
        header_font_name: "LiberationSans-Bold".to_string(),
        font_size: Pt(8.0),
        header_font_size: Pt(8.0),
        header_rule: false,
    };

    flowables.push(Box::new(
        Table::new(headers, rows).with_col_widths_mm(col_widths_mm).with_style(style).with_repeat_header(true)
    ));
}

fn build_opdrachtgever_section(section: &super::OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    for item in &section.items {
        flowables.push(Box::new(Paragraph::new(
            &format!("• {} — {}", item.onderdeel, item.omschrijving), body_style(),
        )));
    }
}

fn build_vrij_section(section: &super::OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if !section.begeleidende_tekst.is_empty() {
        flowables.push(Box::new(Paragraph::new(&section.begeleidende_tekst, body_style())));
    }
    for item in &section.items {
        flowables.push(Box::new(Paragraph::new(&format!("• {}", item.onderdeel), body_style())));
    }
}

fn build_total_price(request: &OfferteReportRequest, flowables: &mut Vec<Box<dyn Flowable>>) {
    let aanneemsom: f64 = request.items.iter()
        .filter(|i| i.row_type == "chapter" && i.depth == 0).map(|i| i.total).sum();
    let staart_total: f64 = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_") && i.row_type != "staart_btw")
        .map(|i| i.total).sum();
    let total_excl = aanneemsom + staart_total;
    let btw = total_excl * 0.21;
    let total_incl = total_excl + btw;

    flowables.push(Box::new(Spacer::from_mm(12.0)));
    flowables.push(Box::new(Paragraph::new(
        &format!("Wij kunnen deze werkzaamheden verzorgen voor: {}", fmt_currency(total_incl)),
        ParagraphStyle { font_size: Pt(11.0), leading: Pt(15.0), bold: true, space_after: Pt(4.0), ..Default::default() },
    )));
    flowables.push(Box::new(Paragraph::new("Dit bedrag is inclusief BTW (21%).", small_style())));
}
