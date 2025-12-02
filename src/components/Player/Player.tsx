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
  Settings
} from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { Video } from '../../types';
import './Player.css';

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
  
  const controlsTimeoutRef = useRef<number | undefined>(undefined);

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
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
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

  const formatTime = (seconds: number) => {
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
        onEnded={() => setIsPlaying(false)}
      />
      
      {/* Close Button */}
      <button className={`player-close-btn ${showControls ? '' : 'hidden'}`} onClick={onClose}>
        <X size={24} />
      </button>

      {/* Center Play Button (when paused) */}
      {!isPlaying && (
        <button className="player-center-play" onClick={togglePlay}>
          <Play size={48} fill="white" />
        </button>
      )}

      {/* Controls */}
      <div className={`player-controls ${showControls ? '' : 'hidden'}`}>
        {/* Progress Bar */}
        <div 
          ref={progressRef}
          className="player-progress"
          onClick={handleProgressClick}
        >
          <div 
            className="player-progress-filled"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <div 
            className="player-progress-handle"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        <div className="player-controls-row">
          <div className="player-controls-left">
            <button className="control-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button className="control-btn" onClick={() => skip(-10)}>
              <SkipBack size={18} />
            </button>
            <button className="control-btn" onClick={() => skip(10)}>
              <SkipForward size={18} />
            </button>
            
            <div className="volume-control">
              <button className="control-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
              />
            </div>

            <span className="player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="player-controls-right">
            <div className="settings-container">
              <button 
                className="control-btn"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={18} />
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
            
            <button className="control-btn" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Video Title */}
      <div className={`player-title ${showControls ? '' : 'hidden'}`}>
        {video.filename}
      </div>
    </div>
  );
}

