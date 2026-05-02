//! WPCalc (.calc) exporter
//!
//! Exports the app's internal data model to a WPCalc-compatible Access MDB file.
//! Strategy:
//! 1. Copy the embedded template MDB to the target path
//! 2. Use PowerShell + ADO to INSERT rows into the MDB tables
//!
//! This avoids native ODBC compile-time dependencies and works reliably on Windows.

use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::process::Command;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCalcExportRequest {
    pub schedule: WpCalcSchedule,
    pub items: Vec<WpCalcCostItem>,
    #[serde(default)]
    pub company_info: Option<WpCalcCompanyInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCalcSchedule {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub project_name: String,
    #[serde(default)]
    pub project_number: String,
    #[serde(default)]
    pub client: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub algemene_kosten: f64,
    #[serde(default)]
    pub winst_risico: f64,
    #[serde(default)]
    pub tarieven: Option<HashMap<String, f64>>,
    #[serde(default)]
    pub staart_rows: Option<Vec<WpCalcStaartRow>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCalcStaartRow {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub percentage: Option<f64>,
    #[serde(default)]
    pub loon: Option<f64>,
    #[serde(default)]
    pub materiaal: Option<f64>,
    #[serde(default)]
    pub materieel: Option<f64>,
    #[serde(default)]
    pub stelpost: Option<f64>,
    #[serde(default)]
    pub onderaanneming: Option<f64>,
    #[serde(default)]
    pub bedrag: Option<f64>,
    #[serde(default)]
    pub subtotaal: Option<f64>,
    #[serde(default)]
    pub totaal: Option<f64>,
    #[serde(default)]
    pub itemtype: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCalcCostItem {
    pub id: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub description: String,
    pub row_type: String,
    #[serde(default)]
    pub quantity: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub unit_price: f64,
    #[serde(default)]
    pub total: f64,
    #[serde(default)]
    pub material_price: Option<f64>,
    #[serde(default)]
    pub labor_price: Option<f64>,
    #[serde(default)]
    pub depth: u32,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub resource_type: Option<String>,
    #[serde(default)]
    pub tarief_groep: Option<String>,
    #[serde(default)]
    pub norm_quantity: Option<f64>,
    #[serde(default)]
    pub norm_unit_price: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpCalcCompanyInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub postal_address: String,
    #[serde(default)]
    pub postal_city: String,
}

/// Find the template file in the Tauri resource directory
fn find_template(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // In development, look relative to src-tauri
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("wpcalc-template.calc");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // In production, look in the resource directory
    use tauri::Manager;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not find resource dir: {}", e))?;
    let prod_path = resource_dir.join("wpcalc-template.calc");
    if prod_path.exists() {
        return Ok(prod_path);
    }

    Err("WPCalc template file not found".to_string())
}

/// Escape a string for use in a SQL string literal (single quotes)
fn sql_escape(s: &str) -> String {
    s.replace('\'', "''")
}

/// Map CostUnit back to WPCalc eenheid format
fn map_unit_to_wpcalc(unit: &str) -> &str {
    match unit {
        "m²" => "m2",
        "m³" => "m3",
        "m" => "m1",
        _ => unit,
    }
}

/// Build the PowerShell script that populates the MDB
fn build_ps_script(
    db_path: &str,
    request: &WpCalcExportRequest,
) -> String {
    let mut lines = Vec::new();

    // Connection setup
    lines.push(format!(
        r#"$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source={};""#,
        db_path.replace('\\', "\\\\")
    ));
    lines.push(r#"$conn = New-Object -ComObject ADODB.Connection"#.to_string());
    lines.push(r#"$conn.Open($connStr)"#.to_string());

    let docnr = 1;

    // ── Insert calculaties ──
    let calc_title = sql_escape(&request.schedule.project_name);
    let calc_nr = sql_escape(&request.schedule.project_number);
    let calculator = sql_escape(&request.schedule.author);
    let client = sql_escape(&request.schedule.client);
    let now = chrono_now_str();

    lines.push(format!(
        r#"$conn.Execute("INSERT INTO calculaties (docnr, projectnr, calculator, calculatietitel, calculatiedatum, offertenr, aangemaakt, gewijzigd, naam, kostprijs, totaalexclbtw, totaalinclbtw, btwhoog, btwcode, btwmethode, maxhfdst, loonkolommen, oakolom, wfa, wfm, wfmta, wfmte, wfoda, wfstp, wfarb, koers, layoutfile) VALUES ({}, 0, '{}', '{}', #{date}#, '{}', #{date}#, #{date}#, '{}', 0, 0, 0, 0.21, 2, 0, 99, True, True, 1, 1, 1, 1, 1, 1, 1, 1, '< Standaard >')")"#,
        docnr,
        calculator,
        calc_title,
        calc_nr,
        client,
        date = now,
    ));

    // ── Insert tarieven ──
    if let Some(ref tarieven) = request.schedule.tarieven {
        let mut ascii_nr = 65i32; // 'A' = 65
        for (groep, tarief) in tarieven {
            lines.push(format!(
                r#"$conn.Execute("INSERT INTO tarieven (docnr, asciinr, tariefgroep, tarief, uurtarief, omschrijving, netto, toeslag, indirect) VALUES ({}, {}, '{}', {}, True, '', 0, 0, False)")"#,
                docnr,
                ascii_nr,
                sql_escape(groep),
                format_f64(*tarief),
            ));
            ascii_nr += 1;
        }
    }

    // ── Build hierarchy: assign groep/paragraaf/volgnr ──
    // We need to assign WPCalc's flat hierarchy (groep, paragraaf, volgnr, rectype)
    // from the app's tree hierarchy (parentId, sortOrder, rowType)
    let items = &request.items;

    // Build parent -> children map
    let mut children_map: HashMap<Option<&str>, Vec<usize>> = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        let parent = item.parent_id.as_deref();
        children_map.entry(parent).or_default().push(i);
    }

    // Sort children by sort_order
    for children in children_map.values_mut() {
        children.sort_by_key(|&i| items[i].sort_order);
    }

    let mut recnr = 1i32;
    let mut groep_counter = 0i16;

    // Process top-level items (chapters and staart items)
    if let Some(top_indices) = children_map.get(&None) {
        for &idx in top_indices {
            let item = &items[idx];

            // Skip staart row types (handled separately)
            if item.row_type.starts_with("staart_") {
                continue;
            }

            if item.row_type == "chapter" {
                groep_counter += 1;
                let groep = groep_counter;

                // Chapter header (rectype=8)
                lines.push(format!(
                    r#"$conn.Execute("INSERT INTO data (recnr, docnr, groep, paragraaf, volgnr, tabs, rectype, omschrijving, code, eenheid, aantal, prijs, kosteneh, norm, tarief, onderaanneming, materieel, stelpost, vastbedrag, tariefgroep, postsoort) VALUES ({}, {}, {}, 0, 0, 0, 8, '{}', '{}', '', 0, 0, 0, 0, 0, False, False, False, False, '', 'N')")"#,
                    recnr,
                    docnr,
                    groep,
                    sql_escape(&item.description),
                    sql_escape(&item.code),
                ));
                recnr += 1;

                // Process children of this chapter
                let mut paragraaf_counter = 0i16;
                let mut volgnr_counter = 0i16;

                if let Some(child_indices) = children_map.get(&Some(item.id.as_str())) {
                    for &child_idx in child_indices {
                        let child = &items[child_idx];

                        if child.row_type == "begrotingspost" || child.row_type == "bewakingspost" {
                            // Subheader (rectype=4) or treated as regular post with children
                            paragraaf_counter += 1;
                            let paragraaf = paragraaf_counter;
                            volgnr_counter = 0;

                            // Insert as rectype 4 (subheader)
                            lines.push(format!(
                                r#"$conn.Execute("INSERT INTO data (recnr, docnr, groep, paragraaf, volgnr, tabs, rectype, omschrijving, code, eenheid, aantal, prijs, kosteneh, norm, tarief, onderaanneming, materieel, stelpost, vastbedrag, tariefgroep, postsoort) VALUES ({}, {}, {}, {}, 0, 0, 4, '{}', '{}', '', 0, 0, 0, 0, 0, False, False, False, False, '', 'N')")"#,
                                recnr,
                                docnr,
                                groep,
                                paragraaf,
                                sql_escape(&child.description),
                                sql_escape(&child.code),
                            ));
                            recnr += 1;

                            // Process children of this subheader (regels)
                            if let Some(regel_indices) = children_map.get(&Some(child.id.as_str())) {
                                for &regel_idx in regel_indices {
                                    let regel = &items[regel_idx];
                                    volgnr_counter += 1;

                                    recnr = emit_data_row(
                                        &mut lines,
                                        regel,
                                        recnr,
                                        docnr,
                                        groep,
                                        paragraaf,
                                        volgnr_counter,
                                        &request.schedule,
                                    );
                                }
                            }
                        } else if child.row_type == "regel" {
                            // Direct regel under chapter (paragraaf = 0)
                            volgnr_counter += 1;
                            recnr = emit_data_row(
                                &mut lines,
                                child,
                                recnr,
                                docnr,
                                groep,
                                0,
                                volgnr_counter,
                                &request.schedule,
                            );
                        } else if child.row_type == "tekstregel" || child.row_type == "witregel" {
                            volgnr_counter += 1;
                            // Text row (rectype=5)
                            lines.push(format!(
                                r#"$conn.Execute("INSERT INTO data (recnr, docnr, groep, paragraaf, volgnr, tabs, rectype, omschrijving, code, eenheid, aantal, prijs, kosteneh, norm, tarief, onderaanneming, materieel, stelpost, vastbedrag, tariefgroep, postsoort) VALUES ({}, {}, {}, 0, {}, {}, 5, '{}', '', '', 0, 0, 0, 0, 0, False, False, False, False, '', 'N')")"#,
                                recnr,
                                docnr,
                                groep,
                                volgnr_counter,
                                child.depth,
                                sql_escape(&child.description),
                            ));
                            recnr += 1;
                        }
                    }
                }

                // Chapter footer (rectype=16)
                lines.push(format!(
                    r#"$conn.Execute("INSERT INTO data (recnr, docnr, groep, paragraaf, volgnr, tabs, rectype, omschrijving, code, eenheid, aantal, prijs, kosteneh, norm, tarief, onderaanneming, materieel, stelpost, vastbedrag, tariefgroep, postsoort) VALUES ({}, {}, {}, 9999, 0, 0, 16, '', '', '', 0, 0, 0, 0, 0, False, False, False, False, '', 'N')")"#,
                    recnr,
                    docnr,
                    groep,
                ));
                recnr += 1;
            }
        }
    }

    // ── Insert staart rows ──
    // If schedule has explicit staartRows (from WpCalc import), use those.
    // Otherwise, build staart from staart_* items in the items array.
    let staart_rows: Vec<WpCalcStaartRow> = if let Some(ref rows) = request.schedule.staart_rows {
        rows.clone()
    } else {
        // Build standard staart from staart_* items
        let mut rows = Vec::new();
        // Collect staart items in order
        let staart_mapping: &[(&str, &str, i32)] = &[
            ("staart_ak_oa", "Algemene kosten over onderaanneming:", 1),
            ("staart_abk", "Algemene bedrijfskosten:", 1),
            ("staart_garanties", "Garanties:", 1),
            ("staart_wvpm", "Werkvoorbereiding & projectmanagement", 1),
            ("staart_risico", "Risico:", 2),
            ("staart_winst", "Winst:", 2),
            ("staart_verzekering", "Verzekering:", 2),
            ("staart_btw", "Btw hoog:", 64),
            ("staart_afronding", "Afronding", 128),
            // Legacy types
            ("staart_ukk", "Uitvoeringskosten:", 1),
            ("staart_ak", "Algemene kosten:", 2),
            ("staart_wr", "Winst & risico:", 2),
        ];

        // First add "Totaal kolommen:" header row
        let kostprijs: f64 = items.iter()
            .filter(|i| i.parent_id.is_none() && !i.row_type.starts_with("staart_"))
            .map(|i| i.total)
            .sum();

        rows.push(WpCalcStaartRow {
            label: "Totaal kolommen:".into(),
            percentage: None, loon: None, materiaal: None, materieel: None,
            stelpost: None, onderaanneming: None, bedrag: Some(0.0),
            subtotaal: None, totaal: None, itemtype: 32,
        });

        for (rt, label, itemtype) in staart_mapping {
            if let Some(item) = items.iter().find(|i| i.row_type == *rt) {
                let pct = if let Some(q) = item.quantity { Some(q) } else { None };
                rows.push(WpCalcStaartRow {
                    label: label.to_string(),
                    percentage: pct,
                    loon: None, materiaal: None, materieel: None,
                    stelpost: None, onderaanneming: None,
                    bedrag: Some(kostprijs),
                    subtotaal: None, totaal: Some(item.total),
                    itemtype: *itemtype,
                });
            }
        }

        // Add "Totaal kostprijs:" row
        rows.push(WpCalcStaartRow {
            label: "Totaal kostprijs:".into(),
            percentage: None, loon: None, materiaal: None, materieel: None,
            stelpost: None, onderaanneming: None, bedrag: Some(0.0),
            subtotaal: None, totaal: None, itemtype: 4,
        });

        // Add "Totaal excl. btw.:" and "Totaalprijs incl. btw.:" rows
        rows.push(WpCalcStaartRow {
            label: "Totaal excl. btw.:".into(),
            percentage: None, loon: None, materiaal: None, materieel: None,
            stelpost: None, onderaanneming: None, bedrag: None,
            subtotaal: None, totaal: None, itemtype: 4,
        });
        rows.push(WpCalcStaartRow {
            label: "Totaalprijs incl. btw.:".into(),
            percentage: None, loon: None, materiaal: None, materieel: None,
            stelpost: None, onderaanneming: None, bedrag: None,
            subtotaal: None, totaal: None, itemtype: 4,
        });

        rows
    };

    {
        let mut staart_recnr = recnr;
        for (i, row) in staart_rows.iter().enumerate() {
            let volgnr = (i + 1) as i32;
            let pct = row.percentage.map(|p| p / 100.0).unwrap_or(0.0); // Convert from % to fraction
            let loon = row.loon.unwrap_or(0.0);
            let materiaal = row.materiaal.unwrap_or(0.0);
            let materieel = row.materieel.unwrap_or(0.0);
            let stelpost = row.stelpost.unwrap_or(0.0);
            let oa = row.onderaanneming.unwrap_or(0.0);
            let bedrag = row.bedrag.unwrap_or(0.0);
            let subtotaal = row.subtotaal.unwrap_or(0.0);
            let totaal = row.totaal.unwrap_or(0.0);

            lines.push(format!(
                r#"$conn.Execute("INSERT INTO staart (recnr, docnr, volgnr, itemtype, omschrijving, percentage, loon, materiaal, materieel, stelpost, onderaanneming, bedrag, subtotaal, totaal, fontstyle) VALUES ({}, {}, {}, {}, '{}', {}, {}, {}, {}, {}, {}, {}, {}, {}, 0)")"#,
                staart_recnr,
                docnr,
                volgnr,
                row.itemtype,
                sql_escape(&row.label),
                format_f64(pct),
                format_f64(loon),
                format_f64(materiaal),
                format_f64(materieel),
                format_f64(stelpost),
                format_f64(oa),
                format_f64(bedrag),
                format_f64(subtotaal),
                format_f64(totaal),
            ));
            staart_recnr += 1;
        }
    }

    // Close connection
    lines.push(r#"$conn.Close()"#.to_string());
    lines.push(r#"Write-Output "OK""#.to_string());

    lines.join("\n")
}

/// Emit a single data row (rectype=0) INSERT statement
fn emit_data_row(
    lines: &mut Vec<String>,
    item: &WpCalcCostItem,
    recnr: i32,
    docnr: i32,
    groep: i16,
    paragraaf: i16,
    volgnr: i16,
    schedule: &WpCalcSchedule,
) -> i32 {
    let rectype = if item.row_type == "tekstregel" || item.row_type == "witregel" {
        5
    } else {
        0
    };

    let qty = item.quantity.unwrap_or(0.0);
    let material_price = item.material_price.unwrap_or(0.0);
    let norm = item.norm_quantity.unwrap_or(0.0);
    let unit = item.unit.as_deref().unwrap_or("st");
    let eenheid = map_unit_to_wpcalc(unit);

    // Determine tarief from tariefgroep
    let tarief_groep = item.tarief_groep.as_deref().unwrap_or("A");
    let tarief = schedule
        .tarieven
        .as_ref()
        .and_then(|t| t.get(tarief_groep))
        .copied()
        .unwrap_or(0.0);

    // kosteneh = prijs + (norm * tarief)
    let loon_per_eh = norm * tarief;
    let kosteneh = material_price + loon_per_eh;

    // Boolean flags from resource_type
    let is_oa = item.resource_type.as_deref() == Some("onderaannemer");
    let is_materieel = item.resource_type.as_deref() == Some("materieel");
    let is_stelpost = item.resource_type.as_deref() == Some("overig");

    lines.push(format!(
        r#"$conn.Execute("INSERT INTO data (recnr, docnr, groep, paragraaf, volgnr, tabs, rectype, omschrijving, code, eenheid, aantal, prijs, kosteneh, norm, tarief, onderaanneming, materieel, stelpost, vastbedrag, tariefgroep, postsoort) VALUES ({}, {}, {}, {}, {}, {}, {}, '{}', '{}', '{}', {}, {}, {}, {}, {}, {}, {}, {}, False, '{}', 'N')")"#,
        recnr,
        docnr,
        groep,
        paragraaf,
        volgnr,
        item.depth,
        rectype,
        sql_escape(&item.description),
        sql_escape(&item.code),
        eenheid,
        format_f64(qty),
        format_f64(material_price),
        format_f64(kosteneh),
        format_f64(norm),
        format_f64(tarief),
        if is_oa { "True" } else { "False" },
        if is_materieel { "True" } else { "False" },
        if is_stelpost { "True" } else { "False" },
        tarief_groep,
    ));

    recnr + 1
}

/// Format f64 for SQL (use dot as decimal separator, avoid scientific notation)
fn format_f64(v: f64) -> String {
    if v == 0.0 {
        "0".to_string()
    } else {
        format!("{:.6}", v)
    }
}

/// Get current date/time as Access date literal (MM/DD/YYYY)
fn chrono_now_str() -> String {
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Simple conversion: days since epoch + 1970 offset
    let days = secs / 86400;
    let years = 1970 + days / 365;
    let remaining_days = days % 365;
    let month = remaining_days / 30 + 1;
    let day = remaining_days % 30 + 1;
    format!("{:02}/{:02}/{}", month.min(12), day.min(28), years)
}

/// Execute the export
#[tauri::command]
pub fn export_wpcalc(
    app: tauri::AppHandle,
    request: WpCalcExportRequest,
    output_path: String,
) -> Result<(), String> {
    // 1. Find and copy template
    let template = find_template(&app)?;
    fs::copy(&template, &output_path).map_err(|e| {
        format!(
            "Failed to copy template from {:?} to {}: {}",
            template, output_path, e
        )
    })?;

    // 2. Build PowerShell script
    let ps_script = build_ps_script(&output_path, &request);

    // 3. Execute via PowerShell
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps_script,
        ])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "PowerShell export failed:\nstderr: {}\nstdout: {}",
            stderr, stdout
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.contains("OK") {
        return Err(format!("Export may have failed. Output: {}", stdout));
    }

    Ok(())
}
