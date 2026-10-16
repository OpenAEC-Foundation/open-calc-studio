//! Stable, minimal C ABI for hosting the full application in its own window.
//! Keep the library loaded until process exit: Tauri owns background workers.
use std::cell::RefCell;
use std::ffi::{c_char, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};

static STARTED: AtomicBool = AtomicBool::new(false);
thread_local! {
    static LAST_ERROR: RefCell<CString> = RefCell::new(CString::default());
}

fn set_error(message: &str) {
    LAST_ERROR.with(|value| {
        *value.borrow_mut() = CString::new(message.replace('\0', " ")).unwrap();
    });
}

/// C ABI revision, independent of the application version.
#[no_mangle]
pub extern "C" fn ocs_abi_version() -> u32 { 1 }

/// Static UTF-8 string. The caller must not free it.
#[no_mangle]
pub extern "C" fn ocs_version() -> *const c_char {
    concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr().cast()
}

/// Thread-local error, valid until the next ocs_run call on this thread.
#[no_mangle]
pub extern "C" fn ocs_last_error() -> *const c_char {
    LAST_ERROR.with(|value| value.borrow().as_ptr())
}

/// Call once on the process main thread, outside DllMain, before another UI
/// event loop starts. Blocks until the app window closes. Returns the app exit
/// code, or -1 (startup failure), -2 (already started), -3 (caught panic).
#[no_mangle]
pub extern "C" fn ocs_run() -> i32 {
    set_error("");
    if STARTED.swap(true, Ordering::AcqRel) {
        set_error("Open Calc Studio can only be started once per host process.");
        return -2;
    }
    match catch_unwind(AssertUnwindSafe(crate::run_return)) {
        Ok(Ok(code)) => code,
        Ok(Err(error)) => { set_error(&error.to_string()); -1 }
        Err(payload) => {
            let text = payload.downcast_ref::<String>().map(String::as_str)
                .or_else(|| payload.downcast_ref::<&str>().copied())
                .unwrap_or("Application startup panicked.");
            set_error(text);
            -3
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;

    #[test]
    fn abi_metadata_and_thread_local_error_storage() {
        assert_eq!(ocs_abi_version(), 1);
        assert_eq!(unsafe { CStr::from_ptr(ocs_version()) }.to_str().unwrap(), env!("CARGO_PKG_VERSION"));
        set_error("host\0error");
        assert_eq!(unsafe { CStr::from_ptr(ocs_last_error()) }.to_str().unwrap(), "host error");
        std::thread::spawn(|| {
            assert!(unsafe { CStr::from_ptr(ocs_last_error()) }.is_empty());
            set_error("other thread");
        }).join().unwrap();
        assert_eq!(unsafe { CStr::from_ptr(ocs_last_error()) }.to_str().unwrap(), "host error");
    }
}
