mod chapters;
mod commands;
mod library_import;
mod logging;
mod media_controls;
mod scan;
mod tray;
mod watcher;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT 'Unknown',
                cover_art TEXT,
                folder_path TEXT NOT NULL,
                total_duration_secs REAL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                chapter_index INTEGER NOT NULL,
                title TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration_secs REAL DEFAULT 0,
                UNIQUE(book_id, chapter_index)
            );

            CREATE TABLE IF NOT EXISTS progress (
                book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
                chapter_index INTEGER NOT NULL DEFAULT 0,
                position_secs REAL NOT NULL DEFAULT 0,
                playback_rate REAL NOT NULL DEFAULT 1.0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                chapter_index INTEGER NOT NULL,
                position_secs REAL NOT NULL,
                label TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "#,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        // Must be registered first. A second launch hands over to the running copy
        // (two copies would both write progress to the same database) and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:audia.db", migrations)
                .build(),
        )
        .plugin(logging::plugin())
        .manage(library_import::ImportCancel::default())
        .manage(watcher::LibraryWatcher::default())
        .manage(media_controls::MediaControlsState::default())
        .plugin(tauri_plugin_dialog::init())
        // Updates come from GitHub Releases (see plugins.updater in tauri.conf.json);
        // process is for restarting into the new version afterwards
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            tray::setup(app.handle())?;
            media_controls::setup(app.handle());
            // The window starts hidden so the frontend can restore its saved size and
            // position first. If that never happens (e.g. a frontend error), show it anyway.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main")
                    && !window.is_visible().unwrap_or(true)
                    && !window.is_minimized().unwrap_or(false)
                {
                    let _ = window.show();
                }
            });
            log::info!("Audia {} starting", app.package_info().version);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan::scan_folder,
            commands::save_cover_data_url,
            commands::import_cover_file,
            commands::prune_covers,
            commands::allow_library_paths,
            commands::paths_exist,
            commands::save_backup_file,
            commands::save_markdown_file,
            commands::open_backup_file,
            commands::read_covers,
            library_import::plan_library_import,
            library_import::copy_into_library,
            library_import::cancel_library_import,
            tray::update_tray,
            tray::quit_app,
            watcher::watch_library,
            logging::log_from_frontend,
            logging::open_log_folder,
            media_controls::update_media_controls
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
