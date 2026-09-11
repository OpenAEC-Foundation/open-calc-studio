pub mod generator;
pub mod offerte;
mod bouw1;
mod ibis;

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRequest {
    pub schedule: Schedule,
    pub items: Vec<CostItem>,
    pub report_view: String,
    #[serde(default = "default_page_size")]
    pub page_size: String,
    #[serde(default = "default_orientation")]
    pub page_orientation: String,
    #[serde(default = "default_true")]
    pub show_hoeveelheid: bool,
    #[serde(default)]
    pub company_info: Option<CompanyInfo>,
    #[serde(default)]
    pub include_cover: Option<bool>,
    #[serde(default)]
    pub include_summary: Option<bool>,
    /// Rapportteksten in de rapporttaal: platte keys uit de `report`-namespace
    /// ("totals.contractSumExclVat") plus eenheden als "units.<code>". Leeg of
    /// afwezig (CLI, MCP-server) = de Nederlandse standaardteksten.
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

impl ReportRequest {
    /// Rapporttekst voor `key`, met de Nederlandse tekst als standaard.
    pub fn lbl<'a>(&'a self, key: &str, nl_default: &'a str) -> &'a str {
        label(&self.labels, key, nl_default)
    }

    /// Als [`lbl`](Self::lbl), met `{{naam}}`-placeholders ingevuld.
    pub fn lbl_fmt(&self, key: &str, nl_default: &str, args: &[(&str, &str)]) -> String {
        label_fmt(&self.labels, key, nl_default, args)
    }

    /// Eenheidscode (st, uur, m², …) in de rapporttaal; onbekend = ongewijzigd.
    pub fn unit(&self, code: &str) -> String {
        unit_label(&self.labels, code)
    }
}

/// Zoek een rapporttekst op; ontbreekt hij (of is hij leeg), dan de
/// Nederlandse standaardtekst — zo blijft een request zonder labels werken.
pub fn label<'a>(labels: &'a HashMap<String, String>, key: &str, nl_default: &'a str) -> &'a str {
    match labels.get(key) {
        Some(v) if !v.is_empty() => v.as_str(),
        _ => nl_default,
    }
}

/// Rapporttekst met `{{naam}}`-placeholders (zelfde syntax als i18next).
pub fn label_fmt(labels: &HashMap<String, String>, key: &str, nl_default: &str, args: &[(&str, &str)]) -> String {
    let mut out = label(labels, key, nl_default).to_string();
    for (name, value) in args {
        out = out.replace(&format!("{{{{{}}}}}", name), value);
    }
    out
}

/// Eenheid in de rapporttaal via "units.<code>"; zonder vertaling de code zelf.
pub fn unit_label(labels: &HashMap<String, String>, code: &str) -> String {
    if code.is_empty() {
        return String::new();
    }
    label(labels, &format!("units.{}", code), code).to_string()
}

fn default_page_size() -> String { "A4".into() }
fn default_orientation() -> String { "landscape".into() }
fn default_true() -> bool { true }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
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
    pub status: String,
    #[serde(default = "default_algemene_kosten")]
    pub algemene_kosten: f64,
    #[serde(default = "default_winst_risico")]
    pub winst_risico: f64,
    #[serde(default)]
    pub tarieven: Option<HashMap<String, f64>>,
    #[serde(default)]
    pub staart_rows: Option<Vec<StagartRow>>,
    #[serde(default)]
    pub report_date: Option<String>,
    /// Logo preset for PDF report header: "bouw1" | "custom"
    /// Currently only the value is plumbed through; falls back to Bouw 1 defaults
    /// (or custom logos from CompanyInfo) per existing behavior.
    #[serde(default)]
    pub report_logo_preset: Option<String>,
    /// Toon wijzigingsmarkeringen in de PDF (gewijzigde regels markeren).
    #[serde(default)]
    pub report_show_changes: bool,
    /// Toon de verrekenbaar-kolom (S/Verr., 'V') in tabelrapporten.
    /// None/afwezig = tonen (bestaand gedrag).
    #[serde(default)]
    pub report_show_verrekenbaar: Option<bool>,
    /// Hoofdaanneming: toon alleen subtotaal-bedragen — de individuele
    /// regelbedragen (eh.prijs/bedrag) blijven leeg, hoeveelheden zichtbaar.
    #[serde(default)]
    pub report_amounts_subtotals_only: Option<bool>,
    /// Hoogte van de rapportkoptekst in mm (positie van de accentlijn);
    /// het logo schaalt mee. None = automatisch (10 met logo, 8 zonder).
    #[serde(default)]
    pub report_header_height_mm: Option<f64>,
    /// Kleur van de koptekst-accentlijn als hex ("#D97706"). None = amber.
    #[serde(default)]
    pub report_header_line_color: Option<String>,
    /// Baseline voor "gewijzigd sinds" (ISO-tijd); regels met een latere
    /// history-entry zijn gewijzigd.
    #[serde(default)]
    pub change_tracking_since: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagartRow {
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
    pub itemtype: u32,
}

fn default_algemene_kosten() -> f64 { 6.0 }
fn default_winst_risico() -> f64 { 2.0 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub postal_address: String,
    #[serde(default)]
    pub postal_city: String,
    #[serde(default)]
    pub visit_address: String,
    #[serde(default)]
    pub visit_city: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub fax: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub logo_left: Option<String>,   // base64 encoded PNG
    #[serde(default)]
    pub logo_right: Option<String>,  // base64 encoded PNG
}

#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StaartItemBreakdown {
    #[serde(default)] pub loon: f64,
    #[serde(default)] pub materiaal: f64,
    #[serde(default)] pub materieel: f64,
    #[serde(default)] pub stelpost: f64,
    #[serde(default)] pub onderaanneming: f64,
    #[serde(default)] pub bedrag: f64,
    #[serde(default)] pub subtotaal: f64,
    #[serde(default)] pub totaal: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostItem {
    pub id: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub nr: Option<String>,
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
    pub norm_unit_price: Option<f64>,
    #[serde(default)]
    pub labor_price: Option<f64>,
    #[serde(default)]
    pub depth: u32,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub staart_percentage: Option<f64>,
    /// 'kostprijs' = vlak percentage over de directe kosten (BasCalc);
    /// afwezig/'cumulatief' = cascade.
    #[serde(default)]
    pub staart_basis: Option<String>,
    /// Alleen op staart_afronding: aanneemsom-doelbedrag (vaste sluitpost).
    #[serde(default)]
    pub staart_doelbedrag: Option<f64>,
    /// Alleen op staart_btw_laag: grondslag (excl. btw) voor het lage tarief.
    #[serde(default)]
    pub staart_btw_basis: Option<f64>,
    /// Btw-tarief van dit onderdeel ('hoog'/'laag'); kinderen erven van ouder.
    #[serde(default)]
    pub btw_tarief: Option<String>,
    #[serde(default)]
    pub verrekenbaar: Option<String>,
    #[serde(default)]
    pub resource_type: Option<String>,
    #[serde(default)]
    pub tarief_groep: Option<String>,
    #[serde(default)]
    pub norm_quantity: Option<f64>,
    #[serde(default)]
    pub norm_factor: Option<f64>,
    #[serde(default)]
    pub norm_divisor: Option<f64>,
    #[serde(default)]
    pub staart_item_breakdown: Option<StaartItemBreakdown>,
    #[serde(default)]
    pub history: Option<Vec<HistoryEntry>>,
}

