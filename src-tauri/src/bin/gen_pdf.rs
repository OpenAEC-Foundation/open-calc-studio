//! Bouw 1 begroting PDF — single continuous table with chapter headers inline
//!
//! Usage: gen_pdf <input.ifcx> <output.pdf>
use openaec_core::schema::*;
use openaec_core::tenant::TenantConfig;
use openaec_core::brand::BrandLoader;
use std::path::Path;

fn main() {
    let ifcx = std::env::args().nth(1).expect("usage: gen_pdf <input.ifcx> <output.pdf>");
    let out = std::env::args().nth(2).expect("usage: gen_pdf <input.ifcx> <output.pdf>");

    // Rapportweergave: '--report-view <view>' of env OCS_REPORT_VIEW.
    // Alles behalve bouw1 rendert via de generator (besteksopmaak e.d.) —
    // voorheen werd het argument genegeerd en kwam er altijd bouw1 uit.
    let argv: Vec<String> = std::env::args().collect();
    let view = argv
        .iter()
        .position(|a| a == "--report-view")
        .and_then(|i| argv.get(i + 1).cloned())
        .or_else(|| std::env::var("OCS_REPORT_VIEW").ok())
        .unwrap_or_else(|| "bouw1".to_string());
    if view != "bouw1" {
        let json = std::fs::read_to_string(&ifcx).expect("read .ifcx");
        let proj: serde_json::Value = serde_json::from_str(&json).expect("parse");
        let request_json = serde_json::json!({
            "schedule": proj["schedule"],
            "items": proj["items"],
            "reportView": view,
            "pageSize": "A4",
            "pageOrientation": "portrait",
            "showHoeveelheid": true,
            "companyInfo": proj["companyInfo"],
        });
        let request: app_lib::reports::ReportRequest =
            serde_json::from_value(request_json).expect("ReportRequest parsen");
        app_lib::reports::generator::generate(&request, &out).expect("PDF-generatie mislukt");
        println!("PDF ({view}) geschreven naar {out}");
        return;
    }

    let json = std::fs::read_to_string(&ifcx).expect("read .ifcx");
    let proj: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let items: Vec<serde_json::Value> = proj["items"].as_array().unwrap().clone();
    let sched = &proj["schedule"];

    let hdr: Vec<String> = ["Hst","Par","Nr","Omschrijving","Bereken","Aantal","Eh.","Prijs","Norm","Uren","Tar.","Loon","Materiaal","Materieel","Stelpost","Ond.aann.","Kosten/eh","Subtotaal","Totaal","Memo"]
        .iter().map(|x| x.to_string()).collect();
    let cw: Vec<f64> = vec![6.0,6.0,6.0,50.0,12.0,10.0,8.0,14.0,10.0,10.0,7.0,14.0,14.0,14.0,14.0,14.0,14.0,16.0,16.0,12.0];

    // Build ONE continuous table with all items
    let mut all_rows: Vec<Vec<serde_json::Value>> = Vec::new();
    let mut cur_ch_nr = String::new();
    let mut cur_par_nr = String::new();
    let mut ch_count = 0;

    for item in &items {
        let rt = item["rowType"].as_str().unwrap_or("");
        if rt.starts_with("staart_") || rt == "witregel" { continue; }
        let d = item["depth"].as_u64().unwrap_or(0);
        let desc = item["description"].as_str().unwrap_or("");
        let nr = item["nr"].as_str().unwrap_or("");

        if rt == "chapter" && d == 0 {
            // Chapter header row — bold, spans full width conceptually
            ch_count += 1;
            let ch_nr = format!("{:02}", ch_count);
            cur_ch_nr = ch_nr.clone();
            cur_par_nr = String::new();

            // Empty row before chapter (except first)
            if all_rows.len() > 0 {
                all_rows.push(vec![jv(""); 20]);
            }

            // Chapter title row
            let mut row = vec![jv(""); 20];
            row[0] = jv(&ch_nr);
            row[3] = jv(&format!("{:02}. {}", ch_count, desc.to_uppercase()));
            all_rows.push(row);
        } else if rt == "chapter" && d == 1 {
            // Sub-chapter (paragraph)
            cur_par_nr = nr.to_string();
        } else if rt == "begrotingspost" || rt == "bewakingspost" {
            // Begrotingspost row
            let qty = item["quantity"].as_f64().unwrap_or(0.0);
            let tot = item["total"].as_f64().unwrap_or(0.0);
            let u = item["unit"].as_str().unwrap_or("");
            let loon = item["loon"].as_f64().unwrap_or(0.0);
            let mat = item["matBedrag"].as_f64().unwrap_or(0.0);
            let meel = item["matrlBedrag"].as_f64().unwrap_or(0.0);
            let stel = item["stelBedrag"].as_f64().unwrap_or(0.0);
            let oa = item["oaBedrag"].as_f64().unwrap_or(0.0);
            let uren = item["uren"].as_f64().unwrap_or(0.0);
            let norm = item["normQuantity"].as_f64().unwrap_or(0.0);
            let mp = item["materialPrice"].as_f64().unwrap_or(0.0);
            let tg = item["tariefGroep"].as_str().unwrap_or("");
            let keh = if qty > 0.0 { tot / qty } else { 0.0 };

            let par = if nr.contains('.') { nr.split('.').nth(1).unwrap_or("") } else { nr };

            all_rows.push(vec![
                jv(&cur_ch_nr), jv(par), jv(nr), jv(desc),
                jv(""), jn2(qty), jv(u), jn(mp),
                jn3(norm), jn2(uren), jv(tg),
                jn(loon), jn(mat), jn(meel), jn(stel), jn(oa),
                jn(keh), jn(tot), jn(tot), jv(""),
            ]);
        } else if rt == "regel" {
            // Detail regel — indented description
            let qty = item["quantity"].as_f64().unwrap_or(0.0);
            let tot = item["total"].as_f64().unwrap_or(0.0);
            let u = item["unit"].as_str().unwrap_or("");
            let loon = item["loon"].as_f64().unwrap_or(0.0);
            let mat = item["matBedrag"].as_f64().unwrap_or(0.0);
            let meel = item["matrlBedrag"].as_f64().unwrap_or(0.0);
            let stel = item["stelBedrag"].as_f64().unwrap_or(0.0);
            let oa = item["oaBedrag"].as_f64().unwrap_or(0.0);
            let uren = item["uren"].as_f64().unwrap_or(0.0);
            let norm = item["normQuantity"].as_f64().unwrap_or(0.0);
            let mp = item["materialPrice"].as_f64().unwrap_or(0.0);
            let tg = item["tariefGroep"].as_str().unwrap_or("");
            let keh = if qty > 0.0 { tot / qty } else { 0.0 };

            all_rows.push(vec![
                jv(""), jv(""), jv(""), jv(&format!("  {}", desc)),
                jv(""), jn2(qty), jv(u), jn(mp),
                jn3(norm), jn2(uren), jv(tg),
                jn(loon), jn(mat), jn(meel), jn(stel), jn(oa),
                jn(keh), jn(tot), jn(tot), jv(""),
            ]);
        }
    }

    // Grand total row
    let bt = &sched["breakdownTotals"];
    let mut grand = vec![jv(""); 20];
    grand[11] = jn(fv(bt, "loon"));
    grand[12] = jn(fv(bt, "materiaal"));
    grand[13] = jn(fv(bt, "materieel"));
    grand[14] = jn(fv(bt, "stelpost"));
    grand[15] = jn(fv(bt, "onderaanneming"));
    grand[17] = jn(fv(&sched, "totaalKolommen"));
    grand[18] = jn(fv(&sched, "totaalKolommen"));
    all_rows.push(vec![jv(""); 20]); // empty row before total
    all_rows.push(grand);

    // Main begroting section — one single table
    let main_section = Section {
        title: "Begroting".into(),
        level: 1,
        content: vec![ContentBlock::Table(TableBlock {
            title: None,
            headers: hdr,
            rows: all_rows,
            column_widths: Some(cw),
            style: TableStyle::Default,
        })],
        orientation: Some(Orientation::Landscape),
        page_break_before: false,
    };

    // TOTALEN section (staartkosten)
    let totalen = build_totalen_section(sched);

    let report = ReportData {
        template: "begroting".into(),
        project: s(sched, "name"),
        tenant: Some("bouw1".into()),
        format: PaperFormat::A4,
        orientation: Orientation::Landscape,
        project_number: Some(s(sched, "projectNumber")),
        client: Some(s(sched, "client")),
        author: s(sched, "author"),
        date: Some("27-05-2024".into()),
        version: "1.0".into(),
        status: ReportStatus::Concept,
        cover: None,
        colofon: None,
        toc: None,
        sections: vec![main_section, totalen],
        backcover: None,
        metadata: Default::default(),
    };

    let tenant_path = option_env!("CARGO_MANIFEST_DIR")
        .map(|d| Path::new(d).join("..").join("tenants").join("bouw1"))
        .unwrap_or_else(|| Path::new("tenants/bouw1").to_path_buf());
    let tenant_path = tenant_path.as_path();
    let tenant = TenantConfig::new(Some(tenant_path), None);
    let loader = BrandLoader::new(tenant.clone());
    let brand = loader.load_default().unwrap_or_else(|e| {
        eprintln!("Brand load failed: {}, using default", e);
        openaec_core::engine::default_brand()
    });

    let pdf = openaec_core::engine::generate_pdf_with_config(&report, &tenant, &brand, Path::new(&out))
        .expect("PDF generation failed");
    eprintln!("Generated: {} bytes → {}", pdf.len(), out);
}

