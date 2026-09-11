"""Controleer alle vertaalbestanden tegen de Engelse bron.

Gebruik (vanuit de repo-root):  python scripts/check-i18n.py

Meldt per taal ontbrekende of overbodige keys, afwijkende
{{placeholders}}, arrays met een andere lengte, ongeldig JSON en BOM's.
Plural-bewust: talen mogen extra CLDR-vormen (_few/_many/_zero/_two)
toevoegen bij een key die in het Engels alleen _one/_other heeft.

Een ontbrekende key breekt de app niet (i18next valt terug op Engels),
maar laat wel Engelse tekst zien in een anderstalige interface. Draai dit
na elke toegevoegde of gewijzigde tekst in src/i18n/locales/en/.
"""
import json
import os
import re
import sys

SRC = "src/i18n/locales/en"
ROOT = "src/i18n/locales"
NS = ["common", "ribbon", "backstage", "settings", "feedback", "grid", "dialogs", "releases"]
PLURAL_SUFFIXES = ("_zero", "_one", "_two", "_few", "_many", "_other", "_plural")


def flat(d, p=""):
    out = {}
    for k, v in d.items():
        key = f"{p}.{k}" if p else k
        if isinstance(v, dict):
            out.update(flat(v, key))
        else:
            out[key] = v
    return out


def plural_base(key):
    for s in PLURAL_SUFFIXES:
        if key.endswith(s):
            return key[: -len(s)]
    return None


def main():
    langs = sorted(d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)))
    en = {n: flat(json.load(open(f"{SRC}/{n}.json", encoding="utf-8"))) for n in NS}
    en_bases = {n: {plural_base(k) or k for k in en[n]} for n in NS}

    problems = 0
    rows = []
    for lang in langs:
        total, issues = 0, []
        for n in NS:
            path = f"{ROOT}/{lang}/{n}.json"
            if not os.path.exists(path):
                issues.append(f"{n}: ONTBREEKT")
                continue
            raw = open(path, "rb").read()
            if raw.startswith(b"\xef\xbb\xbf"):
                issues.append(f"{n}: BOM")
            try:
                tr = flat(json.loads(raw.decode("utf-8")))
            except Exception as e:
                issues.append(f"{n}: ONGELDIG JSON ({e})")
                continue
            total += len(tr)

            # Ontbrekend: een EN-key zonder tegenhanger, ook niet als plural-variant
            tr_bases = {plural_base(k) or k for k in tr}
            missing = [k for k in en[n] if k not in tr and (plural_base(k) or k) not in tr_bases]
            # Extra: een key waarvan de basis niet in EN bestaat
            extra = [k for k in tr if k not in en[n] and (plural_base(k) or k) not in en_bases[n]]
            if missing:
                issues.append(f"{n}: {len(missing)} ontbreken, bv {missing[:3]}")
            if extra:
                issues.append(f"{n}: {len(extra)} extra, bv {extra[:3]}")

            for k, v in en[n].items():
                if k not in tr:
                    continue
                if isinstance(v, str) and isinstance(tr[k], str):
                    a = set(re.findall(r"{{\s*\w+\s*}}", v))
                    b = set(re.findall(r"{{\s*\w+\s*}}", tr[k]))
                    if a != b:
                        issues.append(f"{n}:{k} placeholders {a} vs {b}")
                elif isinstance(v, list) and isinstance(tr[k], list) and len(v) != len(tr[k]):
                    issues.append(f"{n}:{k} array {len(v)} vs {len(tr[k])}")

        status = "OK" if not issues else f"{len(issues)} PROBLEMEN"
        if issues:
            problems += 1
        rows.append((lang, total, status, issues[:6]))

    for lang, total, status, issues in rows:
        print(f"{lang:>4}  {total:>5} keys  {status}")
        for i in issues:
            print(f"        - {i}")
    print(f"\n{len(rows)} talen; {problems} met problemen")
    return 1 if problems else 0


sys.exit(main())