/// Eén wijzigingshistorie-entry (alleen het tijdstip is nodig voor markering).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    #[serde(default)]
    pub timestamp: String,
}

impl CostItem {
    /// Of deze regel gewijzigd is sinds `since` (ISO-tijd). Leeg `since` = nooit.
    pub fn changed_since(&self, since: &Option<String>) -> bool {
        match (since, &self.history) {
            (Some(s), Some(h)) if !s.is_empty() => h.iter().any(|e| e.timestamp.as_str() >= s.as_str()),
            _ => false,
        }
    }
}

// ── Offerte report structures ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteReportRequest {
    pub offerte: OfferteData,
    pub schedule: Schedule,
    pub items: Vec<CostItem>,
    #[serde(default)]
    pub company_info: Option<CompanyInfo>,
    #[serde(default)]
    pub briefhoofd_path: Option<String>,
    /// Rapportteksten in de rapporttaal (zie [`ReportRequest::labels`]).
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

impl OfferteReportRequest {
    /// Rapporttekst voor `key`, met de Nederlandse tekst als standaard.
    pub fn lbl<'a>(&'a self, key: &str, nl_default: &'a str) -> &'a str {
        label(&self.labels, key, nl_default)
    }

    /// Als [`lbl`](Self::lbl), met `{{naam}}`-placeholders ingevuld.
    pub fn lbl_fmt(&self, key: &str, nl_default: &str, args: &[(&str, &str)]) -> String {
        label_fmt(&self.labels, key, nl_default, args)
    }

