/* Minimal dynamic C host: --abi-check verifies loading without opening a UI. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#include <wchar.h>
#ifdef _MSC_VER
/* TaskDialogIndirect and the window subclass APIs require Common Controls 6.
 * This must be active before LoadLibrary resolves the product DLL imports. */
#pragma comment(linker, "\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
#endif
#define CALL __cdecl
#else
#include <dlfcn.h>
#include <limits.h>
#include <stdlib.h>
#define CALL
#endif

typedef uint32_t (CALL *abi_fn)(void);
typedef const char *(CALL *text_fn)(void);
typedef int32_t (CALL *run_fn)(void);

int main(int argc, char **argv) {
#ifdef _WIN32
    wchar_t path[32768];
    DWORD length = GetModuleFileNameW(NULL, path, 32768);
    if (!length || length >= 32768) return 10;
    wchar_t *last = wcsrchr(path, L'\\');
    if (!last || last - path + 1 + 19 >= 32768) return 10;
    wcscpy(last + 1, L"OpenCalcStudio.dll");
    HMODULE library = LoadLibraryExW(path, NULL,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!library) { fprintf(stderr, "Cannot load OpenCalcStudio.dll (Windows error %lu).\n", GetLastError()); return 11; }
#define SYMBOL(name) GetProcAddress(library, name)
#else
    const char *path = getenv("OCS_LIBRARY_PATH");
    if (!path) {
#ifdef __APPLE__
        path = "./libOpenCalcStudio.dylib";
#else
        path = "./libOpenCalcStudio.so";
#endif
    }
    void *library = dlopen(path, RTLD_NOW | RTLD_LOCAL);
    if (!library) { fprintf(stderr, "%s\n", dlerror()); return 11; }
#define SYMBOL(name) dlsym(library, name)
#endif
    abi_fn abi = (abi_fn)SYMBOL("ocs_abi_version");
    text_fn version = (text_fn)SYMBOL("ocs_version");
    text_fn error = (text_fn)SYMBOL("ocs_last_error");
    run_fn run = (run_fn)SYMBOL("ocs_run");
    if (!abi || !version || !error || !run || abi() != 1) {
        fputs("Open Calc Studio ABI 1 is required.\n", stderr); return 12;
    }
    printf("Open Calc Studio %s; ABI %u\n", version(), abi());
    fflush(stdout);
    if (argc == 2 && strcmp(argv[1], "--abi-check") == 0) return 0;
    int32_t result = run();
    if (result < 0) fprintf(stderr, "%s\n", error());
    /* No FreeLibrary/dlclose: background runtime workers live to process exit. */
    return result < 0 ? 1 : result;
}
