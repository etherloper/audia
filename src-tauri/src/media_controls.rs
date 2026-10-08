//! System media controls: Windows SMTC, macOS Now Playing, Linux MPRIS.
//!
//! Registering with the OS directly (rather than relying on the WebView's Media
//! Session support) means media keys, headset buttons and the system media
//! flyout work even when Audia isn't focused. Events are forwarded to the
//! frontend as `media-control`; the frontend reports what's playing via
//! `update_media_controls`.

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig, SeekDirection,
};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct MediaControlsState {
    controls: Mutex<Option<MediaControls>>,
    /// Last metadata sent, so the cover isn't reloaded on every playback update
    last_metadata: Mutex<Option<(String, String, Option<String>)>>,
}

pub fn setup(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    let hwnd = match app.get_webview_window("main").map(|w| w.hwnd()) {
        Some(Ok(hwnd)) => Some(hwnd.0),
        _ => {
            log::warn!("Media controls: main window handle unavailable");
            return;
        }
    };
    #[cfg(not(target_os = "windows"))]
    let hwnd = None;

    let config = PlatformConfig {
        display_name: "Audia",
        dbus_name: "com.audia.app",
        hwnd,
    };
    let mut controls = match MediaControls::new(config) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Media controls unavailable: {e:?}");
            return;
        }
    };

    let handle = app.clone();
    let attached = controls.attach(move |event| {
        let action = match event {
            MediaControlEvent::Play => "play",
            MediaControlEvent::Pause | MediaControlEvent::Stop => "pause",
            MediaControlEvent::Toggle => "toggle",
            MediaControlEvent::Next => "next",
            MediaControlEvent::Previous => "previous",
            MediaControlEvent::Seek(SeekDirection::Forward)
            | MediaControlEvent::SeekBy(SeekDirection::Forward, _) => "forward",
            MediaControlEvent::Seek(SeekDirection::Backward)
            | MediaControlEvent::SeekBy(SeekDirection::Backward, _) => "back",
            MediaControlEvent::Raise => {
                crate::tray::show_main_window(&handle);
                return;
            }
            _ => return,
        };
        let _ = handle.emit("media-control", action);
    });
    if let Err(e) = attached {
        log::warn!("Media controls: couldn't attach handler: {e:?}");
        return;
    }

    if let Some(state) = app.try_state::<MediaControlsState>() {
        *state.controls.lock().unwrap_or_else(|e| e.into_inner()) = Some(controls);
        log::info!("System media controls registered");
    }
}

/// Tell the OS what's playing. `title` None means nothing is loaded.
#[tauri::command]
pub fn update_media_controls(
    state: tauri::State<'_, MediaControlsState>,
    title: Option<String>,
    artist: Option<String>,
    cover_path: Option<String>,
    playing: bool,
) -> Result<(), String> {
    let mut guard = state.controls.lock().map_err(|e| e.to_string())?;
    let Some(controls) = guard.as_mut() else {
        return Ok(()); // Not available on this system
    };

    let Some(title) = title else {
        controls
            .set_playback(MediaPlayback::Stopped)
            .map_err(|e| format!("{e:?}"))?;
        *state.last_metadata.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    };

    let artist = artist.unwrap_or_default();
    let key = (title.clone(), artist.clone(), cover_path.clone());
    let mut last = state.last_metadata.lock().map_err(|e| e.to_string())?;
    if last.as_ref() != Some(&key) {
        // Local covers need a file:// URL; covers found online are already https://
        let cover_url = cover_path.as_ref().map(|p| {
            if p.starts_with("http://") || p.starts_with("https://") {
                p.clone()
            } else {
                format!("file://{p}")
            }
        });
        controls
            .set_metadata(MediaMetadata {
                title: Some(&title),
                artist: Some(&artist),
                cover_url: cover_url.as_deref(),
                ..Default::default()
            })
            .map_err(|e| format!("{e:?}"))?;
        *last = Some(key);
    }

    let playback = if playing {
        MediaPlayback::Playing { progress: None }
    } else {
        MediaPlayback::Paused { progress: None }
    };
    controls
        .set_playback(playback)
        .map_err(|e| format!("{e:?}"))
}
