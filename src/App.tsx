import { useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { Header } from './components/Header/Header';
import { VideoGrid } from './components/VideoGrid/VideoGrid';
import { VideoDetail } from './components/VideoDetail/VideoDetail';
import { Player } from './components/Player/Player';
import { useAppStore } from './stores/appStore';
import './App.css';

function App() {
  const { 
    loadMountedFolders, 
    loadTags, 
    loadParticipants, 
    loadLanguages,
    loadVideos,
    selectedVideo,
    selectVideo,
    isPlayerOpen,
    closePlayer,
  } = useAppStore();

  // Initial load - only load data, don't scan
  useEffect(() => {
    const initApp = async () => {
      await Promise.all([
        loadMountedFolders(),
        loadTags(),
        loadParticipants(),
        loadLanguages(),
      ]);
      // Load existing videos from database (fast)
      await loadVideos();
    };
    
    initApp();
  }, []);

  return (
    <Layout>
      <Header />
      <div className="content-area">
        <VideoGrid />
        {selectedVideo && !isPlayerOpen && (
          <VideoDetail 
            video={selectedVideo} 
            onClose={() => selectVideo(null)} 
          />
        )}
      </div>
      
      {/* Video Player */}
      {isPlayerOpen && selectedVideo && (
        <Player 
          video={selectedVideo} 
          onClose={closePlayer} 
        />
      )}
    </Layout>
  );
}

export default App;
