"""Public Store observation, without publisher credentials. Exit nonzero on mismatch."""
import datetime
import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).resolve().parents[2]
expected = json.loads((root / "package.json").read_text())["license"]
request = urllib.request.Request(
    "https://api.snapcraft.io/v2/snaps/info/open-calc-studio",
    headers={"Snap-Device-Series": "16"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    data = json.load(response)
actual = data["snap"].get("license")
print(json.dumps({
    "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "expectedLicense": expected, "storeLicense": actual,
    "stable": [{"version": row["version"], "revision": row["revision"]}
               for row in data.get("channel-map", []) if row["channel"]["name"] == "stable"],
    "matches": actual == expected,
}, indent=2))
raise SystemExit(0 if actual == expected else 1)
