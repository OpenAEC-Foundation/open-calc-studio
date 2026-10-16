# Open Calc Studio native library

The native library contains the same frontend and Rust backend as the desktop
application. `ocs_run()` opens the full application in **its own window**. This
is a native C ABI, callable from C/C++ or through P/Invoke; it is not a managed
.NET assembly, a headless calculation engine or an embeddable child-window control.
For an interface inside an existing web application, use `packages/embed`.

## Contract

- `ocs_abi_version()` returns `1`; `ocs_version()` returns the application version.
- Call `ocs_run()` once on the **process main thread**, outside `DllMain`, before
  starting another UI event loop. It blocks until the app closes and then returns
  its exit code. It does not intentionally exit the host process.
- Negative results: `-1` startup failure, `-2` repeated invocation, `-3` caught
  Rust panic. Read `ocs_last_error()` on the same thread for the UTF-8 message.
- Returned strings belong to the library: never free them. The error pointer
  remains valid until the next `ocs_run()` call on that thread.
- **Keep the library loaded until host process exit.** Do not call `FreeLibrary`
  or `dlclose`, including after `ocs_run` returns. Tauri and API background workers
  can still own code/data from it. Restarting requires a new host process.
- While the application runs, use the existing MCP server or loopback command API
  from another process/thread. See [MCP coverage](../../docs/mcp-desktop.md).
  C exports provide lifecycle and metadata; they do not duplicate the 202 actions.

## Windows x64

Unpack the complete archive. Keep `OpenCalcStudio.dll`, `WebView2Loader.dll`,
the resources and `OpenCalcStudioHost.exe` together. Run the host executable,
or use the header and example `host.c` to load the DLL from your own host.
`Host.cs` demonstrates P/Invoke from an x64 C# console host with an STA main
thread. The DLL itself remains native; this example has not been compiled here.
`OpenCalcStudioHost.exe --abi-check` checks loading and ABI without opening a UI.
The package also contains `OpenCalcStudio.exe`, the ordinary standalone app.

Microsoft Edge WebView2 Runtime must be installed. Node.js is required only for
the MCP stdio server, not for opening the app. WpCalc export still needs the
Windows Access driver. The local cross-compiled development package is **unsigned**
and has not been run on Windows; a PE/export-table check is not a Windows UI test.

Environment variables must be set before `ocs_run`: `OCS_API_PORT` (default 9742),
`OCS_WS_PORT` (9741), optional `OCS_API_TOKEN`, `OPEN_CALC_NODE` and
`OCS_SKIP_MCP_CONFIG=1` to suppress automatic MCP configuration installation.

## Linux

The corresponding library is `libOpenCalcStudio.so`. It needs the same GTK3 /
WebKitGTK 4.1 system libraries as the Linux desktop. Run the supplied host from
the archive directory. `OCS_LIBRARY_PATH` may override the library path.

## Build

From the repository root, build the frontend and server first:

```sh
npm ci
npm --prefix mcp-server ci
npm --prefix mcp-server run bundle
npm run build
cargo build --manifest-path src-tauri/Cargo.toml --lib --bin open-calc-studio --features tauri/custom-protocol
node scripts/package-native.mjs
```

On Windows, use a Visual Studio developer shell, compile `host.c` with `cl`,
and copy the resulting executable to the package directory. The native workflow
automates building, ABI checking and packaging on Windows and Linux. The existing
signed desktop workflow also builds, Authenticode-signs and verifies the Windows
DLL and host when the required Azure signing secrets are configured.
