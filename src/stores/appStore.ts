import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  Video,
  Tag,
  Participant,
  Language,
  MountedFolder,
  FolderNode,
  FilterOptions,
  ViewMode,
  ScanResult,
  VideoWithMetadata,
} from '../types';

interface PaginatedVideos {
  videos: Video[];
  total: number;
  has_more: boolean;
}

interface AppState {
  // Data
  videos: Video[];
  totalVideos: number;
  hasMore: boolean;
  tags: Tag[];
  participants: Participant[];
  languages: Language[];
  mountedFolders: MountedFolder[];
  folderTrees: Map<string, FolderNode>;
  
  // UI State
  selectedVideo: Video | null;
  selectedVideoMetadata: VideoWithMetadata | null;
  isPlayerOpen: boolean;
  viewMode: ViewMode;
  isSidebarOpen: boolean;
  isLoading: boolean;
  isScanningFolder: string | null;
  
  // Filter
  filter: FilterOptions;
  
  // Actions - Data Loading
  loadMountedFolders: () => Promise<void>;
  loadVideos: () => Promise<void>;
  loadMoreVideos: () => Promise<void>;
  loadTags: () => Promise<void>;
  loadParticipants: () => Promise<void>;
  loadLanguages: () => Promise<void>;
  
  // Actions - Folders
  addMountedFolder: (path: string, scanDepth?: number) => Promise<MountedFolder>;
  removeMountedFolder: (path: string) => Promise<void>;
  updateFolderScanDepth: (path: string, scanDepth: number) => Promise<void>;
  scanFolder: (path: string) => Promise<ScanResult>;
  
  // Actions - Videos
  selectVideo: (video: Video | null) => void;
  openPlayer: (video: Video) => Promise<void>;
  closePlayer: () => void;
  playWithMpv: (video: Video) => Promise<void>;
  checkMpvInstalled: () => Promise<boolean>;
  moveVideoFile: (oldPath: string, newFolder: string) => Promise<Video>;
  deleteVideo: (videoId: string) => Promise<void>;
  
