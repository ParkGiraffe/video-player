import { ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Sidebar } from '../Sidebar/Sidebar';
import { Player } from '../Player/Player';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isSidebarOpen, isPlayerOpen, selectedVideo, closePlayer } = useAppStore();

  return (
    <div className="layout">
      <Sidebar isOpen={isSidebarOpen} />
      <main className={`main-content ${isSidebarOpen ? '' : 'sidebar-closed'}`}>
        {children}
      </main>
      {isPlayerOpen && selectedVideo && (
        <Player video={selectedVideo} onClose={closePlayer} />
      )}
    </div>
  );
}

