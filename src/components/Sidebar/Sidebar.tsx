import { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  Folder,
  Tag,
  Users,
  Globe,
  X,
  RefreshCw,
  Loader2,
  Settings
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';
import type { FolderNode, MountedFolder } from '../../types';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const {
    mountedFolders,
    folderTrees,
    tags,
    participants,
    languages,
    filter,
    isScanningFolder,
    loadMountedFolders,
    loadTags,
    loadParticipants,
    loadLanguages,
    addMountedFolder,
    removeMountedFolder,
    updateFolderScanDepth,
    scanFolder,
    setFilter,
    resetFilter,
  } = useAppStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'folders' | 'tags' | 'participants' | 'languages'>('folders');
  const [settingsFolder, setSettingsFolder] = useState<MountedFolder | null>(null);
  const [tempScanDepth, setTempScanDepth] = useState<number>(2);

  useEffect(() => {
    loadMountedFolders();
    loadTags();
    loadParticipants();
    loadLanguages();
  }, []);

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '폴더 선택',
    });
    
    if (selected) {
      await addMountedFolder(selected);
    }
  };

  const handleRescan = async (folder: MountedFolder) => {
    await scanFolder(folder.path);
  };

  const handleOpenSettings = (folder: MountedFolder) => {
    setSettingsFolder(folder);
    setTempScanDepth(folder.scan_depth);
  };

  const handleSaveSettings = async () => {
    if (settingsFolder) {
      await updateFolderScanDepth(settingsFolder.path, tempScanDepth);
      // Rescan with new depth
      await scanFolder(settingsFolder.path);
      setSettingsFolder(null);
    }
  };

  const toggleFolderExpand = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFolderClick = (path: string) => {
    setFilter({ folder_path: filter.folder_path === path ? null : path });
  };

  const handleTagClick = (tagId: string) => {
    const newTagIds = filter.tag_ids.includes(tagId)
      ? filter.tag_ids.filter(id => id !== tagId)
      : [...filter.tag_ids, tagId];
    setFilter({ tag_ids: newTagIds });
  };

  const handleParticipantClick = (participantId: string) => {
    const newIds = filter.participant_ids.includes(participantId)
      ? filter.participant_ids.filter(id => id !== participantId)
      : [...filter.participant_ids, participantId];
    setFilter({ participant_ids: newIds });
  };

  const handleLanguageClick = (languageId: string) => {
    const newIds = filter.language_ids.includes(languageId)
      ? filter.language_ids.filter(id => id !== languageId)
      : [...filter.language_ids, languageId];
    setFilter({ language_ids: newIds });
  };

  const renderFolderTree = (node: FolderNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = filter.folder_path === node.path;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path} className="folder-tree-item">
        <div 
          className={`folder-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button 
              className="folder-expand-btn"
              onClick={() => toggleFolderExpand(node.path)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="folder-expand-spacer" />
          )}
          <button 
            className="folder-name-btn"
            onClick={() => handleFolderClick(node.path)}
          >
            <Folder size={14} />
            <span className="folder-name">{node.name}</span>
            <span className="folder-count">{node.video_count}</span>
          </button>
        </div>
        {isExpanded && hasChildren && (
          <div className="folder-children">
            {node.children.map(child => renderFolderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">Video Player</h1>
      </div>
      
      <div className="sidebar-tabs">
        <button 
          className={`tab-btn ${activeTab === 'folders' ? 'active' : ''}`}
          onClick={() => setActiveTab('folders')}
        >
          <Folder size={16} />
          <span>폴더</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'tags' ? 'active' : ''}`}
          onClick={() => setActiveTab('tags')}
        >
          <Tag size={16} />
          <span>태그</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'participants' ? 'active' : ''}`}
          onClick={() => setActiveTab('participants')}
        >
          <Users size={16} />
          <span>참가자</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'languages' ? 'active' : ''}`}
          onClick={() => setActiveTab('languages')}
        >
          <Globe size={16} />
          <span>언어</span>
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'folders' && (
          <div className="folders-section">
            <div className="section-header">
              <span>마운트된 폴더</span>
              <button className="icon-btn" onClick={handleAddFolder} title="폴더 추가">
                <FolderPlus size={16} />
              </button>
            </div>
            
            {mountedFolders.length === 0 ? (
              <div className="empty-message">
                <p>마운트된 폴더가 없습니다.</p>
                <button className="add-folder-btn" onClick={handleAddFolder}>
                  <FolderPlus size={18} />
                  <span>폴더 추가</span>
                </button>
              </div>
            ) : (
              <div className="mounted-folders-list">
                {mountedFolders.map(folder => {
                  const isScanning = isScanningFolder === folder.path;
                  const folderTree = folderTrees.get(folder.path);
                  
                  return (
                    <div key={folder.id} className="mounted-folder-item">
                      <div className="mounted-folder-header">
                        <Folder size={16} />
                        <span className="mounted-folder-name">{folder.name}</span>
                        <div className="mounted-folder-actions">
                          <button 
                            className="icon-btn small" 
                            onClick={() => handleOpenSettings(folder)}
                            title="설정"
                          >
                            <Settings size={14} />
                          </button>
                          <button 
                            className="icon-btn small" 
                            onClick={() => handleRescan(folder)}
                            title="스캔"
                            disabled={isScanning}
                          >
                            {isScanning ? (
                              <Loader2 size={14} className="spinning" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                          <button 
                            className="icon-btn small danger" 
                            onClick={() => removeMountedFolder(folder.path)}
                            title="제거"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {isScanning && (
                        <div className="scanning-indicator">
                          <Loader2 size={12} className="spinning" />
                          <span>스캔 중...</span>
                        </div>
                      )}
                      {folderTree && (
                        <div className="folder-tree">
                          {renderFolderTree(folderTree)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="tags-section">
            <div className="filter-list">
              {tags.length === 0 ? (
                <div className="empty-message">
                  <p>태그가 없습니다.</p>
                </div>
              ) : (
                tags.map(tag => (
                  <button
                    key={tag.id}
                    className={`filter-item tag-item ${filter.tag_ids.includes(tag.id) ? 'selected' : ''}`}
                    onClick={() => handleTagClick(tag.id)}
                  >
                    <span className="tag-color" style={{ backgroundColor: tag.color }} />
                    <span>{tag.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="participants-section">
            <div className="filter-list">
              {participants.length === 0 ? (
                <div className="empty-message">
                  <p>참가자가 없습니다.</p>
                </div>
              ) : (
                participants.map(participant => (
                  <button
                    key={participant.id}
                    className={`filter-item ${filter.participant_ids.includes(participant.id) ? 'selected' : ''}`}
                    onClick={() => handleParticipantClick(participant.id)}
                  >
                    <Users size={14} />
                    <span>{participant.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'languages' && (
          <div className="languages-section">
            <div className="filter-list">
              {languages.length === 0 ? (
                <div className="empty-message">
                  <p>언어가 없습니다.</p>
                </div>
              ) : (
                languages.map(language => (
                  <button
                    key={language.id}
                    className={`filter-item ${filter.language_ids.includes(language.id) ? 'selected' : ''}`}
                    onClick={() => handleLanguageClick(language.id)}
                  >
                    <Globe size={14} />
                    <span>{language.name}</span>
                    <span className="language-code">{language.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {(filter.folder_path || filter.tag_ids.length > 0 || filter.participant_ids.length > 0 || filter.language_ids.length > 0) && (
        <div className="sidebar-footer">
          <button className="reset-filter-btn" onClick={resetFilter}>
            <X size={14} />
            <span>필터 초기화</span>
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {settingsFolder && (
        <div className="modal-overlay" onClick={() => setSettingsFolder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>폴더 설정</h3>
              <button className="icon-btn" onClick={() => setSettingsFolder(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="setting-item">
                <label>폴더 경로</label>
                <p className="setting-value">{settingsFolder.path}</p>
              </div>
              <div className="setting-item">
                <label htmlFor="scanDepth">스캔 깊이</label>
                <div className="scan-depth-input">
                  <input
                    id="scanDepth"
                    type="number"
                    min={1}
                    max={10}
                    value={tempScanDepth}
                    onChange={(e) => setTempScanDepth(parseInt(e.target.value) || 1)}
                  />
                  <span className="scan-depth-hint">
                    1 = 해당 폴더만, 2 = 1단계 하위 폴더까지
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSettingsFolder(null)}>
                취소
              </button>
              <button className="btn-primary" onClick={handleSaveSettings}>
                저장 및 재스캔
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
