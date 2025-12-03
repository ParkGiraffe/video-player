import { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ChevronFirst,
  ChevronLast,
  AlertCircle,
  Monitor
} from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Video } from '../../types';
import './Player.css';

// Formats supported by HTML5 video
const HTML5_SUPPORTED_FORMATS = ['mp4', 'webm', 'm4v'];

const isHtml5Supported = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return HTML5_SUPPORTED_FORMATS.includes(ext);
};

interface PlayerProps {
  video: Video;
  onClose: () => void;
}

export function Player({ video, onClose }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  
  const controlsTimeoutRef = useRef<number | undefined>(undefined);
  
  const { 
    videos, 
    playPreviousVideo, 
    playNextVideo, 
    getCurrentVideoIndex,
    playWithMpv,
    checkMpvInstalled,
  } = useAppStore();
  
  const currentIndex = getCurrentVideoIndex();
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < videos.length - 1;
  const isSupported = isHtml5Supported(video.filename);
  const [videoError, setVideoError] = useState(false);
  const [mpvInstalled, setMpvInstalled] = useState(false);
  
  useEffect(() => {
    checkMpvInstalled().then(setMpvInstalled);
  }, []);
  
  useEffect(() => {
    setVideoError(false);
  }, [video.id]);
  
  const handleOpenInMpv = async () => {
    try {
      await playWithMpv(video);
      onClose();
    } catch (err) {
      console.error('Failed to open in mpv:', err);
    }
  };

  // Load saved playback position
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const position = await invoke<number | null>('get_playback_position', { videoId: video.id });
        if (position && videoRef.current) {
          videoRef.current.currentTime = position;
        }
      } catch (err) {
        console.error('Failed to load playback position:', err);
      }
    };
    loadPosition();
  }, [video.id]);

  // Save playback position periodically
  useEffect(() => {
    const saveInterval = setInterval(async () => {
      if (videoRef.current && currentTime > 0) {
        try {
          await invoke('save_playback_position', { 
            videoId: video.id, 
            position: currentTime 
          });
        } catch (err) {
          console.error('Failed to save playback position:', err);
        }
      }
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [video.id, currentTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            playPreviousVideo();
          } else {
            skip(-10);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            playNextVideo();
          } else {
            skip(10);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            toggleFullscreen();
          } else {
            onClose();
          }
          break;
        case 'n':
          e.preventDefault();
          playNextVideo();
          break;
        case 'p':
          e.preventDefault();
          playPreviousVideo();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const skip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (!isFullscreen) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !videoRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = percent * duration;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setHoverTime(percent * duration);
    setHoverPosition(e.clientX - rect.left);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setVolume(value);
    if (videoRef.current) {
      videoRef.current.volume = value;
    }
    if (value > 0 && isMuted) {
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSettings(false);
  };

  const handleProgress = () => {
    if (videoRef.current) {
      const bufferedEnd = videoRef.current.buffered.length > 0
        ? videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
        : 0;
      setBuffered((bufferedEnd / duration) * 100);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    // Auto play next video
    if (hasNext) {
      setTimeout(() => playNextVideo(), 1500);
    }
  };

  const videoSrc = convertFileSrc(video.path);

  return (
    <div 
      ref={containerRef}
      className={`player-container ${showControls ? '' : 'hide-cursor'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="player-video"
        src={videoSrc}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onProgress={handleProgress}
        onEnded={handleVideoEnd}
      />
      
      {/* Gradient overlay for better visibility */}
      <div className={`player-gradient-top ${showControls ? '' : 'hidden'}`} />
      <div className={`player-gradient-bottom ${showControls ? '' : 'hidden'}`} />
      
      {/* Close Button */}
      <button className={`player-close-btn ${showControls ? '' : 'hidden'}`} onClick={onClose}>
        <X size={24} />
      </button>

      {/* Center Play Button (when paused) */}
      {!isPlaying && (
        <div className="player-center-overlay" onClick={togglePlay}>
          <button className="player-center-play">
            <Play size={48} fill="white" />
          </button>
        </div>
      )}

      {/* Video Title & Info */}
      <div className={`player-header ${showControls ? '' : 'hidden'}`}>
        <div className="player-title">{video.filename}</div>
        <div className="player-subtitle">
          {currentIndex + 1} / {videos.length}
        </div>
      </div>

      {/* Controls */}
      <div className={`player-controls ${showControls ? '' : 'hidden'}`}>
        {/* Progress Bar */}
        <div 
          ref={progressRef}
          className="player-progress"
          onClick={handleProgressClick}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverTime(null)}
        >
          <div 
            className="player-progress-buffered"
            style={{ width: `${buffered}%` }}
          />
          <div 
            className="player-progress-filled"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <div 
            className="player-progress-handle"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
          {hoverTime !== null && (
            <div 
              className="player-progress-tooltip"
              style={{ left: `${hoverPosition}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        <div className="player-controls-row">
          <div className="player-controls-left">
            {/* Previous Video */}
            <button 
              className={`control-btn ${!hasPrevious ? 'disabled' : ''}`} 
              onClick={playPreviousVideo}
              disabled={!hasPrevious}
              title="이전 영상 (P)"
            >
              <ChevronFirst size={22} />
            </button>
            
            {/* Skip Back */}
            <button className="control-btn" onClick={() => skip(-10)} title="10초 뒤로">
              <SkipBack size={20} />
            </button>
            
            {/* Play/Pause */}
            <button className="control-btn play-pause-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={24} /> : <Play size={24} fill="white" />}
            </button>
            
            {/* Skip Forward */}
            <button className="control-btn" onClick={() => skip(10)} title="10초 앞으로">
              <SkipForward size={20} />
            </button>
            
            {/* Next Video */}
            <button 
              className={`control-btn ${!hasNext ? 'disabled' : ''}`} 
              onClick={playNextVideo}
              disabled={!hasNext}
              title="다음 영상 (N)"
            >
              <ChevronLast size={22} />
            </button>
            
            {/* Volume */}
            <div className="volume-control">
              <button className="control-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <div className="volume-slider-container">
                <input
                  type="range"
                  className="volume-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                />
              </div>
            </div>

            {/* Time */}
            <div className="player-time">
              <span className="time-current">{formatTime(currentTime)}</span>
              <span className="time-separator">/</span>
              <span className="time-duration">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-controls-right">
            {/* Playback Speed */}
            <div className="speed-control">
              <button 
                className="control-btn speed-btn"
                onClick={() => setShowSettings(!showSettings)}
              >
                {playbackRate}x
              </button>
              {showSettings && (
                <div className="settings-menu">
                  <div className="settings-section">
                    <span className="settings-label">재생 속도</span>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                      <button
                        key={rate}
                        className={`settings-option ${playbackRate === rate ? 'active' : ''}`}
                        onClick={() => handlePlaybackRateChange(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Fullscreen */}
            <button className="control-btn" onClick={toggleFullscreen} title="전체화면 (F)">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
