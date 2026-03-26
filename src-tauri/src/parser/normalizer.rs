use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use once_cell::sync::Lazy;
use regex::Regex;

use crate::errors::AppError;

static MULTI_SPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").expect("valid regex"));
static STRIP_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[^\p{L}\p{N}\s%/.,-]").expect("valid regex"));

#[derive(Debug, Clone, Default)]
pub struct NameNormalizer {
    alias_to_canonical: HashMap<String, String>,
}

impl NameNormalizer {
    pub fn from_aliases_file(path: impl Into<PathBuf>) -> Result<Self, AppError> {
        let path = path.into();
        if !Path::new(&path).exists() {
            return Ok(Self::default());
        }

        let raw = fs::read_to_string(path)?;
        let parsed: HashMap<String, Vec<String>> = serde_json::from_str(&raw)?;
        let mut alias_to_canonical = HashMap::new();

        for (canonical, aliases) in parsed {
            let normalized_canonical = normalize_base(&canonical);
            alias_to_canonical.insert(normalized_canonical.clone(), normalized_canonical.clone());
            for alias in aliases {
                alias_to_canonical.insert(normalize_base(&alias), normalized_canonical.clone());
            }
        }

        Ok(Self { alias_to_canonical })
    }

    pub fn normalize(&self, raw: &str) -> String {
        let normalized = normalize_base(raw);
        self.alias_to_canonical
            .get(&normalized)
            .cloned()
            .unwrap_or(normalized)
    }
}

pub fn normalize_base(value: &str) -> String {
    let lowered = value.trim().to_lowercase();
    let stripped = STRIP_RE.replace_all(&lowered, " ");
    MULTI_SPACE_RE.replace_all(stripped.trim(), " ").to_string()
}
