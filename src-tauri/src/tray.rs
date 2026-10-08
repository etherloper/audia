//! System tray icon with basic playback controls.
//!
//! Menu clicks are forwarded to the frontend as `tray-action` events (the player
//! lives there); the frontend reports state back via `update_tray`.

use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

const TRAY_ID: &str = "main";

pub struct TrayState {
    play_pause: MenuItem<Wry>,
    prev: MenuItem<Wry>,
    next: MenuItem<Wry>,
    mini: MenuItem<Wry>,
    sleep: MenuItem<Wry>,
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let play_pause = MenuItem::with_id(app, "play_pause", "Play", false, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev_chapter", "Previous chapter", false, None::<&str>)?;
    let next = MenuItem::with_id(app, "next_chapter", "Next chapter", false, None::<&str>)?;
    let mini = MenuItem::with_id(app, "toggle_mini", "Mini player", false, None::<&str>)?;
    let sleep = MenuItem::with_id(
        app,
        "sleep_extend",
        "Sleep timer +5 min",
        false,
        None::<&str>,
    )?;
    let show = MenuItem::with_id(app, "show", "Show Audia", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &play_pause,
            &prev,
            &next,
            &sleep,
            &mini,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Audia")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "toggle_mini" => {
                show_main_window(app);
                let _ = app.emit("tray-action", "toggle_mini");
            }
            "quit" => {
                // Give the frontend a moment to save progress, then exit regardless
                let _ = app.emit("tray-action", "quit");
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(2));
                    app.exit(0);
                });
            }
            id => {
                let _ = app.emit("tray-action", id);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    app.manage(TrayState {
        play_pause,
        prev,
        next,
        mini,
        sleep,
    });
    Ok(())
}

/// Called by the frontend whenever playback state changes.
#[tauri::command]
pub fn update_tray(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    title: Option<String>,
    playing: bool,
    mini: bool,
    sleep: bool,
) -> Result<(), String> {
    let has_book = title.is_some();
    state
        .play_pause
        .set_text(if playing { "Pause" } else { "Play" })
        .map_err(|e| e.to_string())?;
    state
        .mini
        .set_text(if mini { "Full window" } else { "Mini player" })
        .map_err(|e| e.to_string())?;
    for item in [&state.play_pause, &state.prev, &state.next, &state.mini] {
        item.set_enabled(has_book).map_err(|e| e.to_string())?;
    }
    // Only meaningful while a timed sleep timer is running
    state.sleep.set_enabled(sleep).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tooltip = match &title {
            Some(t) => format!("Audia — {t}"),
            None => "Audia".to_string(),
        };
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Exit the app (used by the tray's Quit once progress is saved).
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
