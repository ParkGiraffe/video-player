use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use std::sync::Mutex;
use crate::models::*;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path();
        
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open(&db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }
    
    fn get_db_path() -> PathBuf {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("VideoPlayer");
        data_dir.join("database.sqlite")
    }
    
    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute_batch(r#"
            -- Mounted folders table
            CREATE TABLE IF NOT EXISTS mounted_folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                scan_depth INTEGER NOT NULL DEFAULT 2,
                created_at TEXT NOT NULL
            );
            
            -- Videos table
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                duration REAL,
                thumbnail_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            
            -- Tags table
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#6366f1'
            );
            
            -- Video-Tags junction table
            CREATE TABLE IF NOT EXISTS video_tags (
                video_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (video_id, tag_id),
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            
            -- Participants table
            CREATE TABLE IF NOT EXISTS participants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );
            
            -- Video-Participants junction table
            CREATE TABLE IF NOT EXISTS video_participants (
                video_id TEXT NOT NULL,
                participant_id TEXT NOT NULL,
                PRIMARY KEY (video_id, participant_id),
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
                FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
            );
            
            -- Languages table
            CREATE TABLE IF NOT EXISTS languages (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL
            );
            
            -- Video-Languages junction table
            CREATE TABLE IF NOT EXISTS video_languages (
                video_id TEXT NOT NULL,
                language_id TEXT NOT NULL,
                PRIMARY KEY (video_id, language_id),
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
                FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
            );
            
            -- Playback history
            CREATE TABLE IF NOT EXISTS playback_history (
                video_id TEXT PRIMARY KEY,
                position REAL NOT NULL DEFAULT 0,
                last_played TEXT NOT NULL,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            );
            
            -- Create indexes for better performance
            CREATE INDEX IF NOT EXISTS idx_videos_folder ON videos(folder_path);
            CREATE INDEX IF NOT EXISTS idx_videos_filename ON videos(filename);
        "#)?;
        
        Ok(())
    }
    
    // ========== Mounted Folders ==========
    
    pub fn add_mounted_folder(&self, path: &str, name: &str, scan_depth: usize) -> Result<MountedFolder> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT OR REPLACE INTO mounted_folders (id, path, name, scan_depth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, path, name, scan_depth as i64, created_at],
        )?;
        
        Ok(MountedFolder {
            id,
            path: path.to_string(),
            name: name.to_string(),
            scan_depth,
            created_at,
        })
    }
    
    pub fn get_mounted_folders(&self) -> Result<Vec<MountedFolder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, path, name, scan_depth, created_at FROM mounted_folders")?;
        
        let folders = stmt.query_map([], |row| {
            Ok(MountedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                scan_depth: row.get::<_, i64>(3)? as usize,
                created_at: row.get(4)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(folders)
    }
    
    pub fn get_mounted_folder(&self, path: &str) -> Result<Option<MountedFolder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, path, name, scan_depth, created_at FROM mounted_folders WHERE path = ?1")?;
        
        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(MountedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                scan_depth: row.get::<_, i64>(3)? as usize,
                created_at: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn update_folder_scan_depth(&self, path: &str, scan_depth: usize) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE mounted_folders SET scan_depth = ?1 WHERE path = ?2",
            params![scan_depth as i64, path],
        )?;
        Ok(())
    }
    
    pub fn remove_mounted_folder(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM mounted_folders WHERE path = ?1", params![path])?;
        // Also remove videos from this folder
        conn.execute("DELETE FROM videos WHERE folder_path LIKE ?1 || '%'", params![path])?;
        Ok(())
    }
    
    pub fn clear_folder_videos(&self, folder_path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Remove all videos that belong to this folder or its subfolders
        conn.execute("DELETE FROM videos WHERE folder_path LIKE ?1 || '%'", params![folder_path])?;
        Ok(())
    }
    
    // ========== Videos ==========
    
    pub fn upsert_video(&self, video: &Video) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO videos (id, path, filename, folder_path, size, duration, thumbnail_path, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
               ON CONFLICT(path) DO UPDATE SET
                   filename = excluded.filename,
                   folder_path = excluded.folder_path,
                   size = excluded.size,
                   duration = excluded.duration,
                   thumbnail_path = excluded.thumbnail_path,
                   updated_at = excluded.updated_at"#,
            params![
                video.id,
                video.path,
                video.filename,
                video.folder_path,
                video.size,
                video.duration,
                video.thumbnail_path,
                video.created_at,
                video.updated_at,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_video_by_path(&self, path: &str) -> Result<Option<Video>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, filename, folder_path, size, duration, thumbnail_path, created_at, updated_at FROM videos WHERE path = ?1"
        )?;
        
        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Video {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                folder_path: row.get(3)?,
                size: row.get(4)?,
                duration: row.get(5)?,
                thumbnail_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_videos(&self, filter: &FilterOptions) -> Result<Vec<Video>> {
        let conn = self.conn.lock().unwrap();
        
        let mut sql = String::from(
            "SELECT DISTINCT v.id, v.path, v.filename, v.folder_path, v.size, v.duration, v.thumbnail_path, v.created_at, v.updated_at FROM videos v"
        );
        let mut conditions: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        
        // Join tables if filtering by tags, participants, or languages
        if !filter.tag_ids.is_empty() {
            sql.push_str(" INNER JOIN video_tags vt ON v.id = vt.video_id");
        }
        if !filter.participant_ids.is_empty() {
            sql.push_str(" INNER JOIN video_participants vp ON v.id = vp.video_id");
        }
        if !filter.language_ids.is_empty() {
            sql.push_str(" INNER JOIN video_languages vl ON v.id = vl.video_id");
        }
        
        // Folder filter
        if let Some(ref folder) = filter.folder_path {
            conditions.push(format!("v.folder_path LIKE ?{}", params_vec.len() + 1));
            params_vec.push(Box::new(format!("{}%", folder)));
        }
        
        // Tag filter
        if !filter.tag_ids.is_empty() {
            let placeholders: Vec<String> = filter.tag_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vt.tag_id IN ({})", placeholders.join(",")));
            for tag_id in &filter.tag_ids {
                params_vec.push(Box::new(tag_id.clone()));
            }
        }
        
        // Participant filter
        if !filter.participant_ids.is_empty() {
            let placeholders: Vec<String> = filter.participant_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vp.participant_id IN ({})", placeholders.join(",")));
            for p_id in &filter.participant_ids {
                params_vec.push(Box::new(p_id.clone()));
            }
        }
        
        // Language filter
        if !filter.language_ids.is_empty() {
            let placeholders: Vec<String> = filter.language_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vl.language_id IN ({})", placeholders.join(",")));
            for l_id in &filter.language_ids {
                params_vec.push(Box::new(l_id.clone()));
            }
        }
        
        // Search query
        if let Some(ref query) = filter.search_query {
            if !query.is_empty() {
                conditions.push(format!("v.filename LIKE ?{}", params_vec.len() + 1));
                params_vec.push(Box::new(format!("%{}%", query)));
            }
        }
        
        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }
        
        // Sorting
        let order = if filter.sort_order == "desc" { "DESC" } else { "ASC" };
        let sort_column = match filter.sort_by.as_str() {
            "size" => "v.size",
            "created_at" => "v.created_at",
            "updated_at" => "v.updated_at",
            _ => "v.filename",
        };
        sql.push_str(&format!(" ORDER BY {} {}", sort_column, order));
        
        // Add LIMIT and OFFSET for pagination
        sql.push_str(&format!(" LIMIT {} OFFSET {}", filter.limit, filter.offset));
        
        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        
        let videos = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(Video {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                folder_path: row.get(3)?,
                size: row.get(4)?,
                duration: row.get(5)?,
                thumbnail_path: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(videos)
    }
    
    pub fn get_video_count(&self, filter: &FilterOptions) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        
        let mut sql = String::from("SELECT COUNT(DISTINCT v.id) FROM videos v");
        let mut conditions: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        
        // Join tables if filtering
        if !filter.tag_ids.is_empty() {
            sql.push_str(" INNER JOIN video_tags vt ON v.id = vt.video_id");
        }
        if !filter.participant_ids.is_empty() {
            sql.push_str(" INNER JOIN video_participants vp ON v.id = vp.video_id");
        }
        if !filter.language_ids.is_empty() {
            sql.push_str(" INNER JOIN video_languages vl ON v.id = vl.video_id");
        }
        
        // Folder filter
        if let Some(ref folder) = filter.folder_path {
            conditions.push(format!("v.folder_path LIKE ?{}", params_vec.len() + 1));
            params_vec.push(Box::new(format!("{}%", folder)));
        }
        
        // Tag filter
        if !filter.tag_ids.is_empty() {
            let placeholders: Vec<String> = filter.tag_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vt.tag_id IN ({})", placeholders.join(",")));
            for tag_id in &filter.tag_ids {
                params_vec.push(Box::new(tag_id.clone()));
            }
        }
        
        // Participant filter
        if !filter.participant_ids.is_empty() {
            let placeholders: Vec<String> = filter.participant_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vp.participant_id IN ({})", placeholders.join(",")));
            for p_id in &filter.participant_ids {
                params_vec.push(Box::new(p_id.clone()));
            }
        }
        
        // Language filter
        if !filter.language_ids.is_empty() {
            let placeholders: Vec<String> = filter.language_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", params_vec.len() + i + 1))
                .collect();
            conditions.push(format!("vl.language_id IN ({})", placeholders.join(",")));
            for l_id in &filter.language_ids {
                params_vec.push(Box::new(l_id.clone()));
            }
        }
        
        // Search query
        if let Some(ref query) = filter.search_query {
            if !query.is_empty() {
                conditions.push(format!("v.filename LIKE ?{}", params_vec.len() + 1));
                params_vec.push(Box::new(format!("%{}%", query)));
            }
        }
        
        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }
        
        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        let count: usize = conn.query_row(&sql, params_refs.as_slice(), |row| row.get(0))?;
        Ok(count)
    }
    
    pub fn delete_video(&self, video_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM videos WHERE id = ?1", params![video_id])?;
        Ok(())
    }
    
    pub fn update_video_path(&self, old_path: &str, new_path: &str, new_folder: &str, new_filename: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let updated_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE videos SET path = ?1, folder_path = ?2, filename = ?3, updated_at = ?4 WHERE path = ?5",
            params![new_path, new_folder, new_filename, updated_at, old_path],
        )?;
        Ok(())
    }
    
    // ========== Tags ==========
    
    pub fn create_tag(&self, name: &str, color: &str) -> Result<Tag> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
            params![id, name, color],
        )?;
        
        Ok(Tag {
            id,
            name: name.to_string(),
            color: color.to_string(),
        })
    }
    
    pub fn get_tags(&self) -> Result<Vec<Tag>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")?;
        
        let tags = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(tags)
    }
    
    pub fn update_tag(&self, id: &str, name: &str, color: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
            params![name, color, id],
        )?;
        Ok(())
    }
    
    pub fn delete_tag(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn get_video_tags(&self, video_id: &str) -> Result<Vec<Tag>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color FROM tags t 
             INNER JOIN video_tags vt ON t.id = vt.tag_id 
             WHERE vt.video_id = ?1"
        )?;
        
        let tags = stmt.query_map(params![video_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(tags)
    }
    
    pub fn set_video_tags(&self, video_id: &str, tag_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM video_tags WHERE video_id = ?1", params![video_id])?;
        
        for tag_id in tag_ids {
            conn.execute(
                "INSERT INTO video_tags (video_id, tag_id) VALUES (?1, ?2)",
                params![video_id, tag_id],
            )?;
        }
        Ok(())
    }
    
    // ========== Participants ==========
    
    pub fn create_participant(&self, name: &str) -> Result<Participant> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        
        conn.execute(
            "INSERT INTO participants (id, name) VALUES (?1, ?2)",
            params![id, name],
        )?;
        
        Ok(Participant {
            id,
            name: name.to_string(),
        })
    }
    
    pub fn get_participants(&self) -> Result<Vec<Participant>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name FROM participants ORDER BY name")?;
        
        let participants = stmt.query_map([], |row| {
            Ok(Participant {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(participants)
    }
    
    pub fn update_participant(&self, id: &str, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE participants SET name = ?1 WHERE id = ?2", params![name, id])?;
        Ok(())
    }
    
    pub fn delete_participant(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM participants WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn get_video_participants(&self, video_id: &str) -> Result<Vec<Participant>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name FROM participants p 
             INNER JOIN video_participants vp ON p.id = vp.participant_id 
             WHERE vp.video_id = ?1"
        )?;
        
        let participants = stmt.query_map(params![video_id], |row| {
            Ok(Participant {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(participants)
    }
    
    pub fn set_video_participants(&self, video_id: &str, participant_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM video_participants WHERE video_id = ?1", params![video_id])?;
        
        for p_id in participant_ids {
            conn.execute(
                "INSERT INTO video_participants (video_id, participant_id) VALUES (?1, ?2)",
                params![video_id, p_id],
            )?;
        }
        Ok(())
    }
    
    // ========== Languages ==========
    
    pub fn create_language(&self, code: &str, name: &str) -> Result<Language> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        
        conn.execute(
            "INSERT INTO languages (id, code, name) VALUES (?1, ?2, ?3)",
            params![id, code, name],
        )?;
        
        Ok(Language {
            id,
            code: code.to_string(),
            name: name.to_string(),
        })
    }
    
    pub fn get_languages(&self) -> Result<Vec<Language>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, code, name FROM languages ORDER BY name")?;
        
        let languages = stmt.query_map([], |row| {
            Ok(Language {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(languages)
    }
    
    pub fn update_language(&self, id: &str, code: &str, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE languages SET code = ?1, name = ?2 WHERE id = ?3",
            params![code, name, id],
        )?;
        Ok(())
    }
    
    pub fn delete_language(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM languages WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn get_video_languages(&self, video_id: &str) -> Result<Vec<Language>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT l.id, l.code, l.name FROM languages l 
             INNER JOIN video_languages vl ON l.id = vl.language_id 
             WHERE vl.video_id = ?1"
        )?;
        
        let languages = stmt.query_map(params![video_id], |row| {
            Ok(Language {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(languages)
    }
    
    pub fn set_video_languages(&self, video_id: &str, language_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM video_languages WHERE video_id = ?1", params![video_id])?;
        
        for l_id in language_ids {
            conn.execute(
                "INSERT INTO video_languages (video_id, language_id) VALUES (?1, ?2)",
                params![video_id, l_id],
            )?;
        }
        Ok(())
    }
    
    // ========== Playback History ==========
    
    pub fn save_playback_position(&self, video_id: &str, position: f64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let last_played = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT OR REPLACE INTO playback_history (video_id, position, last_played) VALUES (?1, ?2, ?3)",
            params![video_id, position, last_played],
        )?;
        Ok(())
    }
    
    pub fn get_playback_position(&self, video_id: &str) -> Result<Option<f64>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT position FROM playback_history WHERE video_id = ?1")?;
        
        let mut rows = stmt.query(params![video_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }
}