fn build_totalen_section(sched: &serde_json::Value) -> Section {
    let bt = &sched["breakdownTotals"];
    let st = &sched["staartBerekend"];

    let sh: Vec<String> = ["Omschrijving","%","Loon","Materiaal","Materieel","Stelpost","Ond.Aann.","Bedrag","Post","Totaal"]
        .iter().map(|x| x.to_string()).collect();
    let sw: Vec<f64> = vec![60.0,12.0,22.0,22.0,22.0,22.0,22.0,22.0,22.0,22.0];

    let tl = fv(bt,"loon"); let tm = fv(bt,"materiaal"); let tme = fv(bt,"materieel");
    let ts = fv(bt,"stelpost"); let toa = fv(bt,"onderaanneming");
    let kp = fv(st,"kostprijs");

    let rows = vec![
        vec![jv("Totaal kolommen:"),jv(""),jn(tl),jn(tm),jn(tme),jn(ts),jn(toa),jv(""),jn(0.0),jn(kp)],
        vec![jv("Algemene kosten over onderaanneming:"),jv("10 %"),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"akOndBedrag")),jv(""),jv(""),jv("")],
        vec![jv("Algemene bedrijfskosten:"),jv("9 %"),jn(tl*0.09),jn(tm*0.09),jn(tme*0.09),jv(""),jv(""),jn(fv(st,"akBedrag")),jv(""),jv("")],
        vec![jv("Garanties:"),jv("2 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"garBedrag")),jv(""),jv("")],
        vec![jv("Werkvoorbereiding & projectmanagement"),jv("2 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"wvBedrag")),jv(""),jv("")],
        vec![jv("Totaal kostprijs:"),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalKostprijs"))],
        vec![jv("Risico:"),jv("5 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalKostprijs")),jn(fv(st,"risicoBedrag")),jv("")],
        vec![jv("Winst:"),jv("7 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalKostprijs")),jn(fv(st,"winstBedrag")),jv("")],
        vec![jv("Verzekering:"),jv("1 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalKostprijs")),jn(fv(st,"verzBedrag")),jv("")],
        vec![jv("Totaal excl. btw.:"),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalExclBtw"))],
        vec![jv("Btw hoog:"),jv("21 %"),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalExclBtw")),jn(fv(st,"btwBedrag")),jv("")],
        vec![jv("Totaalprijs incl. btw.:"),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jv(""),jn(fv(st,"totaalInclBtw"))],
    ];

    Section {
        title: "TOTALEN".into(),
        level: 1,
        content: vec![ContentBlock::Table(TableBlock {
            title: None, headers: sh, rows, column_widths: Some(sw), style: TableStyle::Default,
        })],
        orientation: Some(Orientation::Landscape),
        page_break_before: true,
    }
}

fn s(v: &serde_json::Value, k: &str) -> String { v[k].as_str().unwrap_or("").into() }
fn fv(v: &serde_json::Value, k: &str) -> f64 { v[k].as_f64().unwrap_or(0.0) }
fn jv(s: &str) -> serde_json::Value { serde_json::Value::String(s.into()) }
fn jn(v: f64) -> serde_json::Value {
    if v == 0.0 { return jv(""); }
    let a = v.abs();
    let w = a as u64;
    let c = ((a - w as f64) * 100.0).round() as u64;
    let s = w.to_string();
    let mut r = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 { r.push(' '); }
        r.push(ch);
    }
    let ws: String = r.chars().rev().collect();
    let formatted = if v < 0.0 { format!("-{},{:02}", ws, c) } else { format!("{},{:02}", ws, c) };
    jv(&formatted)
}
fn jn2(v: f64) -> serde_json::Value {
    if v == 0.0 { return jv(""); }
    let a = v.abs();
    let w = a as u64;
    let frac = a - w as f64;
    if frac < 0.005 {
        // Integer display
        let s = w.to_string();
        let mut r = String::new();
        for (i, ch) in s.chars().rev().enumerate() {
            if i > 0 && i % 3 == 0 { r.push(' '); }
            r.push(ch);
        }
        let ws: String = r.chars().rev().collect();
        if v < 0.0 { jv(&format!("-{}", ws)) } else { jv(&ws) }
    } else {
        jn(v)
    }
}
fn jn3(v: f64) -> serde_json::Value {
    if v == 0.0 { return jv(""); }
    jv(&format!("{:.3}", v).replace('.', ","))
}
