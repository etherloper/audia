//! Watching the library folder for changes.
//!
//! Emits `library-changed` (with the watched path) a few seconds after file
//! activity settles, so a large copy triggers one rescan rather than hundreds.

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

#[derive(Default)]
pub struct LibraryWatcher(Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Start watching `path` (replacing any previous watch). An empty path stops watching.
#[tauri::command]
pub fn watch_library(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryWatcher>,
    path: String,
) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    *slot = None; // dropping the old debouncer stops it
    if path.is_empty() {
        return Ok(());
    }

    let root = PathBuf::from(&path);
    let emit_path = path.clone();
    let mut debouncer = new_debouncer(
        Duration::from_secs(3),
        move |result: DebounceEventResult| {
            if let Err(e) = &result {
                log::warn!("Library watcher error: {e:?}");
            }
            if let Ok(events) = result {
                // Ignore our own bookkeeping files if the library ever contains them
                if events
                    .iter()
                    .any(|e| !e.path.to_string_lossy().ends_with(".tmp"))
                {
                    let _ = app.emit("library-changed", &emit_path);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *slot = Some(debouncer);
    log::info!("Watching library folder {path}");
    Ok(())
}
