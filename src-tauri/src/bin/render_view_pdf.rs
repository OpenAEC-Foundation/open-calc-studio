//! Dev-tool: rendert een generieke rapportview (werkbeschrijving,
//! hoofdaanneming, …) naar PDF — zonder de app te starten. Handig om de
//! rapportopmaak headless te verifiëren.
//!
//! Gebruik:
//!   render_view_pdf <view> <output.pdf> [project.ifcx]
//!
//! Zonder projectbestand wordt een ingebouwde voorbeeldbegroting gebruikt
//! (saneringsbestek-structuur: hoofdstuk → paragraaf → posten + opmerking).

fn sample_request(view: &str) -> serde_json::Value {
    serde_json::json!({
        "schedule": {
            "name": "Sanering fabrieksterrein",
            "projectName": "Sanering fabrieksterrein",
            "projectNumber": "2026-042",
            "client": "Gemeente Voorbeeld",
            "author": "OCS",
            "description": "Directiebegroting sanering",
            "status": "DRAFT",
            "algemeneKosten": 9.0,
            "winstRisico": 5.0
        },
        "items": [
            { "id": "h1",  "code": "1",      "description": "VOORBEREIDENDE WERKZAAMHEDEN", "rowType": "chapter", "depth": 0, "parentId": null, "total": 5468.04, "unitPrice": 0.0 },
            { "id": "h10", "code": "10",     "description": "ONDERZOEK", "rowType": "chapter", "depth": 1, "parentId": "h1", "total": 3720.0, "unitPrice": 0.0 },
            { "id": "p100","code": "100",    "description": "VERRICHTEN VAN BODEMONDERZOEK", "rowType": "chapter", "depth": 2, "parentId": "h10", "total": 3720.0, "unitPrice": 0.0 },
            { "id": "a1",  "code": "100010", "description": "Uitvoeren verkennend/nulwaarde onderzoek NEN 5740", "rowType": "begrotingspost", "depth": 3, "parentId": "p100", "quantity": 1.0, "unit": "keer", "unitPrice": 1920.0, "total": 1920.0, "verrekenbaar": "N" },
            { "id": "o1",  "code": "opm",    "description": "Als grondslag voor beoordeling veroorzaakte verontreiniging bij beeindiging activiteit", "rowType": "tekstregel", "depth": 4, "parentId": "a1", "total": 0.0, "unitPrice": 0.0 },
            { "id": "a2",  "code": "100020", "description": "Verrichten van indicatieve partijkeuring insitu", "rowType": "begrotingspost", "depth": 3, "parentId": "p100", "quantity": 2.0, "unit": "keer", "unitPrice": 900.0, "total": 1800.0, "verrekenbaar": "N" },
            { "id": "h11", "code": "11",     "description": "MELDINGEN", "rowType": "chapter", "depth": 1, "parentId": "h1", "total": 1748.04, "unitPrice": 0.0 },
            { "id": "p113","code": "113",    "description": "INRICHTEN PROJECTLOCATIE", "rowType": "chapter", "depth": 2, "parentId": "h11", "total": 1748.04, "unitPrice": 0.0 },
            { "id": "b1",  "code": "113010", "description": "Aanvoeren en plaatsen van hekwerken", "rowType": "begrotingspost", "depth": 3, "parentId": "p113", "quantity": 27.0, "unit": "st", "unitPrice": 6.94, "total": 187.38, "verrekenbaar": "N" },
            { "id": "b2",  "code": "113020", "description": "Huur en instand houden hekwerken", "rowType": "begrotingspost", "depth": 3, "parentId": "p113", "quantity": 27.0, "unit": "st", "unitPrice": 5.0, "total": 135.0, "verrekenbaar": "N" },
            { "id": "b3",  "code": "113040", "description": "Inrichten locatie van depot voor tijdelijke uitplaatsing", "rowType": "begrotingspost", "depth": 3, "parentId": "p113", "quantity": 1.0, "unit": "keer", "unitPrice": 132.5, "total": 132.5, "verrekenbaar": "N" },
            { "id": "h2",  "code": "2",      "description": "GRONDWERK", "rowType": "chapter", "depth": 0, "parentId": null, "total": 1293.66, "unitPrice": 0.0 },
            { "id": "p200","code": "200",    "description": "ONTGRAVEN/ZUIGEN ZAND", "rowType": "chapter", "depth": 1, "parentId": "h2", "total": 1293.66, "unitPrice": 0.0 },
            { "id": "c1",  "code": "200020", "description": "Zuigen zand tot 1m-mv tpv te plaatsen OBAS", "rowType": "begrotingspost", "depth": 2, "parentId": "p200", "quantity": 14.0, "unit": "m³", "unitPrice": 40.0, "total": 560.0, "verrekenbaar": "V" },
            { "id": "c2",  "code": "200030", "description": "Afvoeren en verwerken vrijgekomen zand", "rowType": "begrotingspost", "depth": 2, "parentId": "p200", "quantity": 17.5, "unit": "m³", "unitPrice": 41.92, "total": 733.66, "verrekenbaar": "V" }
        ],
        "reportView": view,
        "pageSize": "A4",
        "pageOrientation": "portrait",
        "showHoeveelheid": true,
        "companyInfo": { "name": "Open Calc Studio" }
    })
}

fn main() {
    let view = std::env::args().nth(1).unwrap_or_else(|| "werkbeschrijving".to_string());
    let out = std::env::args()
        .nth(2)
        .unwrap_or_else(|| format!("ocs_view_{view}.pdf"));

    let mut request_json = match std::env::args().nth(3).filter(|s| !s.is_empty()) {
        Some(project_path) => {
            let json = std::fs::read_to_string(&project_path).expect("projectbestand lezen");
            let proj: serde_json::Value = serde_json::from_str(&json).expect("JSON parsen");
            serde_json::json!({
                "schedule": proj["schedule"],
                "items": proj["items"],
                "reportView": view,
                "pageSize": "A4",
                "pageOrientation": "portrait",
                "showHoeveelheid": true,
                "companyInfo": proj["companyInfo"],
            })
        }
        None => sample_request(&view),
    };

    // Optioneel 4e argument: pad naar een logo-afbeelding → koptekst rechtsboven
    if let Some(logo_path) = std::env::args().nth(4) {
        let bytes = std::fs::read(&logo_path).expect("logo lezen");
        use base64::Engine as _;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        request_json["companyInfo"]["logoRight"] =
            serde_json::Value::String(format!("data:image/png;base64,{b64}"));
    }

    let request: app_lib::reports::ReportRequest =
        serde_json::from_value(request_json).expect("ReportRequest parsen");

    app_lib::reports::generator::generate(&request, &out).expect("PDF-generatie mislukt");
    let size = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
    eprintln!("{view}: {size} bytes → {out}");
}
