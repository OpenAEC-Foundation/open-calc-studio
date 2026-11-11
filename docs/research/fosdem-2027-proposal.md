# FOSDEM 2027 proposal preparation — #67

Prepared 11 November 2026. **Draft only; nothing submitted or sent.**

## Recommendation and ownership

Conditional go for a narrowly scoped physical-model-data interoperability talk.
It fits the devroom's model-data and collaboration topics. Do not pitch a general
estimating product demo. Final go/no-go, named owner, consenting speaker and bio
are still required; no maintainer has been assigned without their agreement.
Internal decision target: 27 November; official submission deadline: 4 December.

## Title and abstract draft

**From model quantities to an auditable open estimate**

How can a quantity in a building model become an editable estimate without
losing the evidence behind its amount? This session follows a small, synthetic
example through OpenAEC IFCX and Open Calc Studio. We show quantity references,
tariff units, currency and explicit line rounding, then save and reopen the
estimate. Deliberately broken references and inconsistent amounts demonstrate
why exchange needs validation rather than a silent fallback to zero. We discuss
what is preserved, what is only a captured value, and what still needs a shared
schema agreement. The aim is a technical discussion of model-data exchange and
human review, not a claim of certified quantities or production readiness.

Speaker bio: **pending the selected speaker's factual, approved biography**.
Source: https://github.com/OpenAEC-Foundation/open-calc-studio
Demo: `src/test/openaecIfcxImport.test.ts`, independently authored two-wall
fixture (3.333333 m³ × EUR 250/m³, rounded source amount EUR 833.33).

## Fifteen minutes plus five minutes of questions

| Minutes | Content |
| --- | --- |
| 0–3 | Physical model quantities, identity and the exchange problem |
| 3–7 | Two-wall fixture: reference, quantity unit versus tariff unit, amount |
| 7–10 | Import, native save/reopen and comparison; show original source rate |
| 10–12 | Missing quantity and wrong amount: explicit failure |
| 12–15 | Limits: captured values, no geometry validation, schema still provisional |
| 15–20 | Questions and interoperability discussion |

## Demo and rights gate before submission

- Pin the final source commit/release after #66 checks; rerun the fixture and
  save the command output. The automated calculation probe is not a rehearsed
  on-stage UI demo. Prepare a short local recording as fallback after rehearsal.
- Use only the independently authored fixture, application code under its
  existing LGPL license, and newly authored slides with an approved license.
  Do not redistribute the external school model without checking its rights.
- The CfP describes recording terms as CC BY 4.0 and also requests consent text
  mentioning CC BY-SA 4.0. A speaker must resolve and accept those terms before
  any submission; no consent is supplied on their behalf here.
- No travel booking, outreach, submission or presentation acceptance is implied.

Source checked 11 November: [official devroom CfP](https://lists.fosdem.org/hyperkitty/list/fosdem@lists.fosdem.org/thread/EGUAE3EE6XGRNLRLGLZTGIZ5XKKONDQ5/).