  // Actions - Tags
  createTag: (name: string, color: string) => Promise<Tag>;
  updateTag: (id: string, name: string, color: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  setVideoTags: (videoId: string, tagIds: string[]) => Promise<void>;
  
  // Actions - Participants
  createParticipant: (name: string) => Promise<Participant>;
  updateParticipant: (id: string, name: string) => Promise<void>;
  deleteParticipant: (id: string) => Promise<void>;
  setVideoParticipants: (videoId: string, participantIds: string[]) => Promise<void>;
  
  // Actions - Languages
  createLanguage: (code: string, name: string) => Promise<Language>;
  updateLanguage: (id: string, code: string, name: string) => Promise<void>;
  deleteLanguage: (id: string) => Promise<void>;
  setVideoLanguages: (videoId: string, languageIds: string[]) => Promise<void>;
  
  // Actions - Filter
  setFilter: (filter: Partial<FilterOptions>) => void;
  resetFilter: () => void;
  
  // Actions - UI
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
}

const PAGE_SIZE = 100;

const defaultFilter: FilterOptions = {
  folder_path: null,
  tag_ids: [],
  participant_ids: [],
  language_ids: [],
  search_query: null,
  sort_by: 'filename',
  sort_order: 'asc',
  limit: PAGE_SIZE,
  offset: 0,
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial State
  videos: [],
  totalVideos: 0,
  hasMore: false,
  tags: [],
  participants: [],
  languages: [],
  mountedFolders: [],
  folderTrees: new Map(),
  selectedVideo: null,
  selectedVideoMetadata: null,
  isPlayerOpen: false,
  viewMode: 'grid',
  isSidebarOpen: true,
  isLoading: false,
  isScanningFolder: null,
  filter: defaultFilter,
  
  // Data Loading
  loadMountedFolders: async () => {
    try {
      const folders = await invoke<MountedFolder[]>('get_mounted_folders');
      set({ mountedFolders: folders });
    } catch (err) {
      console.error('Failed to load mounted folders:', err);
    }
  },
  
  loadVideos: async () => {
    set({ isLoading: true });
    try {
      const filter = { ...get().filter, offset: 0, limit: PAGE_SIZE };
      const result = await invoke<PaginatedVideos>('get_videos', { filter });
      set({ 
        videos: result.videos,
        totalVideos: result.total,
        hasMore: result.has_more,
        filter,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load videos:', err);
      set({ isLoading: false });
    }
  },
  
  loadMoreVideos: async () => {
    if (!get().hasMore || get().isLoading) return;
    
    set({ isLoading: true });
    try {
      const currentFilter = get().filter;
      const newOffset = currentFilter.offset + PAGE_SIZE;
      const filter = { ...currentFilter, offset: newOffset };
      
      const result = await invoke<PaginatedVideos>('get_videos', { filter });
      set({ 
        videos: [...get().videos, ...result.videos],
        hasMore: result.has_more,
        filter,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load more videos:', err);
      set({ isLoading: false });
    }
  },
  
  loadTags: async () => {
    try {
      const tags = await invoke<Tag[]>('get_tags');
      set({ tags });
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  },
  
  loadParticipants: async () => {
    try {
      const participants = await invoke<Participant[]>('get_participants');
      set({ participants });
    } catch (err) {
      console.error('Failed to load participants:', err);
    }
  },
  
  loadLanguages: async () => {
    try {
      const languages = await invoke<Language[]>('get_languages');
      set({ languages });
    } catch (err) {
      console.error('Failed to load languages:', err);
    }
  },
  
  // Folders
  addMountedFolder: async (path, scanDepth = 2) => {
    const folder = await invoke<MountedFolder>('add_mounted_folder', { path, scanDepth });
    await get().loadMountedFolders();
    
    // Start scanning in background (don't await)
    get().scanFolder(path).catch(err => {
      console.error('Background scan failed:', err);
    });
    
    return folder;
  },
  
  removeMountedFolder: async (path) => {
    await invoke('remove_mounted_folder', { path });
    
    // Remove folder tree
    const newTrees = new Map(get().folderTrees);
    newTrees.delete(path);
    set({ folderTrees: newTrees });
    
    await get().loadMountedFolders();
    await get().loadVideos();
  },
  
  updateFolderScanDepth: async (path, scanDepth) => {
    await invoke('update_folder_scan_depth', { path, scanDepth });
    await get().loadMountedFolders();
  },
  
  scanFolder: async (path) => {
    set({ isScanningFolder: path });
    try {
      const result = await invoke<ScanResult>('scan_folder', { folderPath: path });
      
      // Update folder trees
      if (result.folders.length > 0) {
        const newTrees = new Map(get().folderTrees);
        newTrees.set(path, result.folders[0]);
        set({ folderTrees: newTrees });
      }
      
      // Reload videos
      await get().loadVideos();
      
      return result;
    } finally {
      set({ isScanningFolder: null });
    }
  },
  
  // Videos
  selectVideo: (video) => {
    set({ selectedVideo: video });
    if (video) {
      invoke<VideoWithMetadata>('get_video_with_metadata', { videoId: video.id })
        .then((metadata) => set({ selectedVideoMetadata: metadata }))
        .catch(console.error);
    } else {
      set({ selectedVideoMetadata: null });
    }
  },
  
  openPlayer: async (video) => {
    set({ selectedVideo: video, isPlayerOpen: true });
    try {
      const metadata = await invoke<VideoWithMetadata>('get_video_with_metadata', { videoId: video.id });
      set({ selectedVideoMetadata: metadata });
    } catch (err) {
      console.error('Failed to get video metadata:', err);
    }
  },
  
  closePlayer: () => {
    set({ isPlayerOpen: false });
  },
  
  playWithMpv: async (video) => {
    try {
      const position = await invoke<number | null>('get_playback_position', { videoId: video.id });
      const subtitlePath = await invoke<string | null>('find_subtitle_for_video', { videoPath: video.path });
      
      await invoke('play_video_mpv', {
        videoPath: video.path,
        subtitlePath,
        startPosition: position,
      });
    } catch (err) {
      console.error('Failed to play with mpv:', err);
      throw err;
    }
  },
  
  checkMpvInstalled: async () => {
    try {
      return await invoke<boolean>('check_mpv_installed');
    } catch {
      return false;
    }
  },
  
  moveVideoFile: async (oldPath, newFolder) => {
    const video = await invoke<Video>('move_video_file', { oldPath, newFolder });
    await get().loadVideos();
    return video;
  },
  
  deleteVideo: async (videoId) => {
    await invoke('delete_video', { videoId });
    await get().loadVideos();
    set({ selectedVideo: null, selectedVideoMetadata: null });
  },
  
  // Tags
  createTag: async (name, color) => {
    const tag = await invoke<Tag>('create_tag', { name, color });
    await get().loadTags();
    return tag;
  },
  
  updateTag: async (id, name, color) => {
    await invoke('update_tag', { id, name, color });
    await get().loadTags();
  },
  
  deleteTag: async (id) => {
    await invoke('delete_tag', { id });
    await get().loadTags();
  },
  
  setVideoTags: async (videoId, tagIds) => {
    await invoke('set_video_tags', { videoId, tagIds });
    if (get().selectedVideo?.id === videoId) {
      const metadata = await invoke<VideoWithMetadata>('get_video_with_metadata', { videoId });
      set({ selectedVideoMetadata: metadata });
    }
  },
  
  // Participants
  createParticipant: async (name) => {
    const participant = await invoke<Participant>('create_participant', { name });
    await get().loadParticipants();
    return participant;
  },
  
  updateParticipant: async (id, name) => {
    await invoke('update_participant', { id, name });
    await get().loadParticipants();
  },
  
  deleteParticipant: async (id) => {
    await invoke('delete_participant', { id });
    await get().loadParticipants();
  },
  
  setVideoParticipants: async (videoId, participantIds) => {
    await invoke('set_video_participants', { videoId, participantIds });
    if (get().selectedVideo?.id === videoId) {
      const metadata = await invoke<VideoWithMetadata>('get_video_with_metadata', { videoId });
      set({ selectedVideoMetadata: metadata });
    }
  },
  
  // Languages
  createLanguage: async (code, name) => {
    const language = await invoke<Language>('create_language', { code, name });
    await get().loadLanguages();
    return language;
  },
  
  updateLanguage: async (id, code, name) => {
    await invoke('update_language', { id, code, name });
    await get().loadLanguages();
  },
  
  deleteLanguage: async (id) => {
    await invoke('delete_language', { id });
    await get().loadLanguages();
  },
  
  setVideoLanguages: async (videoId, languageIds) => {
    await invoke('set_video_languages', { videoId, languageIds });
    if (get().selectedVideo?.id === videoId) {
      const metadata = await invoke<VideoWithMetadata>('get_video_with_metadata', { videoId });
      set({ selectedVideoMetadata: metadata });
    }
  },
  
  // Filter
  setFilter: (newFilter) => {
    set({ filter: { ...get().filter, ...newFilter, offset: 0 } });
    get().loadVideos();
  },
  
  resetFilter: () => {
    set({ filter: defaultFilter });
    get().loadVideos();
  },
  
  // UI
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
}));
