#ifndef OPEN_CALC_STUDIO_H
#define OPEN_CALC_STUDIO_H
#include <stdint.h>
#ifdef _WIN32
#define OCS_CALL __cdecl
#define OCS_API __declspec(dllimport)
#else
#define OCS_CALL
#define OCS_API
#endif
#ifdef __cplusplus
extern "C" {
#endif
/* ABI revision 1. Read-only UTF-8 pointers are owned by the library. */
OCS_API uint32_t OCS_CALL ocs_abi_version(void);
OCS_API const char *OCS_CALL ocs_version(void);
OCS_API const char *OCS_CALL ocs_last_error(void);
/* Once, on the process main thread, outside DllMain and before any UI loop.
 * Opens its own window and blocks until closed. Negative values are errors.
 * Keep the library loaded until process exit, even after this call returns.
 * Use MCP or the local command API from another process/thread while running.
 */
OCS_API int32_t OCS_CALL ocs_run(void);
#ifdef __cplusplus
}
#endif
#endif
