use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Video {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub folder_path: String,
    pub size: u64,
    pub duration: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Language {
    pub id: String,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MountedFolder {
    pub id: String,
    pub path: String,
    pub name: String,
    pub scan_depth: usize,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoWithMetadata {
    pub video: Video,
    pub tags: Vec<Tag>,
    pub participants: Vec<Participant>,
    pub languages: Vec<Language>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderNode {
    pub path: String,
    pub name: String,
    pub children: Vec<FolderNode>,
    pub video_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub total_videos: usize,
    pub new_videos: usize,
    pub folders: Vec<FolderNode>,
    pub videos: Vec<Video>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptions {
    pub folder_path: Option<String>,
    pub tag_ids: Vec<String>,
    pub participant_ids: Vec<String>,
    pub language_ids: Vec<String>,
    pub search_query: Option<String>,
    pub sort_by: String,
    pub sort_order: String,
    pub limit: usize,
    pub offset: usize,
}

impl Default for FilterOptions {
    fn default() -> Self {
        Self {
            folder_path: None,
            tag_ids: Vec::new(),
            participant_ids: Vec::new(),
            language_ids: Vec::new(),
            search_query: None,
            sort_by: "filename".to_string(),
            sort_order: "asc".to_string(),
            limit: 100,
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedVideos {
    pub videos: Vec<Video>,
    pub total: usize,
    pub has_more: bool,
}

