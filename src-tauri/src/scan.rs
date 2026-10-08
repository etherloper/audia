//! Scanning a folder for audiobooks.
//!
//! Tag reading is the slow part of a scan, so per-file results are cached in
//! `<app data>/scan_cache.json`, keyed by path and invalidated when a file's
//! size or modified time changes. A rescan of an unchanged library only stats files.

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::Manager;
use walkdir::WalkDir;

use crate::chapters::{EmbeddedChapter, read_chapters};
use crate::commands::{CoverImage, allow_asset_dir, covers_dir, is_audio_path, store_cover};

/// Bump when what we extract from files changes, so stale cache entries are re-read.
const CACHE_VERSION: u32 = 2; // 2: genre

/// Only one scan touches the cache file at a time.
static SCAN_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioFileMeta {
    pub title: String,
    pub author: String,
    pub album: String,
    pub narrator: Option<String>,
    pub description: Option<String>,
    /// Path of the embedded artwork after it's been written to the covers dir
    pub cover_art: Option<String>,
    pub file_path: String,
    pub duration_secs: f64,
    pub track_number: Option<u32>,
    pub start_offset_secs: f64,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    /// Raw genre tag, possibly several values ("Fantasy; Science Fiction")
    #[serde(default)]
    pub genre: Option<String>,
    /// Chapter markers embedded in this file (single-file books)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub chapters: Vec<EmbeddedChapter>,
}

#[derive(Debug, Serialize)]
pub struct ScannedBook {
    pub title: String,
    pub author: String,
    pub narrator: Option<String>,
    pub description: Option<String>,
    pub cover_art: Option<String>,
    pub folder_path: String,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub genre: Option<String>,
    pub files: Vec<AudioFileMeta>,
}

#[derive(Serialize, Deserialize, Default)]
struct ScanCache {
    version: u32,
    files: HashMap<String, CachedFile>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CachedFile {
    size: u64,
    modified_ms: u64,
    meta: AudioFileMeta,
}

fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("scan_cache.json"))
}

fn load_cache(path: &Path) -> ScanCache {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ScanCache>(&bytes).ok())
        .filter(|c| c.version == CACHE_VERSION)
        .unwrap_or(ScanCache {
            version: CACHE_VERSION,
            files: HashMap::new(),
        })
}

fn save_cache(path: &Path, cache: &ScanCache) {
    // Write then rename so a crash mid-write can't leave a corrupt cache
    let tmp = path.with_extension("json.tmp");
    if let Ok(bytes) = serde_json::to_vec(cache)
        && std::fs::write(&tmp, bytes).is_ok()
    {
        let _ = std::fs::rename(&tmp, path);
    }
}

fn file_stamp(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some((meta.len(), modified))
}

fn is_m4b(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("m4b"))
}

fn extract_metadata(path: &Path, covers_dir: &Path) -> Option<AudioFileMeta> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    let duration_secs = tagged_file.properties().duration().as_secs_f64();
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let chapters = read_chapters(path, duration_secs).unwrap_or_default();
    let file_path = path.to_string_lossy().to_string();

    let Some(tag) = tag else {
        return Some(AudioFileMeta {
            title: file_name,
            author: "Unknown".to_string(),
            album: parent_name,
            narrator: None,
            description: None,
            cover_art: None,
            file_path,
            duration_secs,
            track_number: None,
            start_offset_secs: 0.0,
            series: None,
            series_index: None,
            genre: None,
            chapters,
        });
    };

    let author = tag
        .artist()
        .map(|a| a.to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Narrator — try Composer first (common for audiobooks), then AlbumArtist
    let narrator = tag
        .get_string(&ItemKey::Composer)
        .or_else(|| tag.get_string(&ItemKey::AlbumArtist))
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty() && s != &author);

    let description = tag
        .get_string(&ItemKey::Comment)
        .or_else(|| tag.get_string(&ItemKey::Lyrics))
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());

    // Series — ContentGroup maps to TIT1/GRP1/©grp
    let series = tag
        .get_string(&ItemKey::ContentGroup)
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());

    // MovementNumber for series order, fall back to disk number
    let series_index = tag
        .get_string(&ItemKey::MovementNumber)
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| tag.disk().map(|d| d as f64));

    let genre = tag
        .genre()
        .map(|g| g.trim().to_string())
        .filter(|g| !g.is_empty());

    let cover_art = tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())
        .and_then(|p| {
            store_cover(
                covers_dir,
                &CoverImage {
                    data: p.data().to_vec(),
                    mime: p
                        .mime_type()
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_else(|| "image/jpeg".to_string()),
                },
            )
        });

    Some(AudioFileMeta {
        title: tag.title().map(|t| t.to_string()).unwrap_or(file_name),
        author,
        album: tag.album().map(|a| a.to_string()).unwrap_or(parent_name),
        narrator,
        description,
        cover_art,
        file_path,
        duration_secs,
        track_number: tag.track(),
        start_offset_secs: 0.0,
        series,
        series_index,
        genre,
        chapters,
    })
}

