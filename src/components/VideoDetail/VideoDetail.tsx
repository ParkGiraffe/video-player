import { useState, useEffect } from 'react';
import { 
  X, 
  Play, 
  Tag, 
  Users, 
  Globe, 
  Plus,
  Check,
  Film
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Video } from '../../types';
import './VideoDetail.css';

interface VideoDetailProps {
  video: Video;
  onClose: () => void;
}

export function VideoDetail({ video, onClose }: VideoDetailProps) {
  const {
    selectedVideoMetadata,
    tags,
    participants,
    languages,
    openPlayer,
    setVideoTags,
    setVideoParticipants,
    setVideoLanguages,
    createTag,
    createParticipant,
    createLanguage,
  } = useAppStore();

  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tags' | 'participants' | 'languages'>('tags');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [newLanguageCode, setNewLanguageCode] = useState('');

  useEffect(() => {
    if (video.thumbnail_path) {
      setThumbnailSrc(convertFileSrc(video.thumbnail_path));
    } else {
      setThumbnailSrc(null);
    }
  }, [video.thumbnail_path]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleTagToggle = async (tagId: string) => {
    if (!selectedVideoMetadata) return;
    
    const currentTagIds = selectedVideoMetadata.tags.map(t => t.id);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId];
    
    await setVideoTags(video.id, newTagIds);
  };

  const handleParticipantToggle = async (participantId: string) => {
    if (!selectedVideoMetadata) return;
    
    const currentIds = selectedVideoMetadata.participants.map(p => p.id);
    const newIds = currentIds.includes(participantId)
      ? currentIds.filter(id => id !== participantId)
      : [...currentIds, participantId];
    
    await setVideoParticipants(video.id, newIds);
  };

  const handleLanguageToggle = async (languageId: string) => {
    if (!selectedVideoMetadata) return;
    
    const currentIds = selectedVideoMetadata.languages.map(l => l.id);
    const newIds = currentIds.includes(languageId)
      ? currentIds.filter(id => id !== languageId)
      : [...currentIds, languageId];
    
    await setVideoLanguages(video.id, newIds);
  };

  const handleAddNew = async () => {
    if (!newItemName.trim()) return;

    try {
      if (activeTab === 'tags') {
        await createTag(newItemName, newTagColor);
      } else if (activeTab === 'participants') {
        await createParticipant(newItemName);
      } else if (activeTab === 'languages') {
        await createLanguage(newLanguageCode || newItemName.slice(0, 2).toLowerCase(), newItemName);
      }
      
      setNewItemName('');
      setNewTagColor('#6366f1');
      setNewLanguageCode('');
      setIsAddingNew(false);
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  const isTagSelected = (tagId: string) => 
    selectedVideoMetadata?.tags.some(t => t.id === tagId) || false;
  
  const isParticipantSelected = (participantId: string) => 
    selectedVideoMetadata?.participants.some(p => p.id === participantId) || false;
  
  const isLanguageSelected = (languageId: string) => 
    selectedVideoMetadata?.languages.some(l => l.id === languageId) || false;

  return (
    <div className="video-detail">
      <div className="video-detail-header">
        <h3>상세 정보</h3>
        <button className="close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="video-detail-content">
        {/* Thumbnail */}
        <div className="detail-thumbnail" onClick={() => openPlayer(video)}>
          {thumbnailSrc ? (
            <img src={thumbnailSrc} alt={video.filename} />
          ) : (
            <div className="detail-thumbnail-placeholder">
              <Film size={32} />
            </div>
          )}
          <div className="detail-thumbnail-overlay">
            <Play size={32} fill="white" />
          </div>
        </div>

        {/* Info */}
        <div className="detail-info">
          <h4 className="detail-filename">{video.filename}</h4>
          <p className="detail-path">{video.folder_path}</p>
          <div className="detail-meta">
            <span>크기: {formatFileSize(video.size)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          <button 
            className={`detail-tab ${activeTab === 'tags' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tags'); setIsAddingNew(false); }}
          >
            <Tag size={14} />
            <span>태그</span>
          </button>
          <button 
            className={`detail-tab ${activeTab === 'participants' ? 'active' : ''}`}
            onClick={() => { setActiveTab('participants'); setIsAddingNew(false); }}
          >
            <Users size={14} />
            <span>참가자</span>
          </button>
          <button 
            className={`detail-tab ${activeTab === 'languages' ? 'active' : ''}`}
            onClick={() => { setActiveTab('languages'); setIsAddingNew(false); }}
          >
            <Globe size={14} />
            <span>언어</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="detail-tab-content">
          {activeTab === 'tags' && (
            <div className="tag-list">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  className={`tag-item ${isTagSelected(tag.id) ? 'selected' : ''}`}
                  onClick={() => handleTagToggle(tag.id)}
                >
                  <span className="tag-color" style={{ backgroundColor: tag.color }} />
                  <span>{tag.name}</span>
                  {isTagSelected(tag.id) && <Check size={14} />}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="item-list">
              {participants.map(participant => (
                <button
                  key={participant.id}
                  className={`item ${isParticipantSelected(participant.id) ? 'selected' : ''}`}
                  onClick={() => handleParticipantToggle(participant.id)}
                >
                  <Users size={14} />
                  <span>{participant.name}</span>
                  {isParticipantSelected(participant.id) && <Check size={14} />}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'languages' && (
            <div className="item-list">
              {languages.map(language => (
                <button
                  key={language.id}
                  className={`item ${isLanguageSelected(language.id) ? 'selected' : ''}`}
                  onClick={() => handleLanguageToggle(language.id)}
                >
                  <Globe size={14} />
                  <span>{language.name}</span>
                  <span className="language-code">{language.code}</span>
                  {isLanguageSelected(language.id) && <Check size={14} />}
                </button>
              ))}
            </div>
          )}

          {/* Add New */}
          {isAddingNew ? (
            <div className="add-new-form">
              <input
                type="text"
                className="add-new-input"
                placeholder={
                  activeTab === 'tags' ? '새 태그 이름' :
                  activeTab === 'participants' ? '새 참가자 이름' :
                  '새 언어 이름'
                }
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNew()}
                autoFocus
              />
              {activeTab === 'tags' && (
                <input
                  type="color"
                  className="add-new-color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                />
              )}
              {activeTab === 'languages' && (
                <input
                  type="text"
                  className="add-new-code"
                  placeholder="코드 (예: ko)"
                  value={newLanguageCode}
                  onChange={(e) => setNewLanguageCode(e.target.value)}
                  maxLength={5}
                />
              )}
              <div className="add-new-actions">
                <button className="add-new-confirm" onClick={handleAddNew}>
                  <Check size={14} />
                </button>
                <button className="add-new-cancel" onClick={() => setIsAddingNew(false)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button className="add-new-btn" onClick={() => setIsAddingNew(true)}>
              <Plus size={14} />
              <span>
                {activeTab === 'tags' ? '새 태그' :
                 activeTab === 'participants' ? '새 참가자' :
                 '새 언어'} 추가
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

