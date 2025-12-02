import { 
  Search, 
  Grid3X3, 
  List, 
  PanelLeftClose, 
  PanelLeft,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import './Header.css';

export function Header() {
  const { 
    filter, 
    viewMode, 
    isSidebarOpen,
    totalVideos,
    setFilter, 
    setViewMode,
    toggleSidebar 
  } = useAppStore();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter({ search_query: e.target.value || null });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter({ sort_by: e.target.value as 'filename' | 'size' | 'created_at' | 'updated_at' });
  };

  const toggleSortOrder = () => {
    setFilter({ sort_order: filter.sort_order === 'asc' ? 'desc' : 'asc' });
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="toggle-sidebar-btn" onClick={toggleSidebar}>
          {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
        </button>
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="동영상 검색..."
            value={filter.search_query || ''}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      <div className="header-center">
        <span className="video-count">{totalVideos.toLocaleString()}개의 동영상</span>
      </div>

      <div className="header-right">
        <div className="sort-container">
          <select 
            className="sort-select"
            value={filter.sort_by}
            onChange={handleSortChange}
          >
            <option value="filename">이름</option>
            <option value="size">크기</option>
            <option value="created_at">생성일</option>
            <option value="updated_at">수정일</option>
          </select>
          <button className="sort-order-btn" onClick={toggleSortOrder}>
            {filter.sort_order === 'asc' ? <SortAsc size={18} /> : <SortDesc size={18} />}
          </button>
        </div>

        <div className="view-toggle">
          <button 
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 size={18} />
          </button>
          <button 
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

