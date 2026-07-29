use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::warn;

use super::manifest::{Manifest, MAX_MANIFEST_BYTES, MAX_WASM_BYTES};

pub const DEFAULT_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/ZFS-Manager/ZFS-Manager/main/registry/index.json";

const MAX_INDEX_BYTES: usize = 1024 * 1024;

/// One module as listed in a registry index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub repository_url: String,
    pub manifest_url: String,
    pub wasm_url: String,
    /// Hex SHA-256 of the wasm artifact — the trust anchor of an install.
    pub wasm_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryIndex {
    pub modules: Vec<RegistryEntry>,
}

fn registry_http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_capped(client: &reqwest::Client, url: &str, cap: usize) -> Result<Vec<u8>, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid url {url:?}: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("unsupported scheme in {url:?}"));
    }
    let mut response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("fetch {url} failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch {url} failed: {e}"))?;
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() > cap {
            return Err(format!("{url} exceeds {cap} bytes"));
        }
    }
    Ok(body)
}

/// Downloads and parses one registry index.
pub async fn fetch_index(url: &str) -> Result<RegistryIndex, String> {
    let client = registry_http()?;
    let body = fetch_capped(&client, url, MAX_INDEX_BYTES).await?;
    let index: RegistryIndex =
        serde_json::from_slice(&body).map_err(|e| format!("invalid registry index: {e}"))?;
    for entry in &index.modules {
        if entry.id.is_empty() || entry.wasm_sha256.len() != 64 {
            return Err(format!("registry entry {:?} is malformed", entry.id));
        }
    }
    Ok(index)
}

/// A fully downloaded, checksum-verified module package.
pub struct ModulePackage {
    pub manifest: Manifest,
    pub wasm: Vec<u8>,
    pub wasm_sha256: String,
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// Downloads manifest + wasm for a registry entry and verifies the checksum.
pub async fn download_package(entry: &RegistryEntry) -> Result<ModulePackage, String> {
    let client = registry_http()?;

    let manifest_bytes = fetch_capped(&client, &entry.manifest_url, MAX_MANIFEST_BYTES).await?;
    let manifest_toml = String::from_utf8(manifest_bytes).map_err(|_| "manifest is not UTF-8")?;
    let manifest = Manifest::parse(&manifest_toml)?;
    if manifest.id != entry.id {
        return Err(format!(
            "manifest id {:?} does not match registry id {:?}",
            manifest.id, entry.id
        ));
    }

    let wasm = fetch_capped(&client, &entry.wasm_url, MAX_WASM_BYTES).await?;
    let digest = sha256_hex(&wasm);
    if !digest.eq_ignore_ascii_case(&entry.wasm_sha256) {
        warn!("module {}: checksum mismatch (expected {}, got {digest})", entry.id, entry.wasm_sha256);
        return Err("wasm checksum does not match the registry index".into());
    }

    Ok(ModulePackage {
        manifest,
        wasm,
        wasm_sha256: digest,
    })
}

/// Directory where installed wasm artifacts live.
pub fn modules_dir() -> String {
    format!("{}/modules", crate::startup::data_dir())
}

pub fn wasm_path(module_id: &str) -> String {
    format!("{}/{module_id}.wasm", modules_dir())
}
