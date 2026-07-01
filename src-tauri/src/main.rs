// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // WebView2 (Windows) kan met GPU-compositing een (deels) wit/zwart scherm
  // geven op sommige GPU's/drivers. Val terug op software-rendering tenzij de
  // gebruiker het zelf overschrijft. Voor deze data-app is het perf-verschil
  // verwaarloosbaar; het voorkomt het bekende Tauri-wit-scherm op Windows.
  #[cfg(target_os = "windows")]
  if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
    std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "--disable-gpu --disable-features=CalculateNativeWinOcclusion",
    );
  }
  app_lib::run();
}
