use std::{fs::{self, OpenOptions}, io::Write, path::Path, sync::atomic::{AtomicU64, Ordering}};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn write_replacement(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).ok_or("An absolute file path is required")?;
    if !path.is_absolute() { return Err("An absolute file path is required".into()); }
    let name = path.file_name().ok_or("Missing file name")?.to_string_lossy();
    let temporary = parent.join(format!(".{}.ocs-{}-{}.tmp", name, std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(content).map_err(|e| e.to_string())?;
        if let Ok(metadata) = fs::metadata(path) { fs::set_permissions(&temporary, metadata.permissions()).map_err(|e| e.to_string())?; }
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        { fs::File::open(parent).and_then(|dir| dir.sync_all()).map_err(|e| e.to_string())?; }
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

fn save(path: &Path, content: &str) -> Result<(), String> {
    if content.len() > 512 * 1024 * 1024 { return Err("Project exceeds 512 MiB".into()); }
    // Validate before touching the destination or its previous version.
    let project: serde_json::Value = serde_json::from_str(content).map_err(|e| e.to_string())?;
    if !project["items"].is_array() || !project["schedule"].is_object() { return Err("Invalid project".into()); }
    if path.exists() {
        if fs::metadata(path).map_err(|e| e.to_string())?.permissions().readonly() { return Err("The project is read-only. Use Save as.".into()); }
        let backup = path.with_file_name(format!("{}.bak", path.file_name().ok_or("Missing file name")?.to_string_lossy()));
        write_replacement(&backup, &fs::read(path).map_err(|e| e.to_string())?)?;
    }
    write_replacement(path, content.as_bytes())
}

#[tauri::command]
pub async fn save_project_atomic(path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save(Path::new(&path), &content)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_keeps_previous_version_and_invalid_input_cannot_truncate_it() {
        let dir = std::env::temp_dir().join(format!("ocs-atomic-{}-{}", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir(&dir).unwrap();
        let target = dir.join("estimate.ifcCalc");
        let first = r#"{"schedule":{},"items":[]}"#;
        let second = r#"{"schedule":{"name":"next"},"items":[]}"#;
        save(&target, first).unwrap(); save(&target, second).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), second);
        assert_eq!(fs::read_to_string(dir.join("estimate.ifcCalc.bak")).unwrap(), first);
        assert!(save(&target, "invalid").is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), second);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(dir).unwrap();
    }
}
