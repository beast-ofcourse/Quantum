use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionLocation {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub name: String,
    pub kind: String,
}

static PATTERNS: &[(char, &[&str])] = &[
    ('r', &["fn ", "struct ", "enum ", "trait ", "impl ", "pub fn ", "pub struct ", "pub enum ", "pub trait ", "pub type ", "type ", "const ", "pub const ", "static ", "pub static ", "macro_rules!"]),
    ('p', &["def ", "class ", "async def ", "def __"]),
    ('j', &["function ", "const ", "let ", "var ", "class ", "async function "]),
    ('g', &["func ", "func (*", "type ", "struct ", "func \\w+\\s*<"]),
    ('s', &["fun ", "object ", "class ", "case class ", "sealed trait ", "abstract class ", "trait ", "enum "]),
    ('k', &["fun ", "class ", "data class ", "sealed class ", "abstract class ", "interface ", "enum class ", "object "]),
    ('c', &["int ", "void ", "char ", "float ", "double ", "long ", "short "]),
];

fn language_for_ext(ext: &str) -> Option<Vec<&'static str>> {
    let patterns = match ext {
        "rs" => PATTERNS[0].1.to_vec(),
        "py" => PATTERNS[1].1.to_vec(),
        "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs" => PATTERNS[2].1.to_vec(),
        "go" => PATTERNS[3].1.to_vec(),
        "scala" | "sc" => PATTERNS[4].1.to_vec(),
        "kt" | "kts" => PATTERNS[5].1.to_vec(),
        "c" | "h" | "cpp" | "hpp" | "cc" | "cxx" => PATTERNS[6].1.to_vec(),
        "rb" => vec!["def ", "class ", "module "],
        "php" => vec!["function ", "class ", "interface ", "trait ", "abstract class "],
        "swift" => vec!["func ", "class ", "struct ", "enum ", "protocol ", "extension "],
        "zig" => vec!["fn ", "pub fn "],
        "ex" | "exs" => vec!["def ", "defmodule ", "defp "],
        "lua" => vec!["function ", "local function "],
        "sh" | "bash" | "zsh" => vec!["function ", "() {"],
        "r" | "R" => vec!["<- function", "function(", "setGeneric"],
        "dart" => vec!["void ", "int ", "String ", "class ", "typedef "],
        _ => return None,
    };
    Some(patterns)
}

#[tauri::command]
pub async fn find_definitions(
    root: String,
    symbol: String,
    path: Option<String>,
) -> Result<Vec<DefinitionLocation>, String> {
    if symbol.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let ext_filter = path.as_ref().and_then(|p| {
        std::path::Path::new(p)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
    });

    let patterns = ext_filter.as_ref().and_then(|e| language_for_ext(e));
    let patterns = match patterns {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules"
                    | ".git"
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
            )
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let file_path = entry.path();
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        if let Some(ref filter) = ext_filter {
            if ext.as_deref() != Some(filter.as_str()) {
                continue;
            }
        }

        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (i, line_str) in content.lines().enumerate() {
            for prefix in &patterns {
                let pattern_str = if prefix.contains(&symbol) {
                    prefix.replace(&symbol, "__SYMBOL__")
                } else {
                    continue;
                };
                if !line_str.contains(&pattern_str.replace("__SYMBOL__", &symbol)) {
                    continue;
                }
                if let Some(col) = line_str.find(&pattern_str.replace("__SYMBOL__", &symbol)) {
                    let rel_path = file_path
                        .strip_prefix(&root)
                        .unwrap_or(file_path)
                        .to_string_lossy()
                        .trim_start_matches(std::path::MAIN_SEPARATOR_STR)
                        .to_string();
                    results.push(DefinitionLocation {
                        path: rel_path,
                        line: (i + 1) as u32,
                        column: col as u32 + 1,
                        name: symbol.clone(),
                        kind: prefix.trim().trim_end_matches(' ').to_string(),
                    });
                    break;
                }
            }
        }
    }

    Ok(results)
}
