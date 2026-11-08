// Codex 搭子: a thin shell around two PowerShell scripts.
// - codex.ps1 (from codex-install-made-easy) does the install; run with CODEX_SETUP_STEPS=1 it prints STEP lines.
// - buddy.ps1 manages an installed Codex (switch model, edition, settings, restore).
// The shell runs them hidden, relays their STEP lines to the page as "script-line" events, and embeds Zhipu's login
// page during the scan step. Everything else lives in the scripts and the page (ui/).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, State, WebviewUrl};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const CODEX_PS1: &str = include_str!("../../scripts/vendor/codex.ps1");
const BUDDY_PS1: &str = include_str!("../../scripts/buddy.ps1");
const WEBVIEW2_PS1: &str = include_str!("../../scripts/webview2.ps1");
const ZHIPU_LOGIN_URL: &str = "https://bigmodel.cn/login?redirect=%2Fapikey%2Fplatform";
// codex.ps1 (CODEX_SETUP_LOGIN_PORT) connects to the login page through this DevTools port, on 127.0.0.1 only
const LOGIN_DEBUG_PORT: u16 = 9333;
const LOGIN_LABEL: &str = "zhipu-login";

/// Process ids of running scripts, killed when the app exits
#[derive(Default)]
struct Running(Mutex<Vec<u32>>);

#[derive(Clone, Serialize)]
struct ScriptLine {
    kind: String,
    line: String,
}

#[derive(Serialize)]
struct RunOutput {
    code: i32,
    result: Option<String>,
}

fn data_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("HumansLive").join("codex-buddy")
}

fn write_script(name: &str, text: &str) -> std::io::Result<PathBuf> {
    let dir = data_dir().join("scripts");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(name);
    std::fs::write(&path, text)?;
    Ok(path)
}

/// powershell.exe running the file's text through iex, as `irm | iex` does: unlike `-File`, this is not blocked when
/// group policy forbids running .ps1 files
fn powershell(script: &Path) -> Command {
    let path = script.to_string_lossy().replace('\'', "''");
    let mut cmd = Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &format!("iex ([IO.File]::ReadAllText('{path}', [Text.Encoding]::UTF8))"),
    ]);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[tauri::command]
async fn run_script(
    app: AppHandle,
    running: State<'_, Running>,
    kind: String,
    action: Option<String>,
    args: Option<String>,
) -> Result<RunOutput, String> {
    let codex = write_script("codex.ps1", CODEX_PS1).map_err(|e| e.to_string())?;
    let mut cmd = match kind.as_str() {
        "install" => {
            let mut c = powershell(&codex);
            c.env("CODEX_SETUP_STEPS", "1")
                .env("CODEX_SETUP_LOGIN_PORT", LOGIN_DEBUG_PORT.to_string())
                .env("CODEX_SETUP_NO_OPEN", "1")
                .env("CODEX_SETUP_EDITION", "zh");
            c
        }
        "buddy" => {
            let buddy = write_script("buddy.ps1", BUDDY_PS1).map_err(|e| e.to_string())?;
            let mut c = powershell(&buddy);
            c.env("BUDDY_ACTION", action.unwrap_or_default())
                .env("BUDDY_ARGS", args.unwrap_or_default())
                .env("BUDDY_CODEX_PS1", &codex);
            if let Ok(exe) = std::env::current_exe() {
                c.env("BUDDY_EXE", exe);
            }
            c
        }
        _ => return Err("unknown script".into()),
    };
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id();
    running.0.lock().unwrap().push(pid);
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut result = None;
        for line in BufReader::new(stdout).split(b'\n') {
            let Ok(bytes) = line else { break };
            let text = String::from_utf8_lossy(&bytes).trim_end_matches('\r').to_string();
            if let Some(r) = text.strip_prefix("RESULT:") {
                result = Some(r.to_string());
            } else if text.starts_with("STEP:") {
                let _ = app.emit("script-line", ScriptLine { kind: kind.clone(), line: text });
            }
        }
        let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
        RunOutput { code, result }
    })
    .await
    .map_err(|e| e.to_string())?;
    running.0.lock().unwrap().retain(|p| *p != pid);
    Ok(output)
}

/// Shows Zhipu's login page over the page's login slot (logical pixels). Its own data folder keeps its cookies apart
/// from the app's page, and starts empty every time, like the temporary browser profile codex.ps1 uses
#[tauri::command]
async fn show_login(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(webview) = app.get_webview(LOGIN_LABEL) {
        webview.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        webview.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        return webview.show().map_err(|e| e.to_string());
    }
    let window = app.get_window("main").ok_or("no main window")?;
    let dir = data_dir().join("login-webview");
    let _ = std::fs::remove_dir_all(&dir);
    let url: tauri::Url = ZHIPU_LOGIN_URL.parse().map_err(|e| format!("{e}"))?;
    let builder = WebviewBuilder::new(LOGIN_LABEL, WebviewUrl::External(url))
        .data_directory(dir)
        .additional_browser_args(&format!(
            "--remote-debugging-port={LOGIN_DEBUG_PORT} --lang=zh-CN \
             --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate"
        ));
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn hide_login(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(LOGIN_LABEL) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Opens an https link in the default browser
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.contains(['"', ' ', '\n']) {
        return Err("only https links".into());
    }
    let mut cmd = Command::new("rundll32.exe");
    cmd.args(["url.dll,FileProtocolHandler", &url]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn kill_tree(pid: u32) {
    let mut cmd = Command::new("taskkill.exe");
    cmd.args(["/F", "/T", "/PID", &pid.to_string()]).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();
}

/// Windows 11 always has WebView2; most Windows 10 PCs got it from Windows Update, but not all. Without it the page
/// cannot show, so check the registry (where the runtime registers its version) before opening any window
#[cfg(windows)]
fn webview2_installed() -> bool {
    const CLIENT: &str = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    [
        format!(r"HKLM\SOFTWARE\WOW6432Node\{CLIENT}"),
        format!(r"HKLM\SOFTWARE\{CLIENT}"),
        format!(r"HKCU\Software\{CLIENT}"),
    ]
    .iter()
    .any(|key| {
        Command::new("reg.exe")
            .args(["query", key, "/v", "pv"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|out| {
                let text = String::from_utf8_lossy(&out.stdout);
                out.status.success() && text.contains("pv") && !text.contains("0.0.0.0")
            })
            .unwrap_or(false)
    })
}

/// Installs WebView2 with Microsoft's own bootstrapper (scripts/webview2.ps1 shows a small "installing" window).
/// Exits if it is still missing afterwards; the script has told the user what to do
#[cfg(windows)]
fn ensure_webview2() {
    if webview2_installed() {
        return;
    }
    let ok = write_script("webview2.ps1", WEBVIEW2_PS1)
        .ok()
        .and_then(|path| powershell(&path).stdout(Stdio::null()).status().ok())
        .map(|status| status.success())
        .unwrap_or(false);
    if !ok || !webview2_installed() {
        std::process::exit(1);
    }
}

fn main() {
    #[cfg(windows)]
    ensure_webview2();

    tauri::Builder::default()
        .manage(Running::default())
        .invoke_handler(tauri::generate_handler![run_script, show_login, hide_login, open_url])
        .build(tauri::generate_context!())
        .expect("failed to start Codex 搭子")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                for pid in app.state::<Running>().0.lock().unwrap().drain(..) {
                    kill_tree(pid);
                }
            }
        });
}
