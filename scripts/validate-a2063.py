"""Valideer ÖNORM A 2063-bestanden (.onlv, .onlb, …) tegen de officiële XSD's.

Gebruik (vanuit de repo-root):

    python scripts/validate-a2063.py BESTAND [BESTAND ...] [--xsd-dir MAP] [--max-errors N]

De XSD-map is de map met onlv.xsd/onlb.xsd/ontypdef.xsd van de normversie
2021-03-01. Standaard: ../verification-files/Begrotingen/ONORM-A2063/
schema_a2063_2021-03-15/schema_a2063_2021-03-15 (naast deze repo). Voor een
bestand in de namespace 2015-07-15 wordt de map schema_a2063_2015-07-15_V2
naast de opgegeven map gebruikt.

Het schema wordt gekozen op het wortelelement (onlv → onlv.xsd, onlb →
onlb.xsd, …). Validatie met lxml (libxml2, snel); zonder lxml met xmlschema.

Afsluitcode: 0 = alle bestanden geldig, 1 = minstens één bestand ongeldig,
2 = fout in de aanroep (bestand/XSD-map ontbreekt), 3 = geen validator-
bibliotheek geïnstalleerd (pip install lxml).
"""
import argparse
import os
import re
import sys

DEFAULT_XSD_DIR = os.path.join(
    "..", "verification-files", "Begrotingen", "ONORM-A2063",
    "schema_a2063_2021-03-15", "schema_a2063_2021-03-15",
)
NS_2015 = "http://www.oenorm.at/schema/A2063/2015-07-15"
NS_2021 = "http://www.oenorm.at/schema/A2063/2021-03-01"


def root_info(path):
    """Wortelelement en namespace zonder het hele bestand te parsen."""
    with open(path, "rb") as f:
        head = f.read(4096).decode("utf-8", errors="replace")
    m = re.search(r"<([A-Za-z][\w.-]*)(\s[^>]*)?>", head.lstrip("﻿"))
    if not m or m.group(1).lower().startswith("?xml"):
        m = re.search(r"<(?!\?)([A-Za-z][\w.-]*)(\s[^>]*)?>", head)
    if not m:
        return None, None
    local = m.group(1).split(":")[-1]
    ns = re.search(r'xmlns(?::\w+)?="([^"]+)"', m.group(2) or "")
    return local, (ns.group(1) if ns else "")


def xsd_dir_for(ns, xsd_dir):
    if ns == NS_2015:
        alt = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(xsd_dir))), "schema_a2063_2015-07-15_V2")
        if os.path.isdir(alt):
            return alt
        alt = os.path.join(os.path.dirname(os.path.abspath(xsd_dir)), "schema_a2063_2015-07-15_V2")
        if os.path.isdir(alt):
            return alt
    return xsd_dir


def validate_lxml(path, xsd_path, max_errors):
    from lxml import etree

    schema = etree.XMLSchema(etree.parse(xsd_path))
    doc = etree.parse(path)
    ok = schema.validate(doc)
    errors = ["regel %s: %s" % (e.line, e.message) for e in schema.error_log]
    return ok, len(errors), errors[:max_errors]


def validate_xmlschema(path, xsd_path, max_errors):
    import xmlschema

    schema = xmlschema.XMLSchema(xsd_path)
    errors = []
    for err in schema.iter_errors(path):
        errors.append("%s: %s" % (getattr(err, "path", "?"), err.reason or err.message))
        if len(errors) > 100000:
            break
    return len(errors) == 0, len(errors), errors[:max_errors]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--xsd-dir", default=DEFAULT_XSD_DIR)
    ap.add_argument("--max-errors", type=int, default=10)
    args = ap.parse_args()

    if not os.path.isdir(args.xsd_dir) or not os.path.isfile(os.path.join(args.xsd_dir, "onlv.xsd")):
        print("XSD-map niet gevonden of zonder onlv.xsd: %s" % args.xsd_dir)
        return 2

    validator = None
    try:
        import lxml  # noqa: F401
        validator = validate_lxml
    except ImportError:
        try:
            import xmlschema  # noqa: F401
            validator = validate_xmlschema
        except ImportError:
            print("Geen validator-bibliotheek gevonden: pip install lxml (of xmlschema)")
            return 3

    failed = 0
    for path in args.files:
        if not os.path.isfile(path):
            print("ONTBREEKT %s" % path)
            return 2
        local, ns = root_info(path)
        if not local:
            print("FOUT     %s: geen wortelelement gevonden" % path)
            failed += 1
            continue
        xsd_dir = xsd_dir_for(ns, args.xsd_dir)
        xsd_path = os.path.join(xsd_dir, "%s.xsd" % local)
        if not os.path.isfile(xsd_path):
            print("FOUT     %s: geen schema voor wortelelement <%s> in %s" % (path, local, xsd_dir))
            failed += 1
            continue
        try:
            ok, count, errors = validator(path, xsd_path, args.max_errors)
        except Exception as exc:  # parse-fout of ongeldig XML
            print("FOUT     %s: %s" % (path, exc))
            failed += 1
            continue
        label = "GELDIG  " if ok else "ONGELDIG"
        print("%s %s (%s, %s.xsd %s): %d fout(en)" % (label, path, ns or "geen namespace", local, os.path.basename(xsd_dir), count))
        for e in errors:
            print("    - %s" % e)
        if not ok:
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
