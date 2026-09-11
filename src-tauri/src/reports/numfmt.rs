//! Getal-, bedrag-, procent- en datumnotatie in de rapporttaal.
//!
//! De frontend leidt de notatie af uit `Intl` voor de rapporttaal en stuurt
//! hem mee als `numberFormat` (zie `src/i18n/reportI18n.ts`). Rust kent zelf
//! geen locales; het past alleen de aangeleverde tekens en patronen toe.
//! Zonder `numberFormat` (CLI, MCP-server, oudere clients) geldt de
//! Nederlandse notatie: € 1.234,56 en DD-MM-JJJJ.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NumberFormat {
    /// Decimaalteken, bv. "," of ".".
    pub decimal: String,
    /// Duizendtalscheiding, bv. ".", "," of een harde spatie. Leeg = geen.
    pub group: String,
    /// Groepsgroottes van rechts: [3] of [3, 2] (Indiase notatie 12,34,567).
    pub grouping: Vec<usize>,
    /// Minimaal aantal cijfers vóór de eerste scheiding: 1 = "1.234",
    /// 2 = "1234" maar "12.345" (o.a. Spaans en Pools).
    pub min_grouping_digits: usize,
    /// Minteken voor getallen en procenten.
    pub minus: String,
    /// Bedragpatroon; `{{n}}` = het getal zonder teken, bv. "€ {{n}}".
    pub currency: String,
    /// Bedragpatroon voor negatieve bedragen, bv. "€ -{{n}}" of "-€{{n}}".
    pub currency_negative: String,
    /// Procentpatroon; `{{n}}` = het getal, bv. "{{n}}%" of "{{n}} %".
    pub percent: String,
    /// Datumpatroon met DD, MM en YYYY (of YY), bv. "DD-MM-YYYY".
    pub date: String,
}

impl Default for NumberFormat {
    fn default() -> Self {
        Self {
            decimal: ",".into(),
            group: ".".into(),
            grouping: vec![3],
            min_grouping_digits: 1,
            minus: "-".into(),
            currency: "€ {{n}}".into(),
            currency_negative: "€ -{{n}}".into(),
            percent: "{{n}}%".into(),
            date: "DD-MM-YYYY".into(),
        }
    }
}

impl NumberFormat {
    /// Getal met `decimals` decimalen en duizendtalscheiding.
    pub fn number(&self, value: f64, decimals: usize) -> String {
        let digits = self.unsigned(value, decimals);
        if value < 0.0 && !is_zero(&digits) {
            format!("{}{}", self.minus, digits)
        } else {
            digits
        }
    }

    /// Hoeveelheid of prijs met twee decimalen; leeg bij `None` of 0.
    pub fn opt_number(&self, value: Option<f64>) -> String {
        match value {
            Some(v) if v != 0.0 => self.number(v, 2),
            _ => String::new(),
        }
    }

    /// Bedrag met valutateken, bv. "€ 1.234,56" of "1.234,56 €".
    pub fn currency(&self, value: f64) -> String {
        let digits = self.unsigned(value, 2);
        let pattern = if value < 0.0 && !is_zero(&digits) {
            &self.currency_negative
        } else {
            &self.currency
        };
        pattern.replace("{{n}}", &digits)
    }

    /// Percentage met `decimals` decimalen, bv. "2,50%" of "2,50 %".
    pub fn percent(&self, value: f64, decimals: usize) -> String {
        self.percent.replace("{{n}}", &self.number(value, decimals))
    }

    /// Percentagegetal zonder overbodige nullen ("21", "5,5") — voor labels
    /// die het %-teken zelf al bevatten, zoals "BTW {{pct}}%".
    pub fn pct_value(&self, value: f64) -> String {
        let s = self.number(value, 2);
        match s.strip_suffix("00") {
            Some(rest) => rest.strip_suffix(self.decimal.as_str()).unwrap_or(rest).to_string(),
            None => s.strip_suffix('0').unwrap_or(&s).to_string(),
        }
    }

    /// ISO-datum (JJJJ-MM-DD, eventueel met tijd erachter) in het datumpatroon.
    /// Iets anders dan een ISO-datum komt ongewijzigd terug.
    pub fn date(&self, iso: &str) -> String {
        self.date_with(&self.date, iso)
    }

    /// Als [`date`](Self::date), maar met een jaartal van twee cijfers.
    pub fn date_short_year(&self, iso: &str) -> String {
        self.date_with(&self.date.replace("YYYY", "YY"), iso)
    }

    /// Vandaag in het datumpatroon.
    pub fn today(&self) -> String {
        self.date(&chrono::Local::now().format("%Y-%m-%d").to_string())
    }

    fn date_with(&self, pattern: &str, iso: &str) -> String {
        let Some((y, m, d)) = parse_iso_date(iso) else {
            return iso.to_string();
        };
        let mut out = String::with_capacity(pattern.len() + 4);
        let mut rest = pattern;
        while !rest.is_empty() {
            let (token, value) = if rest.starts_with("YYYY") {
                (4, y.to_string())
            } else if rest.starts_with("YY") {
                (2, format!("{:02}", y % 100))
            } else if rest.starts_with("MM") {
                (2, format!("{:02}", m))
            } else if rest.starts_with("DD") {
                (2, format!("{:02}", d))
            } else {
                let ch = rest.chars().next().unwrap_or_default();
                (ch.len_utf8(), ch.to_string())
            };
            out.push_str(&value);
            rest = &rest[token..];
        }
        out
    }

