use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReadDirResult {
    pub entries: Vec<FileEntry>,
    pub gitignore: Option<String>,
    pub truncated: bool,
}

const MAX_WALK_ENTRIES: usize = 20_000;

fn build_entry(path: &Path) -> Option<FileEntry> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())?;
    Some(FileEntry {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
    })
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.starts_with('.') && s != "." && s != "..")
        .unwrap_or(false)
}

fn walk_dir(path: &Path, max_depth: u32, include_hidden: bool) -> (Vec<FileEntry>, bool) {
    let mut entries: Vec<FileEntry> = Vec::new();
    let walker = WalkDir::new(path)
        .min_depth(1)
        .max_depth(max_depth as usize)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| include_hidden || !is_hidden(e.path()));
    for entry in walker.flatten() {
        if entries.len() >= MAX_WALK_ENTRIES {
            return (entries, true);
        }
        if let Some(fe) = build_entry(entry.path()) {
            entries.push(fe);
        }
    }
    (entries, false)
}

fn read_gitignore(root: &Path) -> Option<String> {
    let gi = root.join(".gitignore");
    std::fs::read_to_string(gi).ok()
}

fn map_io_err(e: std::io::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn read_directory(
    path: String,
    max_depth: u32,
    include_hidden: Option<bool>,
) -> Result<ReadDirResult, String> {
    let include_hidden = include_hidden.unwrap_or(false);
    let root = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        if !root.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        let meta = std::fs::metadata(&root).map_err(map_io_err)?;
        if !meta.is_dir() {
            return Err(format!("Path is not a directory: {}", path));
        }
        let (entries, truncated) = walk_dir(&root, max_depth, include_hidden);
        let gitignore = read_gitignore(&root);
        Ok(ReadDirResult { entries, gitignore, truncated })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || std::fs::read_to_string(&p).map_err(map_io_err))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(map_io_err)?;
            }
        }
        std::fs::write(&p, content).map_err(map_io_err)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(map_io_err)?;
        }
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&p)
        {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                Err(format!("File already exists: {}", path))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || std::fs::create_dir_all(&p).map_err(map_io_err))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = new.parent() {
            std::fs::create_dir_all(parent).map_err(map_io_err)?;
        }
        std::fs::rename(&old, &new).map_err(map_io_err)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn delete_entry(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        let meta = std::fs::symlink_metadata(&p).map_err(map_io_err)?;
        if meta.is_dir() {
            std::fs::remove_dir_all(&p).map_err(map_io_err)
        } else {
            std::fs::remove_file(&p).map_err(map_io_err)
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn resolve_home() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "Could not resolve home directory".to_string())
}

#[tauri::command]
pub async fn stat(path: String) -> Result<FileEntry, String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        let meta = std::fs::symlink_metadata(&p).map_err(map_io_err)?;
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| p.to_string_lossy().into_owned());
        Ok(FileEntry {
            name,
            path: p.to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || Ok(p.exists()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || {
        let is_dir = p.is_dir();
        let target = if is_dir {
            p
        } else {
            p.parent()
                .map(|x| x.to_path_buf())
                .unwrap_or(p.clone())
        };
        let target_str = target.to_string_lossy().to_string();

        let result: Result<std::process::Child, std::io::Error> = if cfg!(target_os = "windows") {
            let mut cmd = std::process::Command::new("explorer");
            if is_dir {
                cmd.arg(&target_str);
            } else {
                cmd.arg(format!("/select,{}", target_str));
            }
            cmd.spawn()
        } else if cfg!(target_os = "macos") {
            let mut cmd = std::process::Command::new("open");
            if is_dir {
                cmd.arg(&target_str);
            } else {
                cmd.arg("-R").arg(&target_str);
            }
            cmd.spawn()
        } else {
            std::process::Command::new("xdg-open").arg(&target_str).spawn()
        };

        result.map(|_| ()).map_err(map_io_err)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn list_files(root: String) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(&root);
    tauri::async_runtime::spawn_blocking(move || {
        if !root_path.exists() {
            return Err("Root path does not exist".to_string());
        }
        let mut files = Vec::new();
        let walker = WalkDir::new(&root_path)
            .min_depth(1)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                if name.starts_with('.') && name != "." && name != ".." {
                    return false;
                }
                if e.file_type().is_dir() {
                    return !matches!(
                        name.as_ref(),
                        "node_modules"
                            | "target"
                            | "build"
                            | "dist"
                            | ".next"
                            | ".cache"
                            | "vendor"
                            | ".venv"
                            | "env"
                            | "bin"
                            | "obj"
                            | ".svelte-kit"
                            | ".nuxt"
                            | "__pycache__"
                            | ".git"
                            | ".hg"
                            | ".svn"
                    );
                }
                true
            });
        for entry in walker.flatten() {
            if entry.file_type().is_file() {
                if let Ok(rel_path) = entry.path().strip_prefix(&root_path) {
                    files.push(rel_path.to_string_lossy().into_owned());
                }
            }
        }
        Ok(files)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

