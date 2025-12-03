use std::path::Path;
use std::sync::Mutex;
use tauri::State;
use crate::database::Database;
use crate::models::{*, PaginatedVideos};
use crate::scanner;
use crate::player::PlayerState;

pub struct AppState {
    pub db: Mutex<Database>,
    pub player: PlayerState,
}

// ========== Folder Commands ==========

#[tauri::command]
pub fn add_mounted_folder(state: State<AppState>, path: String, scan_depth: Option<usize>) -> Result<MountedFolder, String> {
    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    
    let depth = scan_depth.unwrap_or(2);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_mounted_folder(&path, &name, depth).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_folder_scan_depth(state: State<AppState>, path: String, scan_depth: usize) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_folder_scan_depth(&path, scan_depth).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mounted_folders(state: State<AppState>) -> Result<Vec<MountedFolder>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_mounted_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_mounted_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_mounted_folder(&path).map_err(|e| e.to_string())
}

// ========== Scan Commands ==========

#[tauri::command]
pub fn scan_folder(state: State<AppState>, folder_path: String) -> Result<ScanResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get scan depth for this folder
    let scan_depth = db.get_mounted_folder(&folder_path)
        .map_err(|e| e.to_string())?
        .map(|f| f.scan_depth)
        .unwrap_or(2);
    
    // Clear existing videos from this folder before re-scanning
    db.clear_folder_videos(&folder_path).map_err(|e| e.to_string())?;
    
    drop(db); // Release lock before scanning
    
    let scan_result = scanner::scan_folder(&folder_path, scan_depth);
    
    // Save scanned videos to database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    for video in &scan_result.videos {
        db.upsert_video(video).map_err(|e| e.to_string())?;
    }
    
    Ok(ScanResult {
        total_videos: scan_result.total_videos,
        new_videos: scan_result.videos.len(),
        folders: scan_result.folders,
        videos: scan_result.videos,
    })
}

#[tauri::command]
pub fn get_folder_tree(state: State<AppState>, folder_path: String) -> Result<FolderNode, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let scan_depth = db.get_mounted_folder(&folder_path)
        .map_err(|e| e.to_string())?
        .map(|f| f.scan_depth)
        .unwrap_or(2);
    drop(db);
    
    let scan_result = scanner::scan_folder(&folder_path, scan_depth);
    scan_result.folders.into_iter().next().ok_or_else(|| "No folder found".to_string())
}

// ========== Video Commands ==========

#[tauri::command]
pub fn get_videos(state: State<AppState>, filter: FilterOptions) -> Result<PaginatedVideos, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let videos = db.get_videos(&filter).map_err(|e| e.to_string())?;
    let total = db.get_video_count(&filter).map_err(|e| e.to_string())?;
    let has_more = filter.offset + videos.len() < total;
    
    Ok(PaginatedVideos {
        videos,
        total,
        has_more,
    })
}

#[tauri::command]
pub fn get_video_with_metadata(state: State<AppState>, video_id: String) -> Result<VideoWithMetadata, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    // Get video by searching all videos (we need to find by id)
    let filter = FilterOptions::default();
    let videos = db.get_videos(&filter).map_err(|e| e.to_string())?;
    let video = videos.into_iter().find(|v| v.id == video_id)
        .ok_or_else(|| "Video not found".to_string())?;
    
    let tags = db.get_video_tags(&video_id).map_err(|e| e.to_string())?;
    let participants = db.get_video_participants(&video_id).map_err(|e| e.to_string())?;
    let languages = db.get_video_languages(&video_id).map_err(|e| e.to_string())?;
    
    Ok(VideoWithMetadata {
        video,
        tags,
        participants,
        languages,
    })
}