    /// Absolute waarde, afgerond op `decimals`, met scheidingstekens.
    fn unsigned(&self, value: f64, decimals: usize) -> String {
        let scale = 10u64.pow(decimals as u32);
        // Eerst op de laatste decimaal afronden en dán splitsen: fractie-eerst
        // rondde 39.996 af naar 100 centen en gaf "39,100" i.p.v. "40,00".
        let total = (value.abs() * scale as f64).round() as u64;
        let mut s = self.group_digits(total / scale);
        if decimals > 0 {
            s.push_str(&self.decimal);
            s.push_str(&format!("{:0width$}", total % scale, width = decimals));
        }
        s
    }

    fn group_digits(&self, whole: u64) -> String {
        let digits = whole.to_string();
        let primary = self.grouping.first().copied().filter(|&g| g > 0).unwrap_or(3);
        let secondary = self.grouping.get(1).copied().filter(|&g| g > 0).unwrap_or(primary);
        if self.group.is_empty() || digits.len() < primary + self.min_grouping_digits.max(1) {
            return digits;
        }
        // Groepen van rechts naar links: eerst `primary` cijfers, daarna telkens
        // `secondary`.
        let mut groups: Vec<&str> = Vec::new();
        let mut end = digits.len();
        let mut size = primary;
        while end > size {
            groups.push(&digits[end - size..end]);
            end -= size;
            size = secondary;
        }
        groups.push(&digits[..end]);
        groups.reverse();
        groups.join(&self.group)
    }
}

fn is_zero(digits: &str) -> bool {
    digits.chars().all(|c| !c.is_ascii_digit() || c == '0')
}

fn parse_iso_date(s: &str) -> Option<(u32, u32, u32)> {
    let head = s.trim().get(..10)?;
    let mut parts = head.split('-');
    let (y, m, d) = (parts.next()?, parts.next()?, parts.next()?);
    if y.len() != 4 || m.len() != 2 || d.len() != 2 {
        return None;
    }
    Some((y.parse().ok()?, m.parse().ok()?, d.parse().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt(json: serde_json::Value) -> NumberFormat {
        serde_json::from_value(json).expect("NumberFormat parsen")
    }

    #[test]
    fn nederlands_is_de_standaard() {
        let nl = NumberFormat::default();
        assert_eq!(nl.currency(1234.5), "€ 1.234,50");
        assert_eq!(nl.currency(-1234.5), "€ -1.234,50");
        assert_eq!(nl.currency(39.996), "€ 40,00");
        assert_eq!(nl.currency(-0.001), "€ 0,00");
        assert_eq!(nl.opt_number(Some(1234567.891)), "1.234.567,89");
        assert_eq!(nl.opt_number(Some(0.0)), "");
        assert_eq!(nl.opt_number(None), "");
        assert_eq!(nl.percent(2.5, 2), "2,50%");
        assert_eq!(nl.date("2026-09-11"), "11-09-2026");
        assert_eq!(nl.date_short_year("2026-09-11"), "11-09-26");
        assert_eq!(nl.date("11 september"), "11 september");
        // Een leeg of gedeeltelijk object vult aan met de Nederlandse notatie
        assert_eq!(fmt(serde_json::json!({})).currency(1.0), "€ 1,00");
        let alleen_datum = fmt(serde_json::json!({ "date": "DD/MM/YYYY" }));
        assert_eq!(alleen_datum.currency(1234.5), "€ 1.234,50");
        assert_eq!(alleen_datum.date("2026-09-11"), "11/09/2026");
    }

    #[test]
    fn engels_duits_en_frans() {
        let en = fmt(serde_json::json!({
            "decimal": ".", "group": ",", "currency": "€{{n}}", "currencyNegative": "-€{{n}}",
            "date": "DD/MM/YYYY"
        }));
        assert_eq!(en.currency(-1234.5), "-€1,234.50");
        assert_eq!(en.date("2026-09-11T10:00:00Z"), "11/09/2026");

        let de = fmt(serde_json::json!({
            "currency": "{{n}}\u{a0}€", "currencyNegative": "-{{n}}\u{a0}€",
            "percent": "{{n}}\u{a0}%", "date": "DD.MM.YYYY"
        }));
        assert_eq!(de.currency(1234.5), "1.234,50\u{a0}€");
        assert_eq!(de.percent(7.0, 2), "7,00\u{a0}%");

        let fr = fmt(serde_json::json!({ "group": "\u{a0}", "currency": "{{n}}\u{a0}€" }));
        assert_eq!(fr.currency(1234567.0), "1\u{a0}234\u{a0}567,00\u{a0}€");
    }

    #[test]
    fn spaans_groepeert_pas_vanaf_vijf_cijfers() {
        let es = fmt(serde_json::json!({ "minGroupingDigits": 2, "currency": "{{n}}\u{a0}€" }));
        assert_eq!(es.number(1234.5, 2), "1234,50");
        assert_eq!(es.number(12345.0, 2), "12.345,00");
    }

    #[test]
    fn indiase_groepering_en_datumvolgorde() {
        let hi = fmt(serde_json::json!({
            "decimal": ".", "group": ",", "grouping": [3, 2], "date": "YYYY/MM/DD"
        }));
        assert_eq!(hi.number(1234567890.0, 0), "1,23,45,67,890");
        assert_eq!(hi.number(-999.0, 0), "-999");
        assert_eq!(hi.date("2026-09-11"), "2026/09/11");
        assert_eq!(hi.date_short_year("2026-09-11"), "26/09/11");
    }

    #[test]
    fn procentwaarde_zonder_overbodige_nullen() {
        let nl = NumberFormat::default();
        assert_eq!(nl.pct_value(21.0), "21");
        assert_eq!(nl.pct_value(5.5), "5,5");
        assert_eq!(nl.pct_value(12.25), "12,25");
        let en = fmt(serde_json::json!({ "decimal": "." }));
        assert_eq!(en.pct_value(5.5), "5.5");
    }
}
