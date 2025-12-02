use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;
use crate::models::{Video, FolderNode, ScanResult};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "webm", "mov", "wmv", "flv", "m4v", "mpg", "mpeg", "3gp", "ts"
];

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];

/// Scan a folder for videos with specified depth
pub fn scan_folder(folder_path: &str, max_depth: usize) -> ScanResult {
    let mut videos: Vec<Video> = Vec::new();
    let mut folder_video_counts: HashMap<String, usize> = HashMap::new();
    
    // Scan with user-specified depth
    scan_directory_shallow(folder_path, &mut videos, &mut folder_video_counts, 0, max_depth);
    
    // Build folder tree
    let folder_tree = build_folder_tree(folder_path, &folder_video_counts);
    
    ScanResult {
        total_videos: videos.len(),
        new_videos: videos.len(),
        folders: vec![folder_tree],
        videos: videos.clone(),
    }
}

/// Scan directory with limited depth
fn scan_directory_shallow(
    dir_path: &str, 
    videos: &mut Vec<Video>, 
    folder_counts: &mut HashMap<String, usize>,
    current_depth: usize,
    max_depth: usize
) {
    if current_depth > max_depth {
        return;
    }
    
    let dir = match fs::read_dir(dir_path) {
        Ok(d) => d,
        Err(_) => return,
    };
    
    for entry in dir.filter_map(|e| e.ok()) {
        let path = entry.path();
        
        // Skip hidden files/folders and system folders
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') || 
               name_str == "node_modules" ||
               name_str == "Library" ||
               name_str == ".Trash" {
                continue;
            }
        }
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if VIDEO_EXTENSIONS.contains(&ext_str.as_str()) {
                    if let Some(video) = create_video_from_path(&path) {
                        *folder_counts.entry(video.folder_path.clone()).or_insert(0) += 1;
                        videos.push(video);
                    }
                }
            }
        } else if path.is_dir() && current_depth < max_depth {
            // Only scan subdirectories if within depth limit
            // Don't follow symlinks
            if !path.is_symlink() {
                scan_directory_shallow(
                    &path.to_string_lossy(), 
                    videos, 
                    folder_counts, 
                    current_depth + 1,
                    max_depth
                );
            }
        }
    }
}

pub fn create_video_from_path(path: &Path) -> Option<Video> {
    let filename = path.file_name()?.to_string_lossy().to_string();
    let folder_path = path.parent()?.to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();
    
    let size = std::fs::metadata(path).ok()?.len();
    let now = chrono::Utc::now().to_rfc3339();
    
    // Check for existing thumbnail
    let thumbnail_path = find_thumbnail_for_video(path);
    
    Some(Video {
        id: uuid::Uuid::new_v4().to_string(),
        path: path_str,
        filename,
        folder_path,
        size,
        duration: None,
        thumbnail_path,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn find_thumbnail_for_video(video_path: &Path) -> Option<String> {
    let stem = video_path.file_stem()?;
    let parent = video_path.parent()?;
    
    for ext in IMAGE_EXTENSIONS {
        let thumb_path = parent.join(format!("{}.{}", stem.to_string_lossy(), ext));
        if thumb_path.exists() {
            return Some(thumb_path.to_string_lossy().to_string());
        }
    }
    
    None
}

fn build_folder_tree(root_path: &str, video_counts: &HashMap<String, usize>) -> FolderNode {
    let root = Path::new(root_path);
    let name = root.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root_path.to_string());
    
    let mut children: Vec<FolderNode> = Vec::new();
    
    // Read immediate children only
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            
            // Skip hidden folders
            if let Some(fname) = path.file_name() {
                if fname.to_string_lossy().starts_with('.') {
                    continue;
                }
            }
            
            if path.is_dir() && !path.is_symlink() {
                let child_path = path.to_string_lossy().to_string();
                let child_name = path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                
                // Count videos in this folder and its immediate children
                let video_count = count_videos_in_path(&child_path, video_counts);
                
                if video_count > 0 {
                    children.push(FolderNode {
                        path: child_path,
                        name: child_name,
                        children: Vec::new(),
                        video_count,
                    });
                }
            }
        }
    }
    
    // Sort children by name
    children.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    // Calculate root video count
    let direct_count = video_counts.get(root_path).copied().unwrap_or(0);
    let children_count: usize = children.iter().map(|c| c.video_count).sum();
    
    FolderNode {
        path: root_path.to_string(),
        name,
        children,
        video_count: direct_count + children_count,
    }
}

fn count_videos_in_path(folder_path: &str, video_counts: &HashMap<String, usize>) -> usize {
    let mut count = video_counts.get(folder_path).copied().unwrap_or(0);
    
    // Also count videos in subfolders that match this path prefix
    for (path, video_count) in video_counts {
        if path.starts_with(folder_path) && path != folder_path {
            count += video_count;
        }
    }
    
    count
}

pub fn get_videos_in_folder(folder_path: &str) -> Vec<PathBuf> {
    let mut videos = Vec::new();
    
    // Only scan the specific folder, not recursively
    if let Ok(entries) = fs::read_dir(folder_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if VIDEO_EXTENSIONS.contains(&ext_str.as_str()) {
                        videos.push(path);
                    }
                }
            }
        }
    }
    
    videos
}
