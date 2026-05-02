pub mod generator;
pub mod offerte;
mod bouw1;

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
pub fn generate_offerte_pdf(request: OfferteReportRequest, output_path: String) -> Result<(), String> {
    offerte::generate(&request, &output_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_offerte_preview(request: OfferteReportRequest) -> Result<Vec<u8>, String> {
    offerte::generate_bytes(&request).map_err(|e| e.to_string())
}
