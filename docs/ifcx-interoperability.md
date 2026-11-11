# Shared OpenAEC IFCX import

Version 2026.46.0 adds the first import profile for issue #69. Existing
`ifcx::cost::…` / `ifcx::ocs::…` imports and Calc exports keep their existing format.
This is an interoperability experiment, not a final shared schema decision.

| Explorer field | Calc value |
| --- | --- |
| Node `path` | Stable item `id`; original path also retained in notes |
| `openaec::cost::estimateItem.quantity` | Reference to a node with `openaec::quantity` |
| Quantity `value`, `unit` | Item quantity and normalized quantity unit |
| Estimate `rate`, `currency`, `unit` | Original rate and tariff unit retained in notes; schedule currency |
| Estimate `total` | Rounded line amount; editable native rate = total / quantity |
| `openaec::links[].target` | All model paths retained as source references and in notes |
| `openaec::label`, quantity `formula` | Description and captured quantity origin |
| `status`, `assumption` | Retained in notes; no assumption is treated as verified |

The tariff unit (`EUR/m³`) differs from the quantity unit (`m³`). The amount must
equal quantity × source rate rounded to cents. Calc's effective native rate may
therefore differ slightly from the source rate, preserving the rounded line
amount on recalculation, as Explorer's Calc adapter does. No VAT or overhead is
invented; the imported schedule is explicitly direct-costs-only.

Import a **composed JSON document** containing the estimate and its referenced
quantity nodes in `data`. Calc does not download external `imports`, access a
model service, infer a missing quantity or update quantities live. Unresolved
references, duplicate paths, mixed cost profiles, mixed currencies, unknown
quantity units and inconsistent amounts fail before a budget is installed.
Free items without a quantity-node reference remain outside this provisional
profile until their representation is agreed with the Explorer maintainers.
Multiple model references are preserved; geometry selection is not claimed.

## Reproduce the reference probe

The integration was checked against Explorer commit
`10917460b67133891870d354b75221d714d63022`, using
`examples/reference-school/cost/estimates.ifcx` and
`examples/reference-school/quantities/elements.ifcx`. Keep these input files
outside this repository; the unit fixture is independently authored.

```sh
npx esbuild verification/ifcx-import-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/ocs-ifcx-probe.mjs
node /tmp/ocs-ifcx-probe.mjs /path/to/estimates.ifcx /path/to/elements.ifcx
```

The probe checks the production importer, recalculation, native serialization,
reopening and retention of quantity provenance. This does not verify the
geometry, validate the model's measurements or certify its illustrative rates.

Observed on 11 November 2026: **2,703 items**, **EUR 397,443.12** direct costs;
maximum per-line difference after save/reopen: **2.2737367544323206e-13 EUR**.

Sources: [proposal and maintainer discussion](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/69),
[Explorer adapter](https://github.com/OpenAEC-Foundation/ifcx-explorer/blob/10917460b67133891870d354b75221d714d63022/viewer/src/studios/adapters.ts).
