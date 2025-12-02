use std::path::{Path, PathBuf};
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::env;

pub struct MpvPlayer {
    process: Option<Child>,
}

impl MpvPlayer {
    pub fn new() -> Self {
        MpvPlayer { process: None }
    }

    pub fn play(&mut self, video_path: &str, subtitle_path: Option<&str>, start_position: Option<f64>) -> Result<(), String> {
        // Kill existing process if any
        self.stop();

        let mut args: Vec<String> = vec![
            video_path.to_string(),
            "--force-window=yes".to_string(),
            "--keep-open=yes".to_string(),
            "--osd-level=1".to_string(),
            "--input-default-bindings=yes".to_string(),
            "--input-vo-keyboard=yes".to_string(),
        ];

        // Add subtitle if provided
        if let Some(sub_path) = subtitle_path {
            args.push(format!("--sub-file={}", sub_path));
        } else {
            // Try to find subtitle with same name
            if let Some(auto_sub) = find_subtitle_file(video_path) {
                args.push(format!("--sub-file={}", auto_sub));
            }
        }

        // Add start position if provided
        if let Some(pos) = start_position {
            args.push(format!("--start={}", pos));
        }

        // Try to find mpv executable (bundled first, then system)
        let mpv_path = find_bundled_mpv()
            .or_else(find_system_mpv)
            .ok_or("mpv not found. The bundled mpv is missing and mpv is not installed on the system.")?;

        // Set library path for bundled libs on macOS
        let mut command = Command::new(&mpv_path);
        
        #[cfg(target_os = "macos")]
        {
            if let Some(libs_path) = get_bundled_libs_path() {
                // Set DYLD_LIBRARY_PATH for macOS
                let current_dyld = env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
                let new_dyld = if current_dyld.is_empty() {
                    libs_path.to_string_lossy().to_string()
                } else {
                    format!("{}:{}", libs_path.to_string_lossy(), current_dyld)
                };
                command.env("DYLD_LIBRARY_PATH", new_dyld);
            }
        }

        let child = command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start mpv: {}", e))?;

        self.process = Some(child);
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.process {
            match child.try_wait() {
                Ok(Some(_)) => {
                    self.process = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }
}

impl Drop for MpvPlayer {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Find bundled mpv executable
fn find_bundled_mpv() -> Option<String> {
    // In development, check the binaries folder
    let dev_path = get_dev_mpv_path();
    if let Some(path) = dev_path {
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    // In production, Tauri puts external binaries in the app bundle
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe_path) = env::current_exe() {
            // macOS: AppName.app/Contents/MacOS/AppName -> AppName.app/Contents/MacOS/mpv
            let resources_dir = exe_path.parent()?;
            let mpv_path = resources_dir.join("mpv");
            if mpv_path.exists() {
                return Some(mpv_path.to_string_lossy().to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_path) = env::current_exe() {
            let exe_dir = exe_path.parent()?;
            let mpv_path = exe_dir.join("mpv.exe");
            if mpv_path.exists() {
                return Some(mpv_path.to_string_lossy().to_string());
            }
        }
    }

    None
}

/// Get development mpv path
fn get_dev_mpv_path() -> Option<PathBuf> {
    let target = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "x86_64") {
            "x86_64-pc-windows-msvc"
        } else {
            "i686-pc-windows-msvc"
        }
    } else {
        "x86_64-unknown-linux-gnu"
    };

    // Try to find from manifest dir (during development)
    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let path = PathBuf::from(manifest_dir).join("binaries").join(format!("mpv-{}", target));
        if path.exists() {
            return Some(path);
        }
    }

    // Try relative to current exe
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Check various possible locations during development
            let possible_paths = [
                exe_dir.join("../../../binaries").join(format!("mpv-{}", target)),
                exe_dir.join("../../binaries").join(format!("mpv-{}", target)),
                exe_dir.join("binaries").join(format!("mpv-{}", target)),
            ];
            
            for path in possible_paths {
                if let Ok(canonical) = path.canonicalize() {
                    if canonical.exists() {
                        return Some(canonical);
                    }
                }
            }
        }
    }

    None
}

/// Get bundled libs path
fn get_bundled_libs_path() -> Option<PathBuf> {
    // In development
    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let path = PathBuf::from(manifest_dir).join("binaries").join("libs");
        if path.exists() {
            return Some(path);
        }
    }

    // In production (macOS)
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe_path) = env::current_exe() {
            if let Some(resources_dir) = exe_path.parent() {
                // Check Resources folder
                let resources_path = resources_dir.parent()?.join("Resources").join("libs");
                if resources_path.exists() {
                    return Some(resources_path);
                }
                // Also check MacOS folder
                let macos_libs = resources_dir.join("libs");
                if macos_libs.exists() {
                    return Some(macos_libs);
                }
            }
        }
    }

    // Try relative to current exe (development)
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let possible_paths = [
                exe_dir.join("../../../binaries/libs"),
                exe_dir.join("../../binaries/libs"),
                exe_dir.join("binaries/libs"),
            ];
            
            for path in possible_paths {
                if let Ok(canonical) = path.canonicalize() {
                    if canonical.exists() {
                        return Some(canonical);
                    }
                }
            }
        }
    }

    None
}

/// Find system mpv executable
fn find_system_mpv() -> Option<String> {
    // Check common locations
    let possible_paths = if cfg!(target_os = "macos") {
        vec![
            "/opt/homebrew/bin/mpv",
            "/usr/local/bin/mpv",
            "/Applications/mpv.app/Contents/MacOS/mpv",
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "C:\\Program Files\\mpv\\mpv.exe",
            "C:\\Program Files (x86)\\mpv\\mpv.exe",
        ]
    } else {
        vec!["/usr/bin/mpv", "/usr/local/bin/mpv"]
    };

    // First try PATH
    if Command::new("mpv").arg("--version").output().is_ok() {
        return Some("mpv".to_string());
    }

    // Check specific paths
    for path in possible_paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}

fn find_subtitle_file(video_path: &str) -> Option<String> {
    let video_path = Path::new(video_path);
    let stem = video_path.file_stem()?;
    let parent = video_path.parent()?;

    let subtitle_extensions = ["srt", "ass", "ssa", "sub", "vtt"];

    for ext in &subtitle_extensions {
        let sub_path = parent.join(format!("{}.{}", stem.to_string_lossy(), ext));
        if sub_path.exists() {
            return Some(sub_path.to_string_lossy().to_string());
        }
    }

    None
}

pub struct PlayerState {
    pub player: Mutex<MpvPlayer>,
}

impl PlayerState {
    pub fn new() -> Self {
        PlayerState {
            player: Mutex::new(MpvPlayer::new()),
        }
    }
}

/// Check if mpv is available (bundled or system)
pub fn is_mpv_available() -> bool {
    find_bundled_mpv().is_some() || find_system_mpv().is_some()
}
