use std::collections::HashMap;
use tauri::utils::config::{Csp, CspDirectiveSources};
use tauri::Manager;

/// 校验运行期 API 地址；例如 `https://api.example.test/api/v1`，不接收认证信息或查询参数。
fn parse_runtime_api(value: &str) -> Result<tauri::Url, &'static str> {
    let url = tauri::Url::parse(value).map_err(|_| "Invalid PUBLIC_API_BASE")?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "PUBLIC_API_BASE must be an HTTP(S) URL without credentials, query or fragment",
        );
    }
    Ok(url)
}

/// 仅将当前运行期 API 的 origin 加入 CSP；不放宽到所有 HTTP/HTTPS 站点。
fn runtime_csp(policy: Csp, origin: &str) -> Csp {
    let mut directives: HashMap<String, CspDirectiveSources> = policy.into();
    for name in ["connect-src", "img-src"] {
        directives.entry(name.to_string()).or_default().push(origin);
    }
    directives.into()
}

/// 公钥与更新源由发布构建固定，配置不完整时关闭更新功能。
#[cfg(all(
    any(windows, target_os = "linux"),
    target_arch = "x86_64",
    any(test, all(not(dev), not(debug_assertions)))
))]
fn valid_updater_config(value: Option<&serde_json::Value>) -> bool {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let Some(config) = value.and_then(|value| {
        serde_json::from_value::<tauri_plugin_updater::Config>(value.clone()).ok()
    }) else {
        return false;
    };
    if !config.require_signed_version
        || config.allow_downgrades
        || config.dangerous_insecure_transport_protocol
        || config.dangerous_accept_invalid_certs
        || config.dangerous_accept_invalid_hostnames
        || config.endpoints.is_empty()
        || config.endpoints.iter().any(|url| {
            url.scheme() != "https"
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
        })
    {
        return false;
    }

    let Ok(decoded) = STANDARD.decode(config.pubkey) else {
        return false;
    };
    std::str::from_utf8(&decoded).is_ok_and(|key| minisign_verify::PublicKey::decode(key).is_ok())
}

struct DesktopUpdaterEnabled;

#[cfg(all(
    any(windows, target_os = "linux"),
    target_arch = "x86_64",
    any(test, all(not(dev), not(debug_assertions)))
))]
fn is_newer_release(current: &semver::Version, candidate: &semver::Version) -> bool {
    candidate.cmp_precedence(current).is_gt()
}

#[cfg(all(
    any(windows, target_os = "linux"),
    target_arch = "x86_64",
    not(dev),
    not(debug_assertions)
))]
fn supports_updater_bundle() -> bool {
    use tauri::utils::{config::BundleType, platform::bundle_type};

    #[cfg(windows)]
    {
        bundle_type() == Some(BundleType::Nsis)
    }
    #[cfg(target_os = "linux")]
    {
        bundle_type() == Some(BundleType::AppImage)
            && tauri::Env::default()
                .appimage
                .is_some_and(|image| std::path::Path::new(&image).is_file())
    }
}

#[tauri::command]
fn desktop_update_configured(app: tauri::AppHandle) -> bool {
    app.try_state::<DesktopUpdaterEnabled>().is_some()
}

#[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
#[derive(serde::Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum DesktopUpdateCheck {
    Available { update: DesktopUpdateMetadata },
    Current,
    Unavailable,
}

#[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
#[tauri::command]
async fn desktop_update_check(webview: tauri::Webview) -> Result<DesktopUpdateCheck, &'static str> {
    use std::time::Duration;
    use tauri_plugin_updater::{Error, UpdaterExt};

    const CHECK_FAILED: &str = "Desktop update check failed";
    if webview.label() != "main" || webview.try_state::<DesktopUpdaterEnabled>().is_none() {
        return Err(CHECK_FAILED);
    }

    // 检查与下载共用请求设置，包括发布地址跳转后的 HTTPS 约束。
    let updater = webview
        .updater_builder()
        .timeout(Duration::from_secs(10))
        .configure_client(|client| client.https_only(true))
        .build()
        .map_err(|_| CHECK_FAILED)?;
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Ok(DesktopUpdateCheck::Current),
        Err(Error::TargetNotFound(_) | Error::TargetsNotFound(_)) => {
            return Ok(DesktopUpdateCheck::Unavailable);
        }
        Err(_) => return Err(CHECK_FAILED),
    };
    let url = &update.download_url;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(CHECK_FAILED);
    }

    // 保留 Tauri 的原生更新资源，由插件完成签名核验、下载安装和释放。
    let metadata = DesktopUpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        raw_json: serde_json::json!({}),
        rid: webview.resources_table().add(update),
    };
    Ok(DesktopUpdateCheck::Available { update: metadata })
}

