/* Startup self-recovery, loaded as a file instead of inline so a hosted page with a strict CSP (no 'unsafe-inline',
   e.g. the SuperCloud werkplek, issue #61) starts without a CSP error. See the comment in index.html. */
(function () {
  var COUNT = "ocs-wsr-count";
  var counterStore;
  // Opaque host frames deliberately have no browser storage. Retrying
  // without a persistent counter would create an unbounded reload loop.
  try { counterStore = window.sessionStorage; counterStore.getItem(COUNT); }
  catch (_) { return; }
  var MAX = 4;               // max opeenvolgende reloads voor we opgeven
  var done = false;

  function tries() { try { return Number(counterStore.getItem(COUNT) || 0); } catch (_) { return MAX; } }

  function recover(reason) {
    if (done) return;
    if (document.getElementById("root") && document.getElementById("root").childElementCount > 0) return;
    var n = tries();
    if (n >= MAX) return;    // opgeven: laat het witte scherm staan i.p.v. eindeloos herladen
    done = true;
    try { counterStore.setItem(COUNT, String(n + 1)); } catch (_) { return; }
    // cache-bust zodat de webview niet dezelfde half-geoptimaliseerde
    // module opnieuw uit z'n cache serveert
    var u = new URL(window.location.href);
    u.searchParams.set("_wsr", String(Date.now()));
    window.location.replace(u.toString());
  }

  // 1) Direct op een mislukte module-/scriptlaad reageren (snelst herstel)
  window.addEventListener("error", function (e) {
    var t = e && e.target;
    if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK")) recover("resource");
  }, true);
  window.addEventListener("error", function (e) {
    var m = e && e.message ? String(e.message) : "";
    if (m.indexOf("does not provide an export") !== -1 ||
        m.indexOf("Failed to fetch dynamically imported module") !== -1 ||
        m.indexOf("error loading dynamically imported module") !== -1) recover("module");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var m = e && e.reason && e.reason.message ? String(e.reason.message) : "";
    if (m.indexOf("dynamically imported module") !== -1) recover("promise");
  });

  // 2) Vangnet-poll: gemount → teller wissen; nog leeg → herstellen
  var polls = 0;
  var iv = setInterval(function () {
    var root = document.getElementById("root");
    if (root && root.childElementCount > 0) {
      try { counterStore.removeItem(COUNT); } catch (_) { /* storage became unavailable */ }
      clearInterval(iv);
      return;
    }
    if (++polls >= 5) {      // ~5 × 700ms ≈ 3,5s zonder mount
      clearInterval(iv);
      recover("poll");
    }
  }, 700);
})();
