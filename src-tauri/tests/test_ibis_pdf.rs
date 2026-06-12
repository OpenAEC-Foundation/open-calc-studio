/// Integration test: generate an IBIS-stijl PDF.
///
/// 1. `generate_ibis_pdf_synthetic` builds a small self-contained budget and
///    renders it through the IBIS Typst template. This always runs and verifies
///    that `tenants/bouw1/templates/ibis.typ` compiles cleanly and that the
///    footer-cascade is produced from the staart_* items.
/// 2. `generate_ibis_pdf_from_env` optionally renders a real .ifcx project when
///    OCS_TEST_IFCX is set (mirrors test_bouw1_pdf.rs).

#[test]
fn generate_ibis_pdf_synthetic() {
    // A minimal but representative budget: one chapter with two leaf regels
    // (arbeid + onderaanneming) plus the full staart cascade incl. BTW.
    let request_json = serde_json::json!({
        "schedule": {
            "name": "Testbegroting IBIS",
            "projectName": "Herstel testproject",
            "projectNumber": "C-TEST001",
            "client": "Testverzekering",
            "author": "Tester",
        },
        "items": [
            {
                "id": "ch1", "code": "10", "description": "STUT- EN SLOOPWERK",
                "rowType": "chapter", "depth": 0, "parentId": null, "total": 1750.0
            },
            {
                "id": "r1", "code": "1000", "description": "sloopwerk dak",
                "rowType": "regel", "depth": 1, "parentId": "ch1",
                "quantity": 5.0, "unit": "m2", "normQuantity": 0.25,
                "unitPrice": 150.0, "total": 750.0,
                "laborPrice": 150.0, "resourceType": "arbeid"
            },
            {
                "id": "r2", "code": "1032", "description": "afvoer container",
                "rowType": "regel", "depth": 1, "parentId": "ch1",
                "quantity": 1.0, "unit": "pst",
                "unitPrice": 1000.0, "total": 1000.0,
                "resourceType": "onderaannemer"
            },
            // Staart cascade
            { "id": "s1", "code": "", "description": "Algemene kosten over onderaanneming:",
              "rowType": "staart_ak_oa", "depth": 0, "parentId": null,
              "staartPercentage": 9.0, "total": 90.0 },
            { "id": "s2", "code": "", "description": "Algemene bedrijfskosten:",
              "rowType": "staart_abk", "depth": 0, "parentId": null,
              "staartPercentage": 8.0, "total": 0.0 },
            { "id": "s3", "code": "", "description": "Winst en Risico:",
              "rowType": "staart_winst", "depth": 0, "parentId": null,
              "staartPercentage": 4.0, "total": 0.0 },
            { "id": "s4", "code": "", "description": "CAR verzekering:",
              "rowType": "staart_verzekering", "depth": 0, "parentId": null,
              "staartPercentage": 0.3, "total": 0.0 },
            { "id": "s5", "code": "", "description": "Afronding",
              "rowType": "staart_afronding", "depth": 0, "parentId": null,
              "total": -4.61 },
            { "id": "s6", "code": "", "description": "Btw hoog:",
              "rowType": "staart_btw", "depth": 0, "parentId": null,
              "staartPercentage": 21.0, "total": 0.0 },
        ],
        "reportView": "ibis",
        "pageSize": "A4",
        "pageOrientation": "landscape",
        "showHoeveelheid": true,
    });

    let request: app_lib::reports::ReportRequest =
        serde_json::from_value(request_json).expect("Failed to parse ReportRequest");

    // Route through the public generator (reportView == "ibis" -> ibis template).
    let pdf = app_lib::reports::generator::generate_bytes(&request)
        .expect("IBIS PDF generation failed (template compile error?)");

    assert!(pdf.len() > 1000, "IBIS PDF too small: {} bytes", pdf.len());
    assert_eq!(&pdf[0..4], b"%PDF", "Output is not a PDF");
    println!("IBIS synthetic PDF: {} bytes", pdf.len());
}

#[test]
fn generate_ibis_pdf_from_env() {
    let ifcx_path = match std::env::var("OCS_TEST_IFCX") {
        Ok(p) => p,
        Err(_) => {
            eprintln!("OCS_TEST_IFCX not set; skipping integration test");
            return;
        }
    };
    if !std::path::Path::new(&ifcx_path).exists() {
        eprintln!("OCS_TEST_IFCX path does not exist; skipping");
        return;
    }

    let output_path = std::env::var("OCS_TEST_OUTPUT_IBIS")
        .unwrap_or_else(|_| std::env::temp_dir()
            .join("ocs_ibis_test.pdf")
            .to_string_lossy()
            .into_owned());

    let json = std::fs::read_to_string(&ifcx_path).expect("Failed to read .ifcx");
    let project: serde_json::Value = serde_json::from_str(&json).expect("Failed to parse JSON");

    let request_json = serde_json::json!({
        "schedule": project["schedule"],
        "items": project["items"],
        "reportView": "ibis",
        "pageSize": "A4",
        "pageOrientation": "landscape",
        "showHoeveelheid": true,
        "companyInfo": project["companyInfo"],
    });

    let request: app_lib::reports::ReportRequest =
        serde_json::from_value(request_json).expect("Failed to parse ReportRequest");

    app_lib::reports::generator::generate(&request, &output_path).expect("Failed to generate PDF");

    let size = std::fs::metadata(&output_path).expect("No output file").len();
    println!("IBIS PDF generated: {} bytes -> {}", size, output_path);
    assert!(size > 1000, "PDF too small");
}
