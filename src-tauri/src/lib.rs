mod commands;
mod database;
mod models;
mod player;
mod scanner;

use commands::AppState;
use database::Database;
use player::PlayerState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::new().expect("Failed to initialize database");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            db: Mutex::new(db),
            player: PlayerState::new(),
        })
        .invoke_handler(tauri::generate_handler![
            // Folder commands
            commands::add_mounted_folder,
            commands::get_mounted_folders,
            commands::remove_mounted_folder,
            commands::update_folder_scan_depth,
            // Scan commands
            commands::scan_folder,
            commands::get_folder_tree,
            // Video commands
            commands::get_videos,
            commands::get_video_with_metadata,
            commands::delete_video,
            commands::move_video_file,
            // Tag commands
            commands::create_tag,
            commands::get_tags,
            commands::update_tag,
            commands::delete_tag,
            commands::set_video_tags,
            // Participant commands
            commands::create_participant,
            commands::get_participants,
            commands::update_participant,
            commands::delete_participant,
            commands::set_video_participants,
            // Language commands
            commands::create_language,
            commands::get_languages,
            commands::update_language,
            commands::delete_language,
            commands::set_video_languages,
            // Playback commands
            commands::save_playback_position,
            commands::get_playback_position,
            // Thumbnail commands
            commands::get_thumbnail_path,
            // MPV commands
            commands::play_video_mpv,
            commands::stop_video_mpv,
            commands::is_mpv_running,
            commands::check_mpv_installed,
            commands::find_subtitle_for_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