#[tauri::command]
pub fn delete_video(state: State<AppState>, video_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_video(&video_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_video_file(state: State<AppState>, old_path: String, new_folder: String) -> Result<Video, String> {
    let old_path_obj = Path::new(&old_path);
    let filename = old_path_obj.file_name()
        .ok_or_else(|| "Invalid file path".to_string())?
        .to_string_lossy()
        .to_string();
    
    let new_path = Path::new(&new_folder).join(&filename);
    let new_path_str = new_path.to_string_lossy().to_string();
    
    // Move the actual file
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to move file: {}", e))?;
    
    // Update database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_video_path(&old_path, &new_path_str, &new_folder, &filename)
        .map_err(|e| e.to_string())?;
    
    // Return updated video
    let video = db.get_video_by_path(&new_path_str)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Video not found after move".to_string())?;
    
    Ok(video)
}

// ========== Tag Commands ==========

#[tauri::command]
pub fn create_tag(state: State<AppState>, name: String, color: String) -> Result<Tag, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_tag(&name, &color).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tags(state: State<AppState>) -> Result<Vec<Tag>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_tag(state: State<AppState>, id: String, name: String, color: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_tag(&id, &name, &color).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_tag(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_video_tags(state: State<AppState>, video_id: String, tag_ids: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_video_tags(&video_id, &tag_ids).map_err(|e| e.to_string())
}

// ========== Participant Commands ==========

#[tauri::command]
pub fn create_participant(state: State<AppState>, name: String) -> Result<Participant, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_participant(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_participants(state: State<AppState>) -> Result<Vec<Participant>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_participants().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_participant(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_participant(&id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_participant(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_participant(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_video_participants(state: State<AppState>, video_id: String, participant_ids: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_video_participants(&video_id, &participant_ids).map_err(|e| e.to_string())
}

// ========== Language Commands ==========

#[tauri::command]
pub fn create_language(state: State<AppState>, code: String, name: String) -> Result<Language, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_language(&code, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_languages(state: State<AppState>) -> Result<Vec<Language>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_languages().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_language(state: State<AppState>, id: String, code: String, name: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_language(&id, &code, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_language(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_language(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_video_languages(state: State<AppState>, video_id: String, language_ids: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_video_languages(&video_id, &language_ids).map_err(|e| e.to_string())
}

// ========== Playback Commands ==========

#[tauri::command]
pub fn save_playback_position(state: State<AppState>, video_id: String, position: f64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.save_playback_position(&video_id, position).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_playback_position(state: State<AppState>, video_id: String) -> Result<Option<f64>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_playback_position(&video_id).map_err(|e| e.to_string())
}

// ========== Thumbnail Commands ==========

#[tauri::command]
pub fn get_thumbnail_path(video_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&video_path);
    Ok(scanner::find_thumbnail_for_video(path))
}

// ========== MPV Player Commands ==========

#[tauri::command]
pub fn play_video_mpv(
    state: State<AppState>,
    video_path: String,
    subtitle_path: Option<String>,
    start_position: Option<f64>,
) -> Result<(), String> {
    let mut player = state.player.player.lock().map_err(|e| e.to_string())?;
    player.play(&video_path, subtitle_path.as_deref(), start_position)
}

#[tauri::command]
pub fn stop_video_mpv(state: State<AppState>) -> Result<(), String> {
    let mut player = state.player.player.lock().map_err(|e| e.to_string())?;
    player.stop();
    Ok(())
}

#[tauri::command]
pub fn is_mpv_running(state: State<AppState>) -> Result<bool, String> {
    let mut player = state.player.player.lock().map_err(|e| e.to_string())?;
    Ok(player.is_running())
}

#[tauri::command]
pub fn check_mpv_installed() -> Result<bool, String> {
    Ok(crate::player::is_mpv_available())
}

#[tauri::command]
pub fn find_subtitle_for_video(video_path: String) -> Result<Option<String>, String> {
    let video_path = Path::new(&video_path);
    let stem = video_path.file_stem()
        .ok_or("Invalid video path")?;
    let parent = video_path.parent()
        .ok_or("Invalid video path")?;

    let subtitle_extensions = ["srt", "ass", "ssa", "sub", "vtt"];

    for ext in &subtitle_extensions {
        let sub_path = parent.join(format!("{}.{}", stem.to_string_lossy(), ext));
        if sub_path.exists() {
            return Ok(Some(sub_path.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

