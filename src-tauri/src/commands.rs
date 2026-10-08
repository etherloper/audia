use base64::{Engine as _, engine::general_purpose};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Raw image bytes on their way to the covers directory. Only the resulting
/// file path is ever sent to the frontend.
#[derive(Debug, Clone)]
pub struct CoverImage {
    pub data: Vec<u8>,
    pub mime: String,
}

pub(crate) fn is_audio_path(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => matches!(
            ext.to_lowercase().as_str(),
            "mp3" | "m4a" | "m4b" | "mp4" | "aac" | "ogg" | "opus" | "flac" | "wav"
        ),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::is_audio_path;
    use std::path::Path;

    #[test]
    fn recognises_audio_extensions_case_insensitively() {
        for name in [
            "a.mp3", "b.M4B", "c.m4a", "d.mp4", "e.aac", "f.ogg", "g.opus", "h.FLAC", "i.wav",
        ] {
            assert!(is_audio_path(Path::new(name)), "{name}");
        }
        for name in ["cover.jpg", "notes.txt", "book.nfo", "noextension"] {
            assert!(!is_audio_path(Path::new(name)), "{name}");
        }
    }
}

// --- Cover storage ---

pub(crate) fn covers_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("covers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// FNV-1a: stable across builds, so identical artwork always maps to the same file.
fn fnv1a64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in data {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn ext_for_mime(mime: &str) -> &'static str {
    match mime.to_lowercase().as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        _ => "jpg",
    }
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    }
}

/// Write cover bytes into the covers directory (content-addressed, so duplicates
/// are free) and return the absolute path.
pub(crate) fn store_cover(covers_dir: &Path, cover: &CoverImage) -> Option<String> {
    if cover.data.is_empty() {
        return None;
    }
    let name = format!(
        "{:016x}.{}",
        fnv1a64(&cover.data),
        ext_for_mime(&cover.mime)
    );
    let dest = covers_dir.join(name);
    if !dest.exists() {
        std::fs::write(&dest, &cover.data).ok()?;
    }
    Some(dest.to_string_lossy().to_string())
}

/// Store a `data:<mime>;base64,...` cover on disk and return its path.
#[tauri::command]
pub async fn save_cover_data_url(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    let rest = data_url.strip_prefix("data:").ok_or("Not a data URL")?;
    let (header, b64) = rest.split_once(',').ok_or("Malformed data URL")?;
    let mime = header.split(';').next().unwrap_or("image/jpeg").to_string();
    let data = general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| e.to_string())?;
    store_cover(&covers_dir(&app)?, &CoverImage { data, mime })
        .ok_or_else(|| "Failed to write cover".to_string())
}

/// Copy an image file chosen by the user into the covers directory.
#[tauri::command]
pub async fn import_cover_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let src = Path::new(&path);
    let data = std::fs::read(src).map_err(|e| e.to_string())?;
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let mime = mime_for_ext(ext).to_string();
    store_cover(&covers_dir(&app)?, &CoverImage { data, mime })
        .ok_or_else(|| "Failed to write cover".to_string())
}

/// Delete stored covers that no book references any more. Returns how many were removed.
#[tauri::command]
pub async fn prune_covers(app: tauri::AppHandle, keep: Vec<String>) -> Result<u32, String> {
    let dir = covers_dir(&app)?;
    let keep: std::collections::HashSet<PathBuf> = keep.iter().map(PathBuf::from).collect();
    let mut removed = 0;
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.is_file() && !keep.contains(&path) && std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

// --- Asset protocol scope ---
//
// tauri.conf.json only grants the covers dir statically. Library folders are
// chosen at runtime, so they're added to the asset scope here: when a folder is
// scanned, and on startup for folders already in the library.

pub(crate) fn allow_asset_dir(app: &tauri::AppHandle, dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(()); // Missing folders are reported when playback fails
    }
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn allow_library_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        allow_asset_dir(&app, Path::new(&path))?;
    }
    Ok(())
}

/// Which of these paths exist on disk (used when relocating a moved book).
#[tauri::command]
pub async fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

// --- Backups ---
//
// The dialogs run here rather than in the page, so the frontend can only write
// or read a file the user has just picked.

/// Show a save dialog, then write `contents` to the chosen file. Returns the path, or None if cancelled.
fn save_with_dialog(
    app: &tauri::AppHandle,
    title: &str,
    filter: (&str, &[&str]),
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(choice) = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter.0, filter.1)
        .set_file_name(default_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = choice.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Ask where to save a backup, then write it. Returns the chosen path, or None if cancelled.
#[tauri::command]
pub async fn save_backup_file(
    app: tauri::AppHandle,
    contents: String,
    default_name: String,
) -> Result<Option<String>, String> {
    save_with_dialog(
        &app,
        "Save Audia backup",
        ("Audia backup", &["json"]),
        default_name,
        contents,
    )
}

/// Ask where to save a Markdown export (e.g. bookmarks), then write it.
#[tauri::command]
pub async fn save_markdown_file(
    app: tauri::AppHandle,
    contents: String,
    default_name: String,
) -> Result<Option<String>, String> {
    save_with_dialog(
        &app,
        "Export bookmarks",
        ("Markdown", &["md"]),
        default_name,
        contents,
    )
}

/// Ask for a backup file and return its contents, or None if cancelled.
#[tauri::command]
pub async fn open_backup_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(choice) = app
        .dialog()
        .file()
        .set_title("Restore Audia backup")
        .add_filter("Audia backup", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = choice.into_path().map_err(|e| e.to_string())?;
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > 512 << 20 {
        return Err("That file is too large to be an Audia backup".to_string());
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| e.to_string())
}

/// Read stored covers as data URLs so a backup can carry them. Only files inside
/// the covers directory are read; anything else is skipped.
#[tauri::command]
pub async fn read_covers(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let dir = std::fs::canonicalize(covers_dir(&app)?).map_err(|e| e.to_string())?;
    let mut out = std::collections::HashMap::new();
    for path in paths {
        let Ok(real) = std::fs::canonicalize(&path) else {
            continue;
        };
        if !real.starts_with(&dir) {
            continue;
        }
        let Ok(bytes) = std::fs::read(&real) else {
            continue;
        };
        let ext = real.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
        let b64 = general_purpose::STANDARD.encode(bytes);
        out.insert(path, format!("data:{};base64,{}", mime_for_ext(ext), b64));
    }
    Ok(out)
}
