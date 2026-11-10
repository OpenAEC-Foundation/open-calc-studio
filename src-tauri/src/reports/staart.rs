//! Gedeelde staartberekening voor de Typst-rapporten (Bouw 1, IBIS, directie).
//!
//! Spiegel van `computeKostprijsBreakdown` en de eerste ronde van
//! `computeStaartItemBreakdowns` in `src/services/calculation/calculator.ts`:
//! de kostprijskolommen en de opslag-cascade excl. btw (inclusief afronding).
//! De btw rekent elk rapport daarna zelf over het excl-eindbedrag.

use super::CostItem;

/// Kostprijskolommen (loon, materiaal, materieel, stelpost, onderaanneming).
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub(super) struct Kolommen {
    pub loon: f64,
    pub materiaal: f64,
    pub materieel: f64,
    pub stelpost: f64,
    pub onderaanneming: f64,
}

impl Kolommen {
    pub fn totaal(&self) -> f64 {
        self.loon + self.materiaal + self.materieel + self.stelpost + self.onderaanneming
    }
}

/// Kostprijskolommen uit de geprijsde regels; zie `computeKostprijsBreakdown`.
/// Een begrotings-/bewakingspost zonder (geprijsde) kinderen telt met zijn
/// eigen prijs mee.
pub(super) fn kostprijs_kolommen(items: &[CostItem]) -> Kolommen {
    use std::collections::HashMap;
    let mut child_totals: HashMap<&str, f64> = HashMap::new();
    for it in items {
        if let Some(pid) = it.parent_id.as_deref() {
            if !it.row_type.starts_with("staart_") {
                *child_totals.entry(pid).or_default() += it.total;
            }
        }
    }
    let mut out = Kolommen::default();
    for it in items {
        let own_post = (it.row_type == "begrotingspost" || it.row_type == "bewakingspost")
            && child_totals.get(it.id.as_str()).copied().unwrap_or(0.0) == 0.0;
        if it.row_type != "regel" && !own_post {
            continue;
        }
        let qty = it.quantity.unwrap_or(0.0);
        let lab = it.labor_price.unwrap_or(0.0);
        let mat_price = it.norm_unit_price.unwrap_or(0.0)
            + if own_post { it.material_price.unwrap_or(0.0) } else { 0.0 };
        let total = it.total;
        let rt = it.resource_type.as_deref().unwrap_or("");
        if rt == "onderaannemer" {
            out.onderaanneming += total;
            continue;
        }
        let split_loon = lab * qty;
        let split_mat = mat_price * qty;
        let used_split = (split_loon + split_mat - total).abs() < 0.01 && (split_loon + split_mat) > 0.0;
        let loon_amt = if used_split { split_loon } else { 0.0 };
        let mat_amt = if used_split { split_mat } else { total };
        out.loon += loon_amt;
        match rt {
            "arbeid" => out.loon += mat_amt,
            "materieel" => out.materieel += mat_amt,
            "overig" => out.stelpost += mat_amt,
            _ => out.materiaal += mat_amt,
        }
    }
    out
}

/// Bijdrage van één staartregel.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub(super) struct Stap {
    pub loon: f64,
    pub materiaal: f64,
    pub materieel: f64,
    pub onderaanneming: f64,
    /// Grondslag waarover het percentage gaat (0 bij afronding).
    pub bedrag: f64,
    /// Het bedrag dat deze regel toevoegt.
    pub post: f64,
}

/// Lopende opslag-cascade excl. btw, in de volgorde van de staartregels.
pub(super) struct Cascade {
    kp: Kolommen,
    /// Grondslag voor een vlakke (BasCalc) staart en beginstand van `cumulatief`.
    start: f64,
    running: Kolommen,
    pub cumulatief: f64,
}

impl Cascade {
    /// `start` = het bedrag waarmee de cascade begint (de directe kosten).
    pub fn new(kp: Kolommen, start: f64) -> Self {
        Cascade { kp, start, running: kp, cumulatief: start }
    }