/// Read a file's metadata, using the cache when the file hasn't changed.
fn metadata_for(
    path: &Path,
    covers_dir: &Path,
    cache: &mut ScanCache,
    seen: &mut HashSet<String>,
) -> Option<AudioFileMeta> {
    let key = path.to_string_lossy().to_string();
    let (size, modified_ms) = file_stamp(path)?;
    seen.insert(key.clone());

    if let Some(hit) = cache.files.get(&key) {
        let cover_ok = hit
            .meta
            .cover_art
            .as_ref()
            .is_none_or(|c| Path::new(c).exists());
        if hit.size == size && hit.modified_ms == modified_ms && cover_ok {
            return Some(hit.meta.clone());
        }
    }

    let Some(meta) = extract_metadata(path, covers_dir) else {
        log::warn!("Couldn't read tags from {}", path.display());
        return None;
    };
    cache.files.insert(
        key,
        CachedFile {
            size,
            modified_ms,
            meta: meta.clone(),
        },
    );
    Some(meta)
}

/// Scan a folder for .nfo files and return the content of the first one found.
fn read_nfo_description(folder: &Path) -> Option<String> {
    for entry in std::fs::read_dir(folder).ok()?.flatten() {
        let path = entry.path();
        let is_nfo = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("nfo"));
        if is_nfo
            && path.is_file()
            && let Ok(content) = std::fs::read_to_string(&path)
        {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// A book that is one file: an .m4b, or a single .mp3/.m4a with chapter markers.
fn single_file_book(meta: AudioFileMeta) -> ScannedBook {
    let files = if meta.chapters.len() >= 2 {
        meta.chapters
            .iter()
            .map(|ch| AudioFileMeta {
                title: ch.title.clone(),
                description: None,
                duration_secs: ch.duration_secs,
                track_number: None,
                start_offset_secs: ch.start_secs,
                chapters: Vec::new(),
                ..meta.clone()
            })
            .collect()
    } else {
        vec![AudioFileMeta {
            chapters: Vec::new(),
            ..meta.clone()
        }]
    };

    let title = if meta.album == "Unknown" || meta.album.is_empty() {
        meta.title.clone()
    } else {
        meta.album.clone()
    };
    let path = Path::new(&meta.file_path);
    let folder = path.parent().unwrap_or(path);

    ScannedBook {
        title,
        author: meta.author,
        narrator: meta.narrator,
        // Prefer tag metadata, then an .nfo file in the same folder
        description: meta.description.or_else(|| read_nfo_description(folder)),
        cover_art: meta.cover_art,
        folder_path: folder.to_string_lossy().to_string(),
        series: meta.series,
        series_index: meta.series_index,
        genre: meta.genre,
        files,
    }
}

/// A book made of several files in one folder.
fn folder_book(dir: &Path, mut files: Vec<AudioFileMeta>) -> ScannedBook {
    // Sort by track number first, then by filename
    files.sort_by(|a, b| match (a.track_number, b.track_number) {
        (Some(ta), Some(tb)) => ta.cmp(&tb).then_with(|| a.file_path.cmp(&b.file_path)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.file_path.cmp(&b.file_path),
    });

    let title = match files[0].album.as_str() {
        "Unknown" | "" => dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string(),
        album => album.to_string(),
    };
    let author = files
        .iter()
        .find(|f| f.author != "Unknown")
        .map(|f| f.author.clone())
        .unwrap_or_else(|| "Unknown".to_string());

    ScannedBook {
        title,
        author,
        narrator: files.iter().find_map(|f| f.narrator.clone()),
        description: files
            .iter()
            .find_map(|f| f.description.clone())
            .or_else(|| read_nfo_description(dir)),
        cover_art: files.iter().find_map(|f| f.cover_art.clone()),
        folder_path: dir.to_string_lossy().to_string(),
        series: files.iter().find_map(|f| f.series.clone()),
        series_index: files.iter().find_map(|f| f.series_index),
        genre: files.iter().find_map(|f| f.genre.clone()),
        files: files
            .into_iter()
            .map(|f| AudioFileMeta {
                chapters: Vec::new(),
                ..f
            })
            .collect(),
    }
}

fn scan_blocking(folder: &Path, covers_dir: &Path, cache_file: &Path) -> Vec<ScannedBook> {
    let _guard = SCAN_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let started = std::time::Instant::now();
    let mut cache = load_cache(cache_file);
    let mut seen = HashSet::new();

    let mut books = Vec::new();
    let mut by_dir: BTreeMap<PathBuf, Vec<AudioFileMeta>> = BTreeMap::new();

    for entry in WalkDir::new(folder)
        .follow_links(true)
        .into_iter()
        .flatten()
    {
        let path = entry.path();
        if !entry.file_type().is_file() || !is_audio_path(path) {
            continue;
        }
        let Some(meta) = metadata_for(path, covers_dir, &mut cache, &mut seen) else {
            continue;
        };
        if is_m4b(path) {
            // Each .m4b is its own book
            books.push(single_file_book(meta));
        } else {
            let parent = path.parent().unwrap_or(folder).to_path_buf();
            by_dir.entry(parent).or_default().push(meta);
        }
    }

    for (dir, files) in by_dir {
        if files.len() == 1 && files[0].chapters.len() >= 2 {
            books.push(single_file_book(files.into_iter().next().unwrap()));
        } else {
            books.push(folder_book(&dir, files));
        }
    }

    // Forget files under this folder that no longer exist; keep entries for other folders
    cache
        .files
        .retain(|path, _| seen.contains(path) || !Path::new(path).starts_with(folder));
    save_cache(cache_file, &cache);

    log::info!(
        "Scanned {} in {:?}: {} books from {} audio files",
        folder.display(),
        started.elapsed(),
        books.len(),
        seen.len()
    );
    books.sort_by(|a, b| a.title.cmp(&b.title));
    books
}

#[tauri::command]
pub async fn scan_folder(app: tauri::AppHandle, path: String) -> Result<Vec<ScannedBook>, String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        return Err("Not a valid directory".to_string());
    }
    allow_asset_dir(&app, &folder)?;
    let covers_dir = covers_dir(&app)?;
    let cache_file = cache_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || scan_blocking(&folder, &covers_dir, &cache_file))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Manual end-to-end check: AUDIA_SCAN_DIR=<library> cargo test scan_real_library -- --ignored --nocapture
    /// Expects a `covers_out` folder inside the library for extracted artwork.
    #[test]
    #[ignore]
    fn scan_real_library() {
        let dir = PathBuf::from(std::env::var("AUDIA_SCAN_DIR").unwrap());
        let covers = dir.join("covers_out");
        let cache = dir.join("scan_cache.json");
        let _ = std::fs::remove_file(&cache);
        for pass in ["cold", "cached"] {
            let start = std::time::Instant::now();
            let books = scan_blocking(&dir, &covers, &cache);
            println!("--- {pass} scan: {:?}", start.elapsed());
            for b in &books {
                println!("{} by {} ({} chapters)", b.title, b.author, b.files.len());
                for f in &b.files {
                    println!(
                        "    {:<28} start {:>5.1}s  len {:>5.1}s",
                        f.title, f.start_offset_secs, f.duration_secs
                    );
                }
            }
        }
        let cached = load_cache(&cache);
        println!("cache entries: {}", cached.files.len());
    }
}
