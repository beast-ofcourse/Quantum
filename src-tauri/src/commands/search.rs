use regex::Regex;
use serde::{Deserialize, Serialize};
use std::process::Command;
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn cmd(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new(program);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    }
    #[cfg(not(target_os = "windows"))]
    Command::new(program)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub include_patterns: Option<Vec<String>>,
    pub exclude_patterns: Option<Vec<String>>,
    pub max_results: Option<u32>,
    pub case_sensitive: Option<bool>,
    pub whole_word: Option<bool>,
    pub use_regex: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub line_content: String,
    pub match_length: u32,
}

fn is_git_repo(root: &str) -> bool {
    let mut c = cmd("git");
    c.args(["rev-parse", "--git-dir"]);
    c.current_dir(root);
    c.output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn compile_search_pattern<'a>(
    query: &'a str,
    case_sensitive: bool,
    use_regex: bool,
) -> Result<Box<dyn RegexSearch + 'a>, String> {
    if use_regex {
        let mut pattern = query.to_string();
        if !case_sensitive {
            pattern = format!("(?i){}", pattern);
        }
        let re = Regex::new(&pattern)
            .map_err(|e| format!("Invalid regex: {}", e))?;
        Ok(Box::new(RegexSearcher(re)))
    } else {
        Ok(Box::new(PlainSearcher {
            query: query.to_string(),
            lower_query: query.to_lowercase(),
            case_sensitive,
        }))
    }
}

trait RegexSearch {
    fn find(&self, haystack: &str) -> Option<(usize, usize)>;
}

struct RegexSearcher(Regex);

impl RegexSearch for RegexSearcher {
    fn find(&self, haystack: &str) -> Option<(usize, usize)> {
        self.0.find(haystack).map(|m| (m.start(), m.len()))
    }
}

struct PlainSearcher {
    query: String,
    lower_query: String,
    case_sensitive: bool,
}

impl RegexSearch for PlainSearcher {
    fn find(&self, haystack: &str) -> Option<(usize, usize)> {
        let hay = if self.case_sensitive {
            haystack.to_string()
        } else {
            haystack.to_lowercase()
        };
        let q = if self.case_sensitive {
            &self.query
        } else {
            &self.lower_query
        };
        hay.find(q).map(|pos| (pos, self.query.len()))
    }
}

fn is_whole_word(haystack: &str, pos: usize, word_len: usize) -> bool {
    let bytes = haystack.as_bytes();
    let left_ok = pos == 0 || !bytes[pos - 1].is_ascii_alphanumeric();
    let right_ok = pos + word_len >= haystack.len()
        || !bytes[pos + word_len].is_ascii_alphanumeric();
    left_ok && right_ok
}

fn search_line(
    line: &str,
    searcher: &dyn RegexSearch,
    whole_word: bool,
) -> Option<(usize, usize)> {
    let mut offset = 0;
    loop {
        match searcher.find(&line[offset..]) {
            Some((col, len)) => {
                let abs_col = offset + col;
                if !whole_word || is_whole_word(line, abs_col, len) {
                    return Some((abs_col, len));
                }
                offset = abs_col + 1;
                if offset >= line.len() {
                    return None;
                }
            }
            None => return None,
        }
    }
}

