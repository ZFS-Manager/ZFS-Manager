//! Network guards and string hygiene for the module host API. Pure,
//! self-contained functions kept out of `runtime.rs` so the security-critical
//! logic (and its tests) lives in one place.

/// Truncates a String to at most `max_bytes`, on a UTF-8 char boundary.
/// `String::truncate` panics on a non-boundary index, and a panic inside a
/// host call aborts the whole process under wasmtime — never use it on
/// guest-controlled strings.
pub fn truncate_on_char_boundary(s: &mut String, max_bytes: usize) {
    if s.len() <= max_bytes {
        return;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s.truncate(end);
}

/// Removes control characters (newlines, etc.) so a module cannot forge log
/// lines or inject terminal escapes into the run history.
pub fn sanitize_log(message: &str) -> String {
    message
        .chars()
        .map(|c| if c.is_control() && c != '\t' { ' ' } else { c })
        .collect()
}

/// Checks a URL against the allowlist. Scheme must be http(s). Matching is on
/// (host, port): an allowlist entry `host:port` matches only that exact port;
/// a bare `host` entry matches only the scheme's default port (80/443) — it is
/// NOT a wildcard over all ports, so an entry for a LAN host cannot be abused
/// to reach other services (Postgres, SSH, …) on the same host.
pub fn check_allowlist(url: &str, allowlist: &[String]) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("scheme {:?} not allowed", parsed.scheme()));
    }
    let host = parsed.host_str().ok_or("url has no host")?.to_ascii_lowercase();
    let port = parsed.port_or_known_default().ok_or("url has no port")?;
    let is_default_port = parsed.port().is_none();

    let allowed = allowlist.iter().any(|entry| {
        let entry = entry.to_ascii_lowercase();
        // "host:port" entry → the numeric suffix after the last ':' is a port.
        if let Some((entry_host, entry_port)) = entry.rsplit_once(':') {
            if let Ok(entry_port) = entry_port.parse::<u16>() {
                return entry_host == host && entry_port == port;
            }
        }
        // Bare host entry → only the default port.
        entry == host && is_default_port
    });
    if allowed {
        Ok(parsed)
    } else {
        Err(format!("{host}:{port} is not on this module's allowlist"))
    }
}

/// Rejects a resolved target that is loopback, link-local (incl. the cloud
/// metadata endpoint 169.254.169.254), unspecified, multicast or broadcast.
/// Private LAN ranges are intentionally ALLOWED — reaching self-hosted LAN
/// services is the whole point of a module's http-fetch.
pub async fn reject_dangerous_ip(url: &reqwest::Url) -> Result<(), String> {
    use std::net::IpAddr;
    let host = url.host_str().ok_or("url has no host")?;
    let port = url.port_or_known_default().unwrap_or(443);

    let dangerous = |ip: &IpAddr| match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
                || v4.is_broadcast() || v4.is_multicast()
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified() || v6.is_multicast(),
    };

    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("cannot resolve {host}: {e}"))?;
    let mut any = false;
    for addr in addrs {
        any = true;
        if dangerous(&addr.ip()) {
            return Err(format!("{host} resolves to a forbidden address"));
        }
    }
    if !any {
        return Err(format!("{host} did not resolve"));
    }
    Ok(())
}

/// Extracts allowlist entries (host or host:port) from url-type config values.
pub fn hosts_from_config_urls(config: &serde_json::Value, url_keys: &[&str]) -> Vec<String> {
    let mut hosts = Vec::new();
    for key in url_keys {
        if let Some(raw) = config.get(key).and_then(|v| v.as_str()) {
            if let Ok(url) = reqwest::Url::parse(raw) {
                if let Some(host) = url.host_str() {
                    let entry = match url.port() {
                        Some(p) => format!("{host}:{p}"),
                        None => host.to_string(),
                    };
                    hosts.push(entry.to_ascii_lowercase());
                }
            }
        }
    }
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_exact_host() {
        let list = vec!["api.example.com".to_string()];
        assert!(check_allowlist("https://api.example.com/stats", &list).is_ok());
        assert!(check_allowlist("https://evil.com/", &list).is_err());
        assert!(check_allowlist("https://sub.api.example.com/", &list).is_err());
        assert!(check_allowlist("ftp://api.example.com/", &list).is_err());
    }

    #[test]
    fn allowlist_host_port() {
        let list = vec!["immich.local:2283".to_string()];
        assert!(check_allowlist("http://immich.local:2283/api", &list).is_ok());
        assert!(check_allowlist("http://immich.local/api", &list).is_err());
        assert!(check_allowlist("http://immich.local:9999/api", &list).is_err());
    }

    #[test]
    fn bare_host_entry_does_not_match_other_ports() {
        // Regression: a bare host entry must NOT be a wildcard over all ports.
        let list = vec!["immich.local".to_string()];
        assert!(check_allowlist("http://immich.local/api", &list).is_ok()); // default port 80
        assert!(check_allowlist("https://immich.local/api", &list).is_ok()); // default port 443
        assert!(check_allowlist("http://immich.local:5432/", &list).is_err()); // Postgres — blocked
        assert!(check_allowlist("http://immich.local:22/", &list).is_err()); // SSH — blocked
    }

    #[test]
    fn host_port_entry_matches_default_port_form() {
        // An explicit :443 entry matches a default-port https URL.
        let list = vec!["api.example.com:443".to_string()];
        assert!(check_allowlist("https://api.example.com/x", &list).is_ok());
        assert!(check_allowlist("http://api.example.com/x", &list).is_err()); // :80 not allowed
    }

    #[test]
    fn truncate_never_panics_on_multibyte() {
        // Byte MAX would fall inside a multibyte char; must not panic.
        let mut s = "ä".repeat(2000); // 4000 bytes, each 'ä' is 2 bytes
        truncate_on_char_boundary(&mut s, 2049);
        assert!(s.len() <= 2049);
        assert!(s.chars().all(|c| c == 'ä')); // no broken char
    }

    #[test]
    fn sanitize_log_strips_control_chars() {
        assert_eq!(sanitize_log("a\nb\r[fake] module x"), "a b [fake] module x");
        assert_eq!(sanitize_log("keep\ttab"), "keep\ttab");
    }

    #[test]
    fn hosts_from_urls() {
        let config = serde_json::json!({
            "immich_url": "http://immich.local:2283",
            "other": "not a url",
        });
        assert_eq!(
            hosts_from_config_urls(&config, &["immich_url", "other", "missing"]),
            vec!["immich.local:2283".to_string()]
        );
    }
}
