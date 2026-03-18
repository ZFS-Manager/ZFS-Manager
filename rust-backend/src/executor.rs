use crate::error::ApiError;
use tokio::process::Command;
use tracing::debug;

/// Run any `zfs` subcommand and return its stdout as a String.
pub async fn zfs(args: &[&str]) -> Result<String, ApiError> {
    run("zfs", args).await
}

/// Run any `zpool` subcommand and return its stdout as a String.
pub async fn zpool(args: &[&str]) -> Result<String, ApiError> {
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

/// Parse `-H -p` table output (tab-separated) into a Vec of rows (Vec<String>).
pub fn parse_table(raw: &str) -> Vec<Vec<String>> {
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.split('\t').map(|s| s.to_string()).collect())
        .collect()
}