fn search_with_git_grep(
    root: &str,
    query: &str,
    options: &SearchOptions,
) -> Result<Vec<SearchMatch>, String> {
    let mut args: Vec<String> = vec![
        "-C".into(),
        root.into(),
        "grep".into(),
        "--line-number".into(),
        "--column".into(),
        "--no-color".into(),
        "-I".into(),
    ];
    if !options.case_sensitive.unwrap_or(false) {
        args.push("-i".into());
    }
    if options.whole_word.unwrap_or(false) {
        args.push("-w".into());
    }
    if options.use_regex.unwrap_or(false) {
        args.push("-E".into());
    } else {
        args.push("-F".into());
    }
    if let Some(ref patterns) = options.exclude_patterns {
        for p in patterns {
            args.push(format!("--exclude-dir={}", p));
        }
    }
    if let Some(ref patterns) = options.include_patterns {
        for p in patterns {
            args.push(format!("--include={}", p));
        }
    }
    args.push(query.into());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut c = cmd("git");
    c.args(&refs);
    let output = c
        .output()
        .map_err(|e| format!("git grep failed: {}", e))?;
    if !output.status.success() {
        let msg = String::from_utf8_lossy(&output.stderr);
        if msg.contains("no matches") {
            return Ok(Vec::new());
        }
        let err_msg = if msg.is_empty() {
            "git grep failed".to_string()
        } else {
            msg.trim().to_string()
        };
        return Err(err_msg);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let max_results = options.max_results.unwrap_or(1000) as usize;
    let case_sensitive = options.case_sensitive.unwrap_or(false);
    let whole_word = options.whole_word.unwrap_or(false);
    let use_regex = options.use_regex.unwrap_or(false);

    let searcher = compile_search_pattern(query, case_sensitive, use_regex)?;

    let mut results = Vec::new();
    for line in stdout.lines() {
        if results.len() >= max_results {
            break;
        }
        let parts: Vec<&str> = line.splitn(4, ':').collect();
        if parts.len() < 4 {
            continue;
        }
        let line_num = match parts.get(1).and_then(|s| s.parse::<u32>().ok()) {
            Some(n) => n,
            None => continue,
        };
        let _col_num = match parts.get(2).and_then(|s| s.parse::<u32>().ok()) {
            Some(n) => n,
            None => continue,
        };
        let content = parts[3];
        let match_len = search_line(content, searcher.as_ref(), whole_word)
            .map(|(_, len)| len as u32)
            .unwrap_or(query.len() as u32);

        results.push(SearchMatch {
            path: parts[0].to_string(),
            line: line_num,
            column: _col_num,
            line_content: content.to_string(),
            match_length: match_len,
        });
    }
    Ok(results)
}

fn search_basic(
    root: &str,
    query: &str,
    options: &SearchOptions,
) -> Result<Vec<SearchMatch>, String> {
    let max_results = options.max_results.unwrap_or(1000) as usize;
    let case_sensitive = options.case_sensitive.unwrap_or(false);
    let whole_word = options.whole_word.unwrap_or(false);
    let use_regex = options.use_regex.unwrap_or(false);
    let exclude: Vec<String> = options
        .exclude_patterns
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.replace('/', std::path::MAIN_SEPARATOR_STR))
        .collect();
    let include: Option<Vec<String>> = options
        .include_patterns
        .clone()
        .map(|patterns| {
            patterns
                .into_iter()
                .map(|p| p.replace('/', std::path::MAIN_SEPARATOR_STR))
                .collect()
        });

    let searcher = compile_search_pattern(query, case_sensitive, use_regex)?;

    let mut results = Vec::new();
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !exclude.iter().any(|p| name.as_ref() == p.as_str())
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if let Some(ref incl) = include {
            if !incl.iter().any(|p| {
                let normalized = p.trim_start_matches('*').trim_start_matches('.');
                ext == normalized || path.to_string_lossy().contains(p.as_str())
            }) {
                continue;
            }
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for (i, line_str) in content.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }
            if let Some((col, match_len)) = search_line(line_str, searcher.as_ref(), whole_word) {
                let rel_path = path
                    .strip_prefix(root)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .trim_start_matches(std::path::MAIN_SEPARATOR_STR)
                    .to_string();
                results.push(SearchMatch {
                    path: rel_path,
                    line: (i + 1) as u32,
                    column: col as u32 + 1,
                    line_content: line_str.to_string(),
                    match_length: match_len as u32,
                });
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn search_in_files(
    root: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<SearchMatch>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let opts = options.unwrap_or_default();
    if is_git_repo(&root) {
        search_with_git_grep(&root, &query, &opts)
    } else {
        search_basic(&root, &query, &opts)
    }
}

#[tauri::command]
pub async fn replace_in_files(
    root: String,
    query: String,
    replace_with: String,
    options: Option<SearchOptions>,
) -> Result<u32, String> {
    if query.trim().is_empty() {
        return Ok(0);
    }
    let opts = options.unwrap_or_default();
    let case_sensitive = opts.case_sensitive.unwrap_or(false);
    let whole_word = opts.whole_word.unwrap_or(false);
    let use_regex = opts.use_regex.unwrap_or(false);
    let max_results = opts.max_results.unwrap_or(1000) as usize;
    let exclude: Vec<String> = opts
        .exclude_patterns
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.replace('/', std::path::MAIN_SEPARATOR_STR))
        .collect();

    let searcher = compile_search_pattern(&query, case_sensitive, use_regex)?;
    let mut total_replaced: u32 = 0;

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !exclude.iter().any(|p| name.as_ref() == p.as_str())
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let lines: Vec<&str> = content.lines().collect();
        let mut has_match = false;
        let mut new_lines: Vec<String> = Vec::with_capacity(lines.len());

        for line_str in &lines {
            if total_replaced as usize >= max_results {
                break;
            }
            let mut line = (*line_str).to_string();
            let mut offset = 0;
            loop {
                if total_replaced as usize >= max_results {
                    break;
                }
                let remaining = &line[offset..];
                match search_line(remaining, searcher.as_ref(), whole_word) {
                    Some((col, match_len)) => {
                        let abs_col = offset + col;
                        let before = line[..abs_col].to_string();
                        let after = line[abs_col + match_len..].to_string();
                        line = format!("{}{}{}", before, replace_with, after);
                        offset = before.len() + replace_with.len();
                        total_replaced += 1;
                        has_match = true;
                    }
                    None => break,
                }
            }
            new_lines.push(line);
        }

        if has_match {
            let result = new_lines.join("\n");
            let _ = std::fs::write(path, result);
        }
    }

    Ok(total_replaced)
}
