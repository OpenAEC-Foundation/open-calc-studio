//! Report fonts, compiled into the app (issue #99).
//!
//! Every PDF report used to read its fonts from `C:/Windows/Fonts`. On macOS
//! and Linux nothing was found, and both PDF engines then write the page
//! without any text: lines and table rules only. The reports now always use
//! Liberation Sans (SIL OFL 1.1, see `LICENSE-Liberation` next to the font
//! files). It has the same character widths as Arial, so the Typst layouts
//! that were designed for Arial keep their column widths and line breaks.

use openaec_layout::SharedFontRegistry;

macro_rules! liberation {
    ($file:literal) => {
        include_bytes!(concat!(
            "../../../libs/openaec-reports/src/openaec_reports/assets/fonts/",
            $file
        ))
    };
}

static REGULAR: &[u8] = liberation!("LiberationSans-Regular.ttf");
static BOLD: &[u8] = liberation!("LiberationSans-Bold.ttf");
static ITALIC: &[u8] = liberation!("LiberationSans-Italic.ttf");
static BOLD_ITALIC: &[u8] = liberation!("LiberationSans-BoldItalic.ttf");

/// The font files for the Typst engine (Bouw 1, IBIS-stijl, directiebegroting).
pub(crate) fn typst_fonts() -> [&'static [u8]; 4] {
    [REGULAR, BOLD, ITALIC, BOLD_ITALIC]
}

/// Font names in the openaec-layout registry, with their aliases. The reports
/// and openaec-layout's default styles ask for "LiberationSans" and
/// "LiberationSans-Bold" etc. Same order as `typst_fonts()`.
const LAYOUT_NAMES: [(&str, &[&str]); 4] = [
    ("LiberationSans-Regular", &["LiberationSans"]),
    ("LiberationSans-Bold", &[]),
    ("LiberationSans-Italic", &[]),
    ("LiberationSans-BoldItalic", &[]),
];

/// Register the built-in fonts in an openaec-layout font registry.
pub(crate) fn register_layout_fonts(fonts: &SharedFontRegistry) -> Result<(), String> {
    let mut reg = fonts.lock().map_err(|_| "font registry lock poisoned".to_string())?;
    for ((name, aliases), data) in LAYOUT_NAMES.iter().zip(typst_fonts()) {
        reg.register_ttf_bytes(name, data.to_vec())
            .map_err(|e| format!("report font {name} could not be loaded: {e}"))?;
        for alias in *aliases {
            reg.register_alias(alias, name);
        }
    }
    Ok(())
}

/// Typst only warns when a template asks for a font family that is not built
/// in, and then silently uses another font (or, with no fonts at all, leaves
/// the text out). Treat that as an error, so a template typo is caught by the
/// tests instead of changing the look of a report. Pass the messages of
/// `compiled.warnings`.
pub(crate) fn reject_missing_fonts<'a>(
    warnings: impl IntoIterator<Item = &'a str>,
) -> Result<(), String> {
    let missing: Vec<&str> = warnings
        .into_iter()
        .filter(|message| message.contains("unknown font family"))
        .collect();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!("report fonts missing: {}", missing.join("; ")))
    }
}

/// Number of text-drawing operations in a PDF. A report rendered without
/// fonts still has its lines, but no text operations at all.
#[cfg(test)]
pub(crate) fn text_operations(pdf: &[u8]) -> usize {
    let doc = lopdf::Document::load_mem(pdf).expect("parse PDF");
    doc.get_pages()
        .values()
        .map(|&page| {
            doc.get_and_decode_page_content(page)
                .expect("decode page content")
                .operations
                .iter()
                .filter(|op| matches!(op.operator.as_str(), "Tj" | "TJ" | "'" | "\""))
                .count()
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reports::{generator, ReportRequest};
    use openaec_layout::shared_font_registry;

    fn request(view: &str) -> ReportRequest {
        serde_json::from_value(serde_json::json!({
            "schedule": { "name": "Test", "projectName": "Testproject" },
            "items": [
                { "id": "ch1", "code": "1", "description": "GRONDWERK", "rowType": "chapter",
                  "depth": 0, "parentId": null, "total": 800.0 },
                { "id": "r1", "code": "100010", "description": "graven", "rowType": "regel",
                  "depth": 1, "parentId": "ch1", "quantity": 10.0, "unit": "uur",
                  "unitPrice": 80.0, "total": 800.0, "resourceType": "arbeid" },
                { "id": "s1", "code": "", "description": "Btw hoog:", "rowType": "staart_btw",
                  "depth": 0, "parentId": null, "staartPercentage": 21.0, "total": 168.0 }
            ],
            "reportView": view,
            "pageSize": "A4",
            "pageOrientation": "landscape",
            "showHoeveelheid": true,
        }))
        .expect("parse ReportRequest")
    }

    /// Issue #99: on a Mac every report came out with lines only. The fonts
    /// are now built in, so this test runs the same way on every OS.
    #[test]
    fn every_report_view_contains_text() {
        for view in ["bouw1", "ibis", "werkbeschrijving", "hoofdaanneming", "onderaanneming", "inschrijfstaat", "nacalculatie"] {
            let pdf = generator::generate_bytes(&request(view))
                .unwrap_or_else(|e| panic!("{view}: {e}"));
            assert!(text_operations(&pdf) > 5, "{view}: PDF has no text");
        }
        // The directiebegroting runs through the IBIS template in the app.
        let pdf = crate::reports::ibis::generate_ibis_typst(&request("directie")).expect("directie");
        assert!(text_operations(&pdf) > 5, "directie: PDF has no text");
    }

    #[test]
    fn missing_typst_font_is_an_error() {
        assert!(reject_missing_fonts(["some other warning"]).is_ok());
        // Compile for real, so a change in Typst's wording is noticed.
        let engine = typst_as_lib::TypstEngine::builder()
            .main_file("#set text(font: \"Nope\")
Hallo")
            .fonts(typst_fonts())
            .build();
        let compiled = engine.compile();
        let messages: Vec<String> = compiled.warnings.iter().map(|w| w.message.to_string()).collect();
        let doc = compiled.output.expect("compiles");
        typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default()).expect("PDF");
        assert!(reject_missing_fonts(messages.iter().map(String::as_str)).is_err(), "{messages:?}");
    }

    /// The reports must not depend on fonts installed on the computer.
    #[test]
    fn reports_do_not_read_system_fonts() {
        for (file, source) in [
            ("bouw1.rs", include_str!("bouw1.rs")),
            ("ibis.rs", include_str!("ibis.rs")),
            ("generator.rs", include_str!("generator.rs")),
            ("offerte.rs", include_str!("offerte.rs")),
        ] {
            for needle in ["Windows/Fonts", "search_fonts_with", "register_ttf("] {
                assert!(!source.contains(needle), "{file} uses {needle}");
            }
        }
    }

    /// The names generator.rs, offerte.rs and openaec-layout's defaults use.
    #[test]
    fn every_layout_font_name_resolves() {
        let fonts = shared_font_registry();
        register_layout_fonts(&fonts).unwrap();
        let reg = fonts.lock().unwrap();
        for name in ["LiberationSans", "LiberationSans-Regular", "LiberationSans-Bold", "LiberationSans-Italic", "LiberationSans-BoldItalic"] {
            assert!(reg.get(name).is_some(), "{name} not registered");
        }
    }
}