#[tauri::command]
fn desktop_update_restart(window: tauri::WebviewWindow) -> Result<(), &'static str> {
    let app = window.app_handle();
    if !cfg!(target_os = "linux")
        || window.label() != "main"
        || app.try_state::<DesktopUpdaterEnabled>().is_none()
    {
        return Err("Desktop update restart is unavailable");
    }
    // Tauri 通过原 AppImage 路径重新启动，而不是从临时挂载目录运行。
    app.request_restart();
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Desktop.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 构建不读取部署环境；启动时从进程 PUBLIC_API_BASE 获取公开地址。
    let api = parse_runtime_api(
        &std::env::var("PUBLIC_API_BASE")
            .unwrap_or_else(|_| "http://localhost:3000/api/v1".to_string()),
    )
    .expect("Invalid runtime API configuration");
    let mut context = tauri::generate_context!();
    if let Some(policy) = context.config_mut().app.security.csp.take() {
        context.config_mut().app.security.csp =
            Some(runtime_csp(policy, &api.origin().ascii_serialization()));
    }
    let script = format!(
        "globalThis.__HAI_PUBLIC_CONFIG__={};",
        serde_json::json!({ "apiBase": api.as_str() })
    );
    let builder = tauri::Builder::default();
    #[cfg(all(
        any(windows, target_os = "linux"),
        target_arch = "x86_64",
        not(dev),
        not(debug_assertions)
    ))]
    let builder = if supports_updater_bundle()
        && valid_updater_config(context.config().plugins.0.get("updater"))
    {
        builder.manage(DesktopUpdaterEnabled).plugin(
            tauri_plugin_updater::Builder::new()
                .default_version_comparator(|current, release| {
                    is_newer_release(&current, &release.version)
                })
                .build(),
        )
    } else {
        builder
    };
    builder
        .plugin(tauri_plugin_shell::init())
        .append_invoke_initialization_script(script)
        .invoke_handler(tauri::generate_handler![
            greet,
            desktop_update_configured,
            #[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
            desktop_update_check,
            desktop_update_restart
        ])
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_runtime_address_and_scopes_csp() {
        let api = parse_runtime_api("https://api.example.test:8443/custom/v2").unwrap();
        let policy = runtime_csp(
            Csp::Policy("default-src 'self'; connect-src 'self'".into()),
            &api.origin().ascii_serialization(),
        );
        let directives: HashMap<String, CspDirectiveSources> = policy.into();
        let sources: Vec<String> = directives["connect-src"].clone().into();
        assert!(sources.contains(&"https://api.example.test:8443".to_string()));
        assert!(!sources.contains(&"https:".to_string()));
        for value in [
            "file:///tmp/config",
            "https://user:secret@host",
            "https://host/?token=secret",
            "relative",
        ] {
            assert!(parse_runtime_api(value).is_err());
        }
    }

    #[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
    #[test]
    fn updater_compares_release_precedence() {
        for (current, candidate, expected) in [
            ("1.0.0+build.1", "1.0.0+build.2", false),
            ("1.0.0", "1.0.0+build.2", false),
            ("1.0.0-beta.9", "1.0.0-beta.10", true),
            ("1.0.0-beta.10", "1.0.0-beta.9", false),
            ("1.0.0-beta.10", "1.0.0", true),
            ("1.0.0", "1.0.1", true),
        ] {
            assert_eq!(
                is_newer_release(&current.parse().unwrap(), &candidate.parse().unwrap()),
                expected,
                "{current} -> {candidate}"
            );
        }
    }

    #[cfg(all(any(windows, target_os = "linux"), target_arch = "x86_64"))]
    #[test]
    fn updater_requires_https_and_a_version_bound_public_key() {
        use base64::{engine::general_purpose::STANDARD, Engine};

        let public_key = STANDARD.encode(concat!(
            "untrusted comment: minisign public key E7620F1842B4E81F\n",
            "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3",
        ));
        let config = serde_json::json!({
            "endpoints": ["https://updates.example.test/latest.json"],
            "pubkey": public_key,
            "requireSignedVersion": true,
        });
        assert!(!valid_updater_config(None));
        assert!(valid_updater_config(Some(&config)));

        for (name, value) in [
            ("endpoints", serde_json::json!([])),
            (
                "endpoints",
                serde_json::json!(["http://updates.example.test/latest.json"]),
            ),
            (
                "endpoints",
                serde_json::json!(["https://user@updates.example.test/latest.json"]),
            ),
            ("pubkey", serde_json::json!("invalid")),
            ("requireSignedVersion", serde_json::json!(false)),
            ("allowDowngrades", serde_json::json!(true)),
            (
                "dangerousInsecureTransportProtocol",
                serde_json::json!(true),
            ),
            ("dangerousAcceptInvalidCerts", serde_json::json!(true)),
            ("dangerousAcceptInvalidHostnames", serde_json::json!(true)),
        ] {
            let mut rejected = config.clone();
            rejected[name] = value;
            assert!(!valid_updater_config(Some(&rejected)), "{name}");
        }
    }
}
