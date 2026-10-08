//! Logging. Written to a rotating file in the app's log folder in every build
//! (and to stdout in development), so problems in a release build can be diagnosed.

use log::LevelFilter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let mut targets = vec![Target::new(TargetKind::LogDir {
        file_name: Some("audia".into()),
    })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets(targets)
        .level(if cfg!(debug_assertions) {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        })
        // Chatty dependencies: sqlx logs every query at info level
        .level_for("sqlx", LevelFilter::Warn)
        .level_for("tao", LevelFilter::Warn)
        .level_for("wry", LevelFilter::Warn)
        .level_for("notify", LevelFilter::Warn)
        .level_for("tracing", LevelFilter::Warn)
        .max_file_size(2 * 1024 * 1024)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

/// Frontend messages and errors go into the same log file.
#[tauri::command]
pub fn log_from_frontend(level: String, message: String) {
    let message: String = message.chars().take(4000).collect();
    match level.as_str() {
        "error" => log::error!(target: "frontend", "{message}"),
        "warn" => log::warn!(target: "frontend", "{message}"),
        _ => log::info!(target: "frontend", "{message}"),
    }
}

/// Open the log folder in the system file manager.
#[tauri::command]
pub fn open_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
