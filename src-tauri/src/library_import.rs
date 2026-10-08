//! Copying dropped files/folders into the user's library folder.
//!
//! The frontend first asks for a plan (`plan_library_import`) to show the user
//! what will be copied and how big it is, then calls `copy_into_library`, which
//! recomputes the plan (so destination names are fresh) and copies with progress
//! events. Originals are never modified or deleted.

use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::Emitter;
use walkdir::WalkDir;

use crate::commands::is_audio_path;

/// Shared cancel flag for the copy in progress.
#[derive(Default)]
pub struct ImportCancel(pub Arc<AtomicBool>);

#[derive(Debug, Clone)]
enum CopyUnit {
    /// Copy a whole folder to `<library>/<dest_name>`.
    Folder { src: PathBuf, dest_name: String },
    /// Copy a single file (an .m4b, which is a complete book) to `<library>/<dest_name>`.
    File { src: PathBuf, dest_name: String },
    /// Copy loose audio files into a new folder `<library>/<dest_name>/`.
    Files {
        srcs: Vec<PathBuf>,
        dest_name: String,
    },
}

impl CopyUnit {
    fn dest_name(&self) -> &str {
        match self {
            CopyUnit::Folder { dest_name, .. }
            | CopyUnit::File { dest_name, .. }
            | CopyUnit::Files { dest_name, .. } => dest_name,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PlannedItem {
    /// Name it will have inside the library folder
    pub name: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct SkippedItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ImportPlan {
    pub items: Vec<PlannedItem>,
    pub total_bytes: u64,
    /// True if at least one dropped path was already inside the library
    /// (nothing to copy for it — a rescan picks it up).
    pub has_items_in_library: bool,
    pub skipped: Vec<SkippedItem>,
}

#[derive(Debug, Serialize, Clone)]
struct ProgressEvent {
    copied_bytes: u64,
    total_bytes: u64,
    current: String,
}

#[derive(Debug, Serialize)]
pub struct CopyResult {
    pub copied: u32,
    pub cancelled: bool,
}

fn canonical(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

fn is_m4b(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("m4b"))
}

fn folder_stats(dir: &Path) -> (u64, u32) {
    let mut bytes = 0;
    let mut audio = 0;
    for entry in WalkDir::new(dir).follow_links(true).into_iter().flatten() {
        if entry.file_type().is_file() {
            bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
            if is_audio_path(entry.path()) {
                audio += 1;
            }
        }
    }
    (bytes, audio)
}

fn file_size(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

/// Pick a name that doesn't exist in `library` and hasn't been claimed by this plan.
fn unique_name(library: &Path, wanted: &str, claimed: &mut HashSet<String>) -> String {
    let path = Path::new(wanted);
    let (stem, ext) = match (path.file_stem(), path.extension()) {
        (Some(s), Some(e)) if !wanted.starts_with('.') => (
            s.to_string_lossy().to_string(),
            format!(".{}", e.to_string_lossy()),
        ),
        _ => (wanted.to_string(), String::new()),
    };
    let mut candidate = wanted.to_string();
    let mut n = 2;
    while library.join(&candidate).exists() || claimed.contains(&candidate.to_lowercase()) {
        candidate = format!("{stem} ({n}){ext}");
        n += 1;
    }
    claimed.insert(candidate.to_lowercase());
    candidate
}

struct BuiltPlan {
    units: Vec<(CopyUnit, u64)>,
    has_items_in_library: bool,
    skipped: Vec<SkippedItem>,
}

fn build_plan(paths: &[String], library: &Path) -> Result<BuiltPlan, String> {
    if !library.is_dir() {
        return Err("The library folder doesn't exist".to_string());
    }
    let library = canonical(library);
    let mut units = Vec::new();
    let mut skipped = Vec::new();
    let mut has_items_in_library = false;
    let mut claimed = HashSet::new();
    // Loose files grouped by their parent folder
    let mut loose: BTreeMap<PathBuf, Vec<PathBuf>> = BTreeMap::new();

    for raw in paths {
        let src = canonical(Path::new(raw));
        let skip = |reason: &str| SkippedItem {
            path: raw.clone(),
            reason: reason.to_string(),
        };

        if !src.exists() {
            skipped.push(skip("not found"));
            continue;
        }
        if src.starts_with(&library) {
            has_items_in_library = true;
            continue;
        }
        if library.starts_with(&src) {
            skipped.push(skip("contains the library folder"));
            continue;
        }

        if src.is_dir() {
            let (bytes, audio) = folder_stats(&src);
            if audio == 0 {
                skipped.push(skip("no audio files"));
                continue;
            }
            let name = src
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Audiobook".to_string());
            let dest_name = unique_name(&library, &name, &mut claimed);
            units.push((CopyUnit::Folder { src, dest_name }, bytes));
        } else if is_audio_path(&src) {
            let parent = src.parent().map(Path::to_path_buf).unwrap_or_default();
            loose.entry(parent).or_default().push(src);
        } else {
            skipped.push(skip("not an audio file"));
        }
    }

    for (parent, files) in loose {
        // A lone .m4b is a complete book and can sit at the library root.
        // Anything else needs its own folder, or the scanner would merge it with
        // other loose files at the root.
        if files.len() == 1 && is_m4b(&files[0]) {
            let src = files.into_iter().next().unwrap();
            let name = src.file_name().unwrap().to_string_lossy().to_string();
            let bytes = file_size(&src);
            let dest_name = unique_name(&library, &name, &mut claimed);
            units.push((CopyUnit::File { src, dest_name }, bytes));
        } else {
            let name = parent
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Audiobook".to_string());
            let bytes = files.iter().map(|f| file_size(f)).sum();
            let dest_name = unique_name(&library, &name, &mut claimed);
            units.push((
                CopyUnit::Files {
                    srcs: files,
                    dest_name,
                },
                bytes,
            ));
        }
    }

    Ok(BuiltPlan {
        units,
        has_items_in_library,
        skipped,
    })
}

#[tauri::command]
pub async fn plan_library_import(
    paths: Vec<String>,
    library: String,
) -> Result<ImportPlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let plan = build_plan(&paths, Path::new(&library))?;
        Ok(ImportPlan {
            total_bytes: plan.units.iter().map(|(_, b)| b).sum(),
            items: plan
                .units
                .iter()
                .map(|(u, bytes)| PlannedItem {
                    name: u.dest_name().to_string(),
                    bytes: *bytes,
                })
                .collect(),
            has_items_in_library: plan.has_items_in_library,
            skipped: plan.skipped,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_library_import(cancel: tauri::State<'_, ImportCancel>) {
    cancel.0.store(true, Ordering::SeqCst);
}

struct Copier<'a> {
    app: &'a tauri::AppHandle,
    cancel: &'a AtomicBool,
    copied: u64,
    total: u64,
    current: String,
    last_emit: Instant,
}

const CANCELLED: &str = "__cancelled__";

impl Copier<'_> {
    fn emit(&mut self, force: bool) {
        if force || self.last_emit.elapsed() >= Duration::from_millis(150) {
            self.last_emit = Instant::now();
            let _ = self.app.emit(
                "library-import-progress",
                ProgressEvent {
                    copied_bytes: self.copied,
                    total_bytes: self.total,
                    current: self.current.clone(),
                },
            );
        }
    }

    fn copy_file(&mut self, src: &Path, dest: &Path) -> Result<(), String> {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut input = File::open(src).map_err(|e| format!("{}: {e}", src.display()))?;
        // create_new: never overwrite something that appeared since planning
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dest)
            .map_err(|e| format!("{}: {e}", dest.display()))?;
        let mut buf = vec![0u8; 1 << 20];
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(CANCELLED.to_string());
            }
            let n = input.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            output.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            self.copied += n as u64;
            self.emit(false);
        }
        Ok(())
    }

    fn copy_unit(&mut self, unit: &CopyUnit, library: &Path) -> Result<(), String> {
        let dest_root = library.join(unit.dest_name());
        self.current = unit.dest_name().to_string();
        self.emit(true);
        match unit {
            CopyUnit::Folder { src, .. } => {
                std::fs::create_dir(&dest_root).map_err(|e| e.to_string())?;
                for entry in WalkDir::new(src).follow_links(true).into_iter().flatten() {
                    let rel = entry.path().strip_prefix(src).map_err(|e| e.to_string())?;
                    let dest = dest_root.join(rel);
                    if entry.file_type().is_dir() {
                        std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
                    } else if entry.file_type().is_file() {
                        self.copy_file(entry.path(), &dest)?;
                    }
                }
            }
            CopyUnit::File { src, .. } => self.copy_file(src, &dest_root)?,
            CopyUnit::Files { srcs, .. } => {
                std::fs::create_dir(&dest_root).map_err(|e| e.to_string())?;
                for src in srcs {
                    let name = src.file_name().ok_or("Invalid file name")?;
                    self.copy_file(src, &dest_root.join(name))?;
                }
            }
        }
        Ok(())
    }
}

fn remove_path(p: &Path) {
    if p.is_dir() {
        let _ = std::fs::remove_dir_all(p);
    } else {
        let _ = std::fs::remove_file(p);
    }
}

/// Copy dropped paths into the library. Emits `library-import-progress` events.
/// On cancel or error, everything this call created is removed again.
#[tauri::command]
pub async fn copy_into_library(
    app: tauri::AppHandle,
    cancel: tauri::State<'_, ImportCancel>,
    paths: Vec<String>,
    library: String,
) -> Result<CopyResult, String> {
    let cancel_flag = cancel.0.clone();
    cancel_flag.store(false, Ordering::SeqCst);

    tauri::async_runtime::spawn_blocking(move || {
        let library = canonical(Path::new(&library));
        let plan = build_plan(&paths, &library)?;
        let mut copier = Copier {
            app: &app,
            cancel: &cancel_flag,
            copied: 0,
            total: plan.units.iter().map(|(_, b)| b).sum(),
            current: String::new(),
            last_emit: Instant::now(),
        };

        let mut created: Vec<PathBuf> = Vec::new();
        for (unit, _) in &plan.units {
            created.push(library.join(unit.dest_name()));
            if let Err(e) = copier.copy_unit(unit, &library) {
                for p in &created {
                    remove_path(p);
                }
                return if e == CANCELLED {
                    log::info!("Library copy cancelled; removed partial copies");
                    Ok(CopyResult {
                        copied: 0,
                        cancelled: true,
                    })
                } else {
                    log::error!("Library copy failed: {e}");
                    Err(e)
                };
            }
        }
        copier.emit(true);
        log::info!(
            "Copied {} items ({} bytes) into {}",
            plan.units.len(),
            copier.copied,
            library.display()
        );
        Ok(CopyResult {
            copied: plan.units.len() as u32,
            cancelled: false,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("audia-test-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn file(&self, rel: &str, bytes: usize) -> PathBuf {
            let p = self.0.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, vec![0u8; bytes]).unwrap();
            p
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().to_string()
    }

    fn names(plan: &BuiltPlan) -> Vec<String> {
        plan.units
            .iter()
            .map(|(u, _)| u.dest_name().to_string())
            .collect()
    }

    #[test]
    fn folder_m4b_and_loose_files() {
        let t = TempDir::new("plan");
        let lib = t.0.join("library");
        std::fs::create_dir_all(&lib).unwrap();
        t.file("downloads/Dune/01.mp3", 10);
        t.file("downloads/Dune/02.mp3", 20);
        t.file("downloads/Dune/cover.jpg", 5);
        let m4b = t.file("downloads/Foundation.m4b", 30);
        let loose1 = t.file("downloads/Hyperion/a.mp3", 7);
        let loose2 = t.file("downloads/Hyperion/b.mp3", 8);
        let txt = t.file("downloads/notes.txt", 1);

        let plan = build_plan(
            &[
                s(&t.0.join("downloads/Dune")),
                s(&m4b),
                s(&loose1),
                s(&loose2),
                s(&txt),
            ],
            &lib,
        )
        .unwrap();

        let mut got = names(&plan);
        got.sort();
        assert_eq!(got, vec!["Dune", "Foundation.m4b", "Hyperion"]);
        let total: u64 = plan.units.iter().map(|(_, b)| b).sum();
        assert_eq!(total, 35 + 30 + 15);
        assert_eq!(plan.skipped.len(), 1);
        assert_eq!(plan.skipped[0].reason, "not an audio file");
    }

    #[test]
    fn single_mp3_gets_its_own_folder() {
        let t = TempDir::new("single");
        let lib = t.0.join("library");
        std::fs::create_dir_all(&lib).unwrap();
        let mp3 = t.file("Book One/track.mp3", 3);
        let plan = build_plan(&[s(&mp3)], &lib).unwrap();
        assert!(matches!(plan.units[0].0, CopyUnit::Files { .. }));
        assert_eq!(names(&plan), vec!["Book One"]);
    }

    #[test]
    fn name_clashes_get_suffixes() {
        let t = TempDir::new("clash");
        let lib = t.0.join("library");
        t.file("library/Dune/old.mp3", 1);
        t.file("library/Foundation.m4b", 1);
        t.file("a/Dune/01.mp3", 1);
        t.file("b/Dune/01.mp3", 1);
        let m4b = t.file("c/Foundation.m4b", 1);
        let plan = build_plan(
            &[s(&t.0.join("a/Dune")), s(&t.0.join("b/Dune")), s(&m4b)],
            &lib,
        )
        .unwrap();
        let mut got = names(&plan);
        got.sort();
        assert_eq!(got, vec!["Dune (2)", "Dune (3)", "Foundation (2).m4b"]);
    }

    #[test]
    fn skips_library_contents_ancestors_and_empty_folders() {
        let t = TempDir::new("skip");
        let lib = t.0.join("library");
        t.file("library/Existing/01.mp3", 1);
        t.file("empty/readme.txt", 1);
        let plan = build_plan(
            &[
                s(&lib.join("Existing")),
                s(&t.0),
                s(&t.0.join("empty")),
                s(&t.0.join("missing")),
            ],
            &lib,
        )
        .unwrap();
        assert!(plan.units.is_empty());
        assert!(plan.has_items_in_library);
        let mut reasons: Vec<_> = plan.skipped.iter().map(|s| s.reason.as_str()).collect();
        reasons.sort();
        assert_eq!(
            reasons,
            vec!["contains the library folder", "no audio files", "not found"]
        );
    }
}
