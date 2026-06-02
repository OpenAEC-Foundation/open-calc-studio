/// Integration test: generate Bouw 1 PDF from a sample .ifcx data file.
///
/// This test reads a project file from the path specified by the
/// `OCS_TEST_IFCX` environment variable. If the variable is not set or the
/// file does not exist, the test silently passes (so it does not break CI).
///
/// To run locally with your own data:
///   set OCS_TEST_IFCX=C:\path\to\your\project.ifcx
///   set OCS_TEST_OUTPUT=C:\path\to\output.pdf
///   cargo test -p app --test test_bouw1_pdf -- --nocapture

#[test]
fn generate_bouw1_pdf_from_env() {
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

    let output_path = std::env::var("OCS_TEST_OUTPUT")
        .unwrap_or_else(|_| std::env::temp_dir()
            .join("ocs_bouw1_test.pdf")
            .to_string_lossy()
            .into_owned());

    // Read the .ifcx project file
    let json = std::fs::read_to_string(&ifcx_path).expect("Failed to read .ifcx");
    let project: serde_json::Value = serde_json::from_str(&json).expect("Failed to parse JSON");

    // Build ReportRequest from project data
    let request_json = serde_json::json!({
        "schedule": project["schedule"],
        "items": project["items"],
        "reportView": "bouw1",
        "pageSize": "A4",
        "pageOrientation": "landscape",
        "showHoeveelheid": true,
        "companyInfo": project["companyInfo"],
    });

    let request: app_lib::reports::ReportRequest = serde_json::from_value(request_json).expect("Failed to parse ReportRequest");

    // Generate PDF
    app_lib::reports::generator::generate(&request, &output_path).expect("Failed to generate PDF");

    let size = std::fs::metadata(&output_path).expect("No output file").len();
    println!("PDF generated: {} bytes ({:.1} KB)", size, size as f64 / 1024.0);
    println!("Output: {}", output_path);
    assert!(size > 1000, "PDF too small");
}
