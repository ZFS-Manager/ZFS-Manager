use crate::error::ApiError;
use tokio::process::Command;
use tracing::debug;

const ALLOWED_ZFS: &[&str] = &[
    "list", "create", "destroy", "get", "set", "snapshot", "rollback", "clone",
    "rename", "mount", "unmount", "send", "recv", "diff", "upgrade", "allow",
    "unallow", "hold", "release", "inherit", "promote", "rewrite",
];

const ALLOWED_ZPOOL: &[&str] = &[
    "list", "status", "create", "destroy", "export", "import", "scrub", "history",
    "iostat", "upgrade", "online", "offline", "replace", "remove", "add", "split",
    "attach", "detach", "events", "labelclear", "get", "set",
];

fn validate_arg(arg: &str) -> Result<(), ApiError> {
    if arg.contains([';', '&', '|', '`', '$', '(', ')', '{', '}', '<', '>', '\n', '\r', '\0']) {
        return Err(ApiError::BadRequest("Invalid character in argument".into()));
    }
    if arg.contains("..") {
        return Err(ApiError::BadRequest("Path traversal not allowed".into()));
    }
    Ok(())
}

/// Run any `zfs` subcommand and return its stdout as a String.
pub async fn zfs(args: &[&str]) -> Result<String, ApiError> {
    if let Some(subcmd) = args.first() {
        if !ALLOWED_ZFS.contains(subcmd) {
            return Err(ApiError::BadRequest(format!("zfs subcommand '{}' is not allowed", subcmd)));
        }
    }
    for arg in args {
        validate_arg(arg)?;
    }
    command("zfs", args).await
}

/// Run any `zpool` subcommand and return its stdout as a String.
pub async fn zpool(args: &[&str]) -> Result<String, ApiError> {
    if let Some(subcmd) = args.first() {
        if !ALLOWED_ZPOOL.contains(subcmd) {
            return Err(ApiError::BadRequest(format!("zpool subcommand '{}' is not allowed", subcmd)));
        }
    }
    for arg in args {
        validate_arg(arg)?;
    }
    command("zpool", args).await
}

pub async fn command(bin: &str, args: &[&str]) -> Result<String, ApiError> {
    debug!("Executing: {} {:?}", bin, args);
    let output = Command::new(bin).args(args).output().await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(ApiError::CommandFailed {
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            code: output.status.code(),
        })
    }
}


pub fn validate_zfs_name(name: &str, kind: &str) -> Result<(), ApiError> {
    if name.is_empty() {
        return Err(ApiError::BadRequest(format!("{kind} name cannot be empty")));
    }
    if name.len() > 256 {
        return Err(ApiError::BadRequest(format!("{kind} name too long")));
    }
    // ZFS names: alphanumeric, -, _, ., :, /, @
    if !name.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ':' | '/' | '@')) {
        return Err(ApiError::BadRequest(format!("Invalid characters in {kind} name: {name}")));
    }
    Ok(())
}
