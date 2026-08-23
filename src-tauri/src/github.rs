use crate::error::{AppError, AppResult};
use std::time::Duration;

const USER_AGENT: &str = concat!("SpicetifyInstaller/", env!("CARGO_PKG_VERSION"));

/// Build a shared HTTP client with a sane timeout and identifying user-agent.
pub fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))
}

/// A resolved GitHub release: tag (version, `v` stripped) plus asset list.
pub struct Release {
    pub version: String,
    pub assets: Vec<Asset>,
}

pub struct Asset {
    pub name: String,
    pub url: String,
}

/// Resolve the latest release version by following the `releases/latest`
/// redirect on **github.com** (the website), which is not subject to the strict
/// api.github.com rate limit. Returns the version with any leading `v` stripped.
pub async fn latest_tag_web(repo: &str) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    let url = format!("https://github.com/{repo}/releases/latest");
    let resp = client.get(&url).send().await?;

    // Expect a 3xx to `.../releases/tag/vX.Y.Z`.
    let location = resp
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Network("GitHub did not return a latest release".into()))?;

    let tag = location
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();

    if tag.is_empty() {
        return Err(AppError::Network("Could not parse the latest version".into()));
    }
    Ok(tag)
}

/// Direct release-asset download URL by convention (no API call needed):
/// `https://github.com/{repo}/releases/download/v{version}/{asset}`.
pub fn asset_download_url(repo: &str, version: &str, asset: &str) -> String {
    format!("https://github.com/{repo}/releases/download/v{version}/{asset}")
}

/// Fetch the latest release for `owner/repo`.
pub async fn latest_release(client: &reqwest::Client, repo: &str) -> AppResult<Release> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        if status.as_u16() == 403 {
            return Err(AppError::Network(
                "GitHub API rate limit exceeded. Try again later.".into(),
            ));
        }
        return Err(AppError::Network(format!(
            "GitHub API returned status {status}"
        )));
    }

    let json: serde_json::Value = resp.json().await?;

    let version = json["tag_name"]
        .as_str()
        .ok_or_else(|| AppError::Other("Missing tag_name in GitHub response".into()))?
        .trim_start_matches('v')
        .to_string();

    let assets = json["assets"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    Some(Asset {
                        name: a["name"].as_str()?.to_string(),
                        url: a["browser_download_url"].as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(Release { version, assets })
}

impl Release {
    /// Pick the Windows Spicetify CLI archive matching the current architecture,
    /// e.g. `spicetify-2.38.0-windows-x64.zip`.
    pub fn spicetify_archive(&self) -> Option<&Asset> {
        let arch = target_arch();
        self.assets.iter().find(|a| {
            let n = a.name.to_ascii_lowercase();
            n.ends_with(".zip") && n.contains("windows") && n.contains(&format!("-{arch}"))
        })
    }
}

/// Map the compiled target arch to Spicetify's release naming.
pub fn target_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => "x32",
    }
}

/// Semantic-ish version comparison. Returns true when `latest` > `current`.
/// Tolerates missing components and non-numeric suffixes (e.g. "-alpha").
pub fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };
    let l = parse(latest);
    let c = parse(current);
    for i in 0..l.len().max(c.len()) {
        let lp = l.get(i).copied().unwrap_or(0);
        let cp = c.get(i).copied().unwrap_or(0);
        if lp != cp {
            return lp > cp;
        }
    }
    false
}
