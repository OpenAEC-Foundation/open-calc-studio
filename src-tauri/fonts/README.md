# Report fonts

Fallback fonts for the PDF reports, used per character when Liberation Sans
lacks one. See `src-tauri/src/reports/fonts.rs`.

| File | Used for | SHA-256 |
|---|---|---|
| `NotoSansArabic-Regular.ttf` | Arabic, Persian, Urdu | `bd86ca02f087d7f3c3788ba458fb6b73744c7639ed276b8d870dba6def6c40d0` |
| `NotoSansArabic-Bold.ttf` | the same, bold (Typst reports only) | `f4cb79f842a07d1bcf597879574358fb7010f73761396d1d0f2445dfedb4d2ca` |
| `NotoSansThai-Regular.ttf` | ฿ and Thai | `d4303fe9c63ebb72759ca8b6d2040c8ae81689f7d08d7b91c656154382b49313` |
| `NotoSansBengali-Regular.ttf` | ৳ and Bengali | `5dceda02816fece18ea6796f474f5d3170f1d862f21b1e809cdc94b1caa4b6ec` |
| `NotoSans-Regular-subset.ttf` | currency signs such as ₹ ₽ ₺ (openaec-layout reports only) | `a1399b49b179d86f9b8ceadc38b113f7d2dd78a417f25f7f488ff190f4ab798e` |

Both PDF engines use the Arabic, Thai and Bengali fonts. The Typst reports
(Bouw 1, IBIS-stijl, directiebegroting) also use the full Noto Sans from
`src/styles/blueprint/fonts/` and embed only the glyphs they draw.
openaec-layout embeds a fallback font whole, so it gets the subset instead.
Thai and Bengali ship in regular weight only, so bold text in those scripts
comes out regular in both engines.

## Sources

Noto Sans Arabic 2.013, Noto Sans Thai 2.002 and Noto Sans Bengali 3.011 come
unchanged from `fonts/NotoSansArabic/unhinted/ttf/`,
`fonts/NotoSansThai/unhinted/ttf/` and `fonts/NotoSansBengali/unhinted/ttf/` in
https://github.com/notofonts/notofonts.github.io at commit
`15f23a0fd72c87285f50e890af8cf64d82d588a3`.

`NotoSans-Regular-subset.ttf` is made from `src/styles/blueprint/fonts/NotoSans-Regular.ttf`
(Noto Sans 2.015) with fontTools 4.63.0. It keeps combining accents, Latin
Extended Additional, punctuation, super- and subscripts, currency, letterlike
symbols, number forms and the replacement character �, and drops hinting and
OpenType layout tables
(openaec-layout does not shape):

```sh
python -m fontTools.subset src/styles/blueprint/fonts/NotoSans-Regular.ttf \
  --unicodes="U+0300-036F,U+1E00-1EFF,U+2000-2BFF,U+FB00-FB06,U+FFFD" \
  --layout-features= --drop-tables+=GSUB,GPOS,GDEF --no-hinting --notdef-outline \
  --name-IDs='*' --name-languages='*' \
  --output-file=src-tauri/fonts/NotoSans-Regular-subset.ttf
```

## Licences

All are under the SIL Open Font License 1.1, which allows bundling and
subsetting; Noto has no Reserved Font Name. The licence texts are next to the
fonts: `NotoSansArabic-OFL.txt` (from https://github.com/notofonts/arabic),
`NotoSansThai-OFL.txt` (https://github.com/notofonts/thai) and
`NotoSansBengali-OFL.txt` (https://github.com/notofonts/bengali). The Noto Sans
subset falls under `src/styles/blueprint/fonts/NotoSans-OFL.txt`.
