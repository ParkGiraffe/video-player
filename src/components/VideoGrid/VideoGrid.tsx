import { useEffect, useState, useRef } from 'react';
import { Play, Film, MoreVertical, Trash2, ExternalLink } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Video } from '../../types';
import './VideoGrid.css';

export function VideoGrid() {
  const { 
    videos, 
    totalVideos,
    hasMore,
    viewMode, 
    selectedVideo,
    isLoading,
    openPlayer,
    playWithMpv,
    checkMpvInstalled,
    selectVideo,
    loadMoreVideos,
  } = useAppStore();
  
  const [mpvInstalled, setMpvInstalled] = useState<boolean | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkMpvInstalled().then(setMpvInstalled);
  }, []);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMoreVideos();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  const handlePlay = async (video: Video) => {
    if (mpvInstalled) {
      try {
        await playWithMpv(video);
      } catch (err) {
        console.error('mpv failed, falling back to built-in player:', err);
        openPlayer(video);
      }
    } else {
      openPlayer(video);
    }
  };

  if (isLoading) {
    return (
      <div className="video-grid-loading">
        <div className="loading-spinner" />
        <p>로딩 중...</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="video-grid-empty">
        <Film size={48} />
        <h3>동영상이 없습니다</h3>
        <p>사이드바에서 폴더를 추가하고 스캔하세요.</p>
      </div>
    );
  }

  return (
    <div className={`video-grid ${viewMode}`}>
      {videos.map((video) => (
        <VideoCard 
          key={video.id} 
          video={video}
          isSelected={selectedVideo?.id === video.id}
          onPlay={() => handlePlay(video)}
          onSelect={() => selectVideo(video)}
          mpvInstalled={mpvInstalled ?? false}
          viewMode={viewMode}
        />
      ))}
      
      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="load-more-trigger">
          <div className="loading-spinner small" />
          <span>더 불러오는 중... ({videos.length} / {totalVideos})</span>
        </div>
      )}
    </div>
  );
}

interface VideoCardProps {
  video: Video;
  isSelected: boolean;
  onPlay: () => void;
  onSelect: () => void;
  mpvInstalled: boolean;
  viewMode: 'grid' | 'list';
}

function VideoCard({ video, isSelected, onPlay, onSelect, mpvInstalled, viewMode }: VideoCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const { deleteVideo, openPlayer } = useAppStore();

  useEffect(() => {
    if (video.thumbnail_path) {
      setThumbnailSrc(convertFileSrc(video.thumbnail_path));
    }
  }, [video.thumbnail_path]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 동영상을 목록에서 제거하시겠습니까?')) {
      await deleteVideo(video.id);
    }
    setShowMenu(false);
  };

  const handleBuiltInPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPlayer(video);
    setShowMenu(false);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  if (viewMode === 'list') {
    return (
      <div 
        className={`video-list-item ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div className="video-list-thumbnail">
          {thumbnailSrc ? (
            <img src={thumbnailSrc} alt={video.filename} loading="lazy" />
          ) : (
            <div className="video-placeholder">
              <Film size={24} />
            </div>
          )}
          <button className="play-overlay" onClick={(e) => { e.stopPropagation(); onPlay(); }}>
            <Play size={20} fill="white" />
          </button>
        </div>
        <div className="video-list-info">
          <span className="video-list-name">{video.filename}</span>
          <span className="video-list-path">{video.folder_path}</span>
        </div>
        <div className="video-list-meta">
          <span className="video-list-size">{formatFileSize(video.size)}</span>
        </div>
        <div className="video-list-actions">
          <button className="action-btn" onClick={handleMenuClick}>
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <div className="action-menu">
              {mpvInstalled && (
                <button onClick={handleBuiltInPlayer}>
                  <ExternalLink size={14} />
                  <span>내장 플레이어</span>
                </button>
              )}
              <button onClick={handleDelete}>
                <Trash2 size={14} />
                <span>제거</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`video-card ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('video-path', video.path);
        e.dataTransfer.setData('video-id', video.id);
      }}
    >
      <div className="video-thumbnail">
        {thumbnailSrc ? (
          <img src={thumbnailSrc} alt={video.filename} loading="lazy" />
        ) : (
          <div className="video-placeholder">
            <Film size={32} />
          </div>
        )}
        <div className="video-overlay">
          <button className="play-btn" onClick={(e) => { e.stopPropagation(); onPlay(); }}>
            <Play size={24} fill="white" />
          </button>
        </div>
        <button className="menu-btn" onClick={handleMenuClick}>
          <MoreVertical size={16} />
        </button>
        {showMenu && (
          <div className="video-menu">
            {mpvInstalled && (
              <button onClick={handleBuiltInPlayer}>
                <ExternalLink size={14} />
                <span>내장 플레이어</span>
              </button>
            )}
            <button onClick={handleDelete}>
              <Trash2 size={14} />
              <span>제거</span>
            </button>
          </div>
        )}
      </div>
      <div className="video-info">
        <h4 className="video-title" title={video.filename}>{video.filename}</h4>
        <span className="video-size">{formatFileSize(video.size)}</span>
      </div>
    </div>
  );
}