    /// Verwerk één niet-btw-staartregel; btw-regels leveren niets op.
    pub fn apply(&mut self, si: &CostItem) -> Stap {
        let pct = si.staart_percentage.unwrap_or(0.0) / 100.0;
        // Vlakke staart (BasCalc): over de directe kosten i.p.v. cascade.
        let vlak = si.staart_basis.as_deref() == Some("kostprijs");
        let mut s = Stap::default();
        match si.row_type.as_str() {
            "staart_ak_oa" => {
                let v = self.running.onderaanneming * pct;
                s.bedrag = self.running.onderaanneming;
                s.onderaanneming = v;
                s.post = v;
                self.running.onderaanneming += v;
            }
            "staart_abk" | "staart_garanties" | "staart_wvpm" => {
                let b = if vlak { self.kp } else { self.running };
                s.bedrag = b.loon + b.materiaal + b.materieel;
                s.loon = b.loon * pct;
                s.materiaal = b.materiaal * pct;
                s.materieel = b.materieel * pct;
                s.post = s.loon + s.materiaal + s.materieel;
                if !vlak {
                    self.running.loon += s.loon;
                    self.running.materiaal += s.materiaal;
                    self.running.materieel += s.materieel;
                }
            }
            "staart_risico" | "staart_winst" | "staart_verzekering"
            | "staart_ukk" | "staart_ak" | "staart_wr" => {
                s.bedrag = if vlak { self.start } else { self.cumulatief };
                s.post = s.bedrag * pct;
            }
            "staart_afronding" => {
                // Doelbedrag: precies op het gewenste excl-bedrag sluiten.
                // Anders (vast bedrag of automatische stap): het bedrag dat
                // de app al op de regel heeft gezet.
                s.post = match si.staart_doelbedrag {
                    Some(doel) => doel - self.cumulatief,
                    None => si.total,
                };
            }
            _ => {}
        }
        self.cumulatief += s.post;
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn items(v: serde_json::Value) -> Vec<CostItem> {
        serde_json::from_value(v).expect("CostItems parsen")
    }

    #[test]
    fn abk_gaat_niet_over_onderaanneming() {
        // 1000 arbeid + 1000 onderaanneming, AK OA 9%, ABK 6%: ABK = 60.
        let its = items(serde_json::json!([
            { "id": "h", "rowType": "chapter", "parentId": null, "total": 2000.0 },
            { "id": "a", "rowType": "regel", "parentId": "h", "total": 1000.0, "resourceType": "arbeid" },
            { "id": "o", "rowType": "regel", "parentId": "h", "total": 1000.0, "resourceType": "onderaannemer" },
            { "id": "s1", "rowType": "staart_ak_oa", "parentId": null, "staartPercentage": 9.0 },
            { "id": "s2", "rowType": "staart_abk", "parentId": null, "staartPercentage": 6.0 },
        ]));
        let kp = kostprijs_kolommen(&its);
        assert_eq!(kp.loon, 1000.0);
        assert_eq!(kp.onderaanneming, 1000.0);
        let mut c = Cascade::new(kp, kp.totaal());
        assert!((c.apply(&its[3]).post - 90.0).abs() < 1e-9);
        let abk = c.apply(&its[4]);
        assert!((abk.post - 60.0).abs() < 1e-9);
        assert!((abk.bedrag - 1000.0).abs() < 1e-9);
        assert!((c.cumulatief - 2150.0).abs() < 1e-9);
    }

    #[test]
    fn vlakke_staart_rekent_over_de_kostprijs() {
        let its = items(serde_json::json!([
            { "id": "a", "rowType": "regel", "parentId": null, "total": 1000.0, "resourceType": "arbeid" },
            { "id": "s1", "rowType": "staart_abk", "parentId": null, "staartPercentage": 10.0, "staartBasis": "kostprijs" },
            { "id": "s2", "rowType": "staart_winst", "parentId": null, "staartPercentage": 10.0, "staartBasis": "kostprijs" },
        ]));
        let kp = kostprijs_kolommen(&its);
        let mut c = Cascade::new(kp, kp.totaal());
        assert!((c.apply(&its[1]).post - 100.0).abs() < 1e-9);
        // Vlak: winst over 1000, niet over 1100.
        assert!((c.apply(&its[2]).post - 100.0).abs() < 1e-9);
        assert!((c.cumulatief - 1200.0).abs() < 1e-9);
    }

    #[test]
    fn afronding_doelbedrag_en_vast_bedrag() {
        let its = items(serde_json::json!([
            { "id": "a", "rowType": "regel", "parentId": null, "total": 800.0, "resourceType": "arbeid" },
            { "id": "d", "rowType": "staart_afronding", "parentId": null, "staartDoelbedrag": 850.0, "total": 12.0 },
            { "id": "v", "rowType": "staart_afronding", "parentId": null, "total": -3.5 },
        ]));
        let kp = kostprijs_kolommen(&its);
        let mut c = Cascade::new(kp, kp.totaal());
        assert!((c.apply(&its[1]).post - 50.0).abs() < 1e-9);
        assert!((c.apply(&its[2]).post + 3.5).abs() < 1e-9);
    }

    #[test]
    fn post_zonder_kinderen_telt_met_eigen_prijs() {
        let its = items(serde_json::json!([
            { "id": "p", "rowType": "begrotingspost", "parentId": null, "total": 500.0,
              "quantity": 10.0, "laborPrice": 20.0, "materialPrice": 30.0 },
        ]));
        let kp = kostprijs_kolommen(&its);
        assert_eq!(kp.loon, 200.0);
        assert_eq!(kp.materiaal, 300.0);
    }
}
