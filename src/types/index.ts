export interface Video {
  id: string;
  path: string;
  filename: string;
  folder_path: string;
  size: number;
  duration: number | null;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Participant {
  id: string;
  name: string;
}

export interface Language {
  id: string;
  code: string;
  name: string;
}

export interface MountedFolder {
  id: string;
  path: string;
  name: string;
  scan_depth: number;
  created_at: string;
}

export interface VideoWithMetadata {
  video: Video;
  tags: Tag[];
  participants: Participant[];
  languages: Language[];
}

export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
  video_count: number;
}

export interface ScanResult {
  total_videos: number;
  new_videos: number;
  folders: FolderNode[];
}

export interface FilterOptions {
  folder_path: string | null;
  tag_ids: string[];
  participant_ids: string[];
  language_ids: string[];
  search_query: string | null;
  sort_by: 'filename' | 'size' | 'created_at' | 'updated_at';
  sort_order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export type ViewMode = 'grid' | 'list';

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isFullscreen: boolean;
}