    /// Eenheidscode in de rapporttaal; onbekend = ongewijzigd.
    pub fn unit(&self, code: &str) -> String {
        unit_label(&self.labels, code)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteData {
    pub offerte_nummer: String,
    pub offerte_datum: String,
    pub geldigheid: u32,
    pub geadresseerde: Geadresseerde,
    pub begeleidend_schrijven: String,
    pub secties: Vec<OfferteSection>,
    pub betalingstermijnen: Vec<BetalingsTermijn>,
    pub garanties: Vec<OfferteGarantie>,
    pub voorwaarden: String,
    pub ondertekening: Vec<Ondertekenaar>,
    #[serde(default)]
    pub project_info: Option<OfferteProjectInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Geadresseerde {
    pub naam: String,
    pub adres: String,
    pub postcode: String,
    pub plaats: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteSection {
    pub titel: String,
    #[serde(rename = "type")]
    pub section_type: String,
    pub begeleidende_tekst: String,
    pub items: Vec<OfferteSectionItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteSectionItem {
    pub onderdeel: String,
    pub omschrijving: String,
    #[serde(default)]
    pub afbeeldingen: Vec<OfferteImageData>,
    #[serde(default)]
    pub sub_items: Vec<String>,
    #[serde(default)]
    pub properties: Vec<OffertePropertyData>,
    #[serde(default)]
    pub price_override: Option<f64>,
    #[serde(default)]
    pub price_per_unit: Option<f64>,
    #[serde(default)]
    pub price_unit: Option<String>,
    #[serde(default)]
    pub is_selected: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteImageData {
    pub path: String,
    pub thumbnail: String,
    #[serde(default)]
    pub caption: Option<String>,
    #[serde(default)]
    pub width_mm: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffertePropertyData {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BetalingsTermijn {
    pub beschrijving: String,
    pub percentage: f64,
    #[serde(default)]
    pub toelichting: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteGarantie {
    pub onderdeel: String,
    pub termijn: String,
    #[serde(default)]
    pub toelichting: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ondertekenaar {
    pub naam: String,
    pub functie: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub telefoon: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferteProjectInfo {
    #[serde(default)]
    pub project_type: String,
    #[serde(default)]
    pub architect: String,
    #[serde(default)]
    pub locatie: String,
    #[serde(default)]
    pub bouwmethode: String,
}

#[tauri::command]
pub fn generate_pdf_report(request: ReportRequest, output_path: String) -> Result<(), String> {
    generator::generate(&request, &output_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_pdf_preview(request: ReportRequest) -> Result<Vec<u8>, String> {
    generator::generate_bytes(&request)
}

#[tauri::command]
pub fn generate_ibis_report(request: ReportRequest, output_path: String) -> Result<(), String> {
    let pdf = ibis::generate_ibis_typst(&request)?;
    std::fs::write(std::path::Path::new(&output_path), pdf).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_ibis_preview(request: ReportRequest) -> Result<Vec<u8>, String> {
    ibis::generate_ibis_typst(&request)
}

#[tauri::command]
pub fn generate_offerte_pdf(request: OfferteReportRequest, output_path: String) -> Result<(), String> {
    offerte::generate(&request, &output_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_offerte_preview(request: OfferteReportRequest) -> Result<Vec<u8>, String> {
    offerte::generate_bytes(&request).map_err(|e| e.to_string())
}

/// Directe kosten (excl. staart) onder het lage btw-tarief, op basis van de
/// per-onderdeel markering (`btw_tarief`). Kinderen erven het tarief van hun
/// ouder; alleen bladeren tellen mee (spiegel van computeBtwLaagDirect in TS).
pub fn btw_laag_direct(items: &[CostItem]) -> f64 {
    use std::collections::HashMap;
    let mut children: HashMap<Option<&str>, Vec<&CostItem>> = HashMap::new();
    for it in items {
        if it.row_type.starts_with("staart_") {
            continue;
        }
        children.entry(it.parent_id.as_deref()).or_default().push(it);
    }
    fn walk(node: &CostItem, inherited_laag: bool, children: &std::collections::HashMap<Option<&str>, Vec<&CostItem>>) -> f64 {
        let eff_laag = match node.btw_tarief.as_deref() {
            Some("laag") => true,
            Some("hoog") => false,
            _ => inherited_laag,
        };
        match children.get(&Some(node.id.as_str())) {
            Some(kids) if !kids.is_empty() => kids.iter().map(|k| walk(k, eff_laag, children)).sum(),
            _ => if eff_laag { node.total } else { 0.0 },
        }
    }
    children
        .get(&None)
        .map(|tops| tops.iter().map(|t| walk(t, false, &children)).sum())
        .unwrap_or(0.0)
}

/// Som van de top-level directe kosten (excl. staart) — noemer voor de
/// pro-rata laag-grondslag.
pub fn direct_totaal(items: &[CostItem]) -> f64 {
    items
        .iter()
        .filter(|i| i.parent_id.is_none() && !i.row_type.starts_with("staart_"))
        .map(|i| i.total)
        .sum()
}

#[cfg(test)]
mod label_tests {
    use super::*;

    #[test]
    fn label_valt_terug_op_nederlands() {
        let empty = HashMap::new();
        assert_eq!(label(&empty, "totals.totalExclVat", "Totaal excl. BTW"), "Totaal excl. BTW");
        let mut en = HashMap::new();
        en.insert("totals.totalExclVat".to_string(), "Total excl. VAT".to_string());
        en.insert("totals.empty".to_string(), String::new());
        assert_eq!(label(&en, "totals.totalExclVat", "Totaal excl. BTW"), "Total excl. VAT");
        assert_eq!(label(&en, "totals.empty", "Leeg"), "Leeg");
    }

    #[test]
    fn label_fmt_vult_placeholders() {
        let mut en = HashMap::new();
        en.insert("footer.page".to_string(), "Page {{page}} of {{total}}".to_string());
        assert_eq!(label_fmt(&en, "footer.page", "Pagina {{page}} / {{total}}", &[("page", "2"), ("total", "5")]), "Page 2 of 5");
        let empty = HashMap::new();
        assert_eq!(label_fmt(&empty, "footer.page", "Pagina {{page}} / {{total}}", &[("page", "2"), ("total", "5")]), "Pagina 2 / 5");
    }

    #[test]
    fn unit_label_vertaalt_codes() {
        let mut en = HashMap::new();
        en.insert("units.uur".to_string(), "h".to_string());
        assert_eq!(unit_label(&en, "uur"), "h");
        assert_eq!(unit_label(&en, "m²"), "m²");
        assert_eq!(unit_label(&en, ""), "");
    }
}
