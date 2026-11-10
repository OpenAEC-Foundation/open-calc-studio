//! Offerte PDF generator using openaec-layout.

use openaec_layout::*;
use std::path::Path;

use super::{CostItem, OfferteReportRequest, OfferteSection};

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
        request.lbl_fmt("offerte.title", "Offerte {{number}}", &[("number", &request.offerte.offerte_nummer)]),
        fonts.clone(),
    );
    doc.add_page_template(template);

    let mut flowables: Vec<Box<dyn Flowable>> = Vec::new();

    // Cover page
    build_cover(request, &mut flowables);
    flowables.push(Box::new(PageBreak));

    // Sections
    for section in &request.offerte.secties {
        match section.section_type.as_str() {
            "technisch" => build_technical_section(request, section, &mut flowables),
            "meerwerk" => build_meerwerk_section(request, section, &mut flowables),
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
        flowables.push(Box::new(Paragraph::new(request.lbl("offerte.paymentTerms", "Betalingstermijnen"), section_title_style())));
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
        flowables.push(Box::new(Paragraph::new(request.lbl("offerte.guarantees", "Garanties"), section_title_style())));
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
        flowables.push(Box::new(Paragraph::new(request.lbl("offerte.conditions", "Voorwaarden"), section_title_style())));
        for line in request.offerte.voorwaarden.lines() {
            flowables.push(Box::new(Paragraph::new(line, body_style())));
        }
        flowables.push(Box::new(Paragraph::new(
            &request.lbl_fmt(
                "offerte.validity",
                "Deze offerte is {{days}} dagen geldig.",
                &[("days", &request.offerte.geldigheid.to_string())],
            ),
            ParagraphStyle { bold: true, ..body_style() },
        )));
    }

    // Signature
    flowables.push(Box::new(Spacer::from_mm(12.0)));
    flowables.push(Box::new(Paragraph::new(request.lbl("offerte.approval", "Voor akkoord:"), ParagraphStyle {
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
        &request.lbl_fmt(
            "offerte.heading",
            "Offerte {{number}} — {{date}}",
            &[("number", &request.offerte.offerte_nummer), ("date", &request.number_format.date(&request.offerte.offerte_datum))],
        ),
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

fn build_technical_section(request: &OfferteReportRequest, section: &OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if !section.begeleidende_tekst.is_empty() {
        flowables.push(Box::new(Paragraph::new(&section.begeleidende_tekst, body_style())));
    }
    if section.items.is_empty() { return; }

    let headers = vec![
        request.lbl("columns.component", "Onderdeel").to_string(),
        request.lbl("columns.description", "Omschrijving").to_string(),
        request.lbl("columns.image", "Afbeelding").to_string(),
    ];
    let col_widths_mm = vec![30.0, 50.0, 50.0];

    let rows: Vec<Vec<String>> = section.items.iter().map(|item| {
        let mut desc_parts = vec![item.omschrijving.clone()];
        for sub in &item.sub_items { desc_parts.push(format!("• {}", sub)); }
        for prop in &item.properties {
            let unit = request.unit(prop.unit.as_deref().unwrap_or(""));
            desc_parts.push(format!("{}: {} {}", prop.name, prop.value, unit).trim().to_string());
        }
        let img_label = if item.afbeeldingen.is_empty() {
            String::new()
        } else {
            request.lbl_fmt("offerte.images", "[{{count}} afb.]", &[("count", &item.afbeeldingen.len().to_string())])
        };
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

fn build_meerwerk_section(request: &OfferteReportRequest, section: &OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    let nf = &request.number_format;
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if section.items.is_empty() { return; }

    let headers = vec![
        request.lbl("columns.component", "Onderdeel").to_string(),
        request.lbl("columns.description", "Omschrijving").to_string(),
        request.lbl("columns.price", "Prijs").to_string(),
    ];
    let col_widths_mm = vec![40.0, 60.0, 30.0];
    let rows: Vec<Vec<String>> = section.items.iter().map(|item| {
        let price = item.price_override.or(item.price_per_unit).map(|p| nf.currency(p)).unwrap_or_default();
        let unit = request.unit(item.price_unit.as_deref().unwrap_or(""));
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

fn build_opdrachtgever_section(section: &OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    for item in &section.items {
        flowables.push(Box::new(Paragraph::new(
            &format!("• {} — {}", item.onderdeel, item.omschrijving), body_style(),
        )));
    }
}

fn build_vrij_section(section: &OfferteSection, flowables: &mut Vec<Box<dyn Flowable>>) {
    flowables.push(Box::new(Spacer::from_mm(6.0)));
    flowables.push(Box::new(Paragraph::new(&section.titel, section_title_style())));
    if !section.begeleidende_tekst.is_empty() {
        flowables.push(Box::new(Paragraph::new(&section.begeleidende_tekst, body_style())));
    }
    for item in &section.items {
        flowables.push(Box::new(Paragraph::new(&format!("• {}", item.onderdeel), body_style())));
    }
}

/// Offertebedrag inclusief btw, plus het btw-tarief voor de toelichting.
/// De btw komt uit de staart-regels (hoog + laag), ook als die samen 0 zijn
/// (bijv. 0 % btw); alleen een begroting zonder enige btw-regel valt terug
/// op 21 % (knownbug 133, issue #65).
fn total_and_vat_rate(request: &OfferteReportRequest) -> (f64, Option<f64>) {
    let aanneemsom: f64 = request.items.iter()
        .filter(|i| i.row_type == "chapter" && i.depth == 0).map(|i| i.total).sum();
    let staart_total: f64 = request.items.iter()
        .filter(|i| i.row_type.starts_with("staart_") && !i.row_type.starts_with("staart_btw"))
        .map(|i| i.total).sum();
    let total_excl = aanneemsom + staart_total;
    let (btw, rate) = vat_summary(&request.items, total_excl);
    (total_excl + btw, rate)
}

#[cfg(test)]
fn total_incl_vat(request: &OfferteReportRequest) -> f64 {
    total_and_vat_rate(request).0
}

fn build_total_price(request: &OfferteReportRequest, flowables: &mut Vec<Box<dyn Flowable>>) {
    let nf = &request.number_format;
    let (total_incl, rate) = total_and_vat_rate(request);

    flowables.push(Box::new(Spacer::from_mm(12.0)));
    flowables.push(Box::new(Paragraph::new(
        &request.lbl_fmt(
            "offerte.totalOffer",
            "Wij kunnen deze werkzaamheden verzorgen voor: {{amount}}",
            &[("amount", &nf.currency(total_incl))],
        ),
        ParagraphStyle { font_size: Pt(11.0), leading: Pt(15.0), bold: true, space_after: Pt(4.0), ..Default::default() },
    )));
    // Het echte tarief uit de staart (IVA 16%, MwSt. 19%, …); bij laag én hoog
    // tegelijk bestaat er geen enkel tarief, dan de zin zonder percentage.
    flowables.push(Box::new(Paragraph::new(&vat_note(request, rate), small_style())));
}

/// Toelichting onder het offertebedrag: "inclusief btw (16%)", of zonder
/// tarief als laag én hoog allebei meetellen.
fn vat_note(request: &OfferteReportRequest, rate: Option<f64>) -> String {
    let nf = &request.number_format;
    match rate {
        // "21%", "5,5%" (geen overbodige nullen), in het %-patroon van de rapporttaal.
        Some(r) => request.lbl_fmt(
            "offerte.inclVatNote",
            "Dit bedrag is inclusief BTW ({{rate}}).",
            &[("rate", &nf.percent.replace("{{n}}", &nf.pct_value(r)))],
        ),
        None => request.lbl("offerte.inclVatNoteMixed", "Dit bedrag is inclusief BTW.").to_string(),
    }
}

/// Btw-bedrag en -tarief (in procenten) voor de offerte (issue #65).
///
/// - Btw-regels in de staart (`staart_btw`, `staart_btw_laag`) zijn leidend,
///   ook als ze samen 0 zijn (bijv. een land zonder btw): dan geen btw erbij.
/// - Alleen zonder btw-regels (oude bestanden) valt de offerte terug op 21%.
/// - Tarief: het percentage van de ene regel die echt meetelt; `None` als
///   laag én hoog allebei een bedrag hebben.
fn vat_summary(items: &[CostItem], total_excl: f64) -> (f64, Option<f64>) {
    let rows: Vec<&CostItem> = items.iter().filter(|i| i.row_type.starts_with("staart_btw")).collect();
    if rows.is_empty() {
        return (total_excl * 0.21, Some(21.0));
    }
    let btw: f64 = rows.iter().map(|i| i.total).sum();
    let active: Vec<&&CostItem> = rows.iter().filter(|i| i.total.abs() > 0.005).collect();
    let rate = match active.as_slice() {
        [] => Some(0.0),
        [one] => one.staart_percentage.or_else(|| (total_excl.abs() > 0.005).then(|| one.total / total_excl * 100.0)),
        _ => None,
    };
    (btw, rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(labels: serde_json::Value) -> OfferteReportRequest {
        serde_json::from_value(serde_json::json!({
            "offerte": {
                "offerteNummer": "2026-001", "offerteDatum": "11-09-2026", "geldigheid": 30,
                "geadresseerde": { "naam": "Gemeente", "adres": "Straat 1", "postcode": "1234 AB", "plaats": "Plaats" },
                "begeleidendSchrijven": "Geachte heer,",
                "secties": [{ "titel": "Werk", "type": "technisch", "begeleidendeTekst": "",
                              "items": [{ "onderdeel": "Dak", "omschrijving": "Vervangen", "isSelected": true }] }],
                "betalingstermijnen": [{ "beschrijving": "Oplevering", "percentage": 100.0 }],
                "garanties": [], "voorwaarden": "Algemene voorwaarden", "ondertekening": []
            },
            "schedule": { "name": "Test" },
            "items": [],
            "labels": labels,
        }))
        .expect("OfferteReportRequest parsen")
    }

    #[test]
    fn offerte_met_en_zonder_labels() {
        let en = serde_json::json!({
            "offerte.title": "Quotation {{number}}",
            "offerte.validity": "This quotation is valid for {{days}} days.",
            "offerte.paymentTerms": "Payment terms"
        });
        let req = request(en.clone());
        assert_eq!(req.lbl_fmt("offerte.validity", "Deze offerte is {{days}} dagen geldig.", &[("days", "30")]),
                   "This quotation is valid for 30 days.");
        assert_eq!(request(serde_json::json!({})).lbl("offerte.paymentTerms", "Betalingstermijnen"), "Betalingstermijnen");
        for labels in [serde_json::json!({}), en] {
            let pdf = generate_bytes(&request(labels)).expect("PDF");
            assert_eq!(&pdf[0..4], b"%PDF");
        }
    }

    fn with_items(items: serde_json::Value) -> OfferteReportRequest {
        let mut req = request(serde_json::json!({}));
        req.items = serde_json::from_value(items).expect("items parsen");
        req
    }

    fn chapter() -> serde_json::Value {
        serde_json::json!({ "id": "h1", "rowType": "chapter", "depth": 0, "parentId": null, "total": 1000.0 })
    }

    #[test]
    fn nul_procent_btw_blijft_nul() {
        // Knownbug 133: 0 % btw werd 21 % (1000 -> 1210).
        let req = with_items(serde_json::json!([
            chapter(),
            { "id": "b1", "rowType": "staart_btw_laag", "parentId": null, "total": 0.0, "staartPercentage": 9.0 },
            { "id": "b2", "rowType": "staart_btw", "parentId": null, "total": 0.0, "staartPercentage": 0.0 }
        ]));
        assert!((total_incl_vat(&req) - 1000.0).abs() < 1e-9);
    }

    #[test]
    fn berekende_btw_wordt_gebruikt() {
        let req = with_items(serde_json::json!([
            chapter(),
            { "id": "b2", "rowType": "staart_btw", "parentId": null, "total": 90.0, "staartPercentage": 9.0 }
        ]));
        assert!((total_incl_vat(&req) - 1090.0).abs() < 1e-9);
    }

    #[test]
    fn zonder_btw_regels_21_procent() {
        let req = with_items(serde_json::json!([chapter()]));
        assert!((total_incl_vat(&req) - 1210.0).abs() < 1e-9);
    }

    fn btw_regel(row_type: &str, pct: f64, total: f64) -> CostItem {
        serde_json::from_value(serde_json::json!({
            "id": row_type, "rowType": row_type, "description": "", "total": total,
            "staartPercentage": pct, "depth": 0, "parentId": null
        }))
        .expect("CostItem parsen")
    }

    #[test]
    fn btw_volgt_de_staart_en_niet_vast_21_procent() {
        // IVA 16% (Mexico): bedrag én tarief uit de staart.
        let (btw, rate) = vat_summary(&[btw_regel("staart_btw_laag", 9.0, 0.0), btw_regel("staart_btw", 16.0, 160.0)], 1000.0);
        assert_eq!((btw, rate), (160.0, Some(16.0)));
        // Btw-regels op 0 (land zonder btw): geen 21% erbij.
        let (btw, rate) = vat_summary(&[btw_regel("staart_btw", 0.0, 0.0)], 1000.0);
        assert_eq!((btw, rate), (0.0, Some(0.0)));
        // Laag én hoog met een bedrag: geen enkel tarief.
        let (btw, rate) = vat_summary(&[btw_regel("staart_btw_laag", 9.0, 18.0), btw_regel("staart_btw", 21.0, 168.0)], 1000.0);
        assert_eq!((btw, rate), (186.0, None));
        // Oud bestand zonder btw-regels: zoals voorheen 21%.
        assert_eq!(vat_summary(&[], 1000.0), (210.0, Some(21.0)));
    }

    #[test]
    fn btw_zin_toont_het_echte_tarief() {
        let nl_req = request(serde_json::json!({}));
        assert_eq!(vat_note(&nl_req, Some(16.0)), "Dit bedrag is inclusief BTW (16%).");
        assert_eq!(vat_note(&nl_req, Some(5.5)), "Dit bedrag is inclusief BTW (5,5%).");
        assert_eq!(vat_note(&nl_req, None), "Dit bedrag is inclusief BTW.");
        let es = request(serde_json::json!({
            "offerte.inclVatNote": "Este importe incluye el IVA ({{rate}}).",
            "offerte.inclVatNoteMixed": "Este importe incluye el IVA."
        }));
        assert_eq!(vat_note(&es, Some(16.0)), "Este importe incluye el IVA (16%).");
        assert_eq!(vat_note(&es, None), "Este importe incluye el IVA.");
    }
}
