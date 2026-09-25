import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  X, 
  Loader2, 
  HelpCircle, 
  Download, 
  Sparkles 
} from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState('');
  const [isValidUrl, setIsValidUrl] = useState(null); // null = un-typed, true = valid, false = invalid
  
  // Progress & Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  
  // Loaded Video Data
  const [videoData, setVideoData] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState('1080p');

  // Server-side Download States
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState(null); // 'mp4' | 'mp3' | null
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');

  // Custom UI Overlays
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // YouTube URL Validation Pattern (Supports standard, shortened, shorts, embedded URLs)
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]{11}(\?.*)?$/;

  const handleUrlChange = (e) => {
    const value = e.target.value;
    setUrl(value);
    if (value.trim() === '') {
      setIsValidUrl(null);
    } else {
      setIsValidUrl(ytRegex.test(value.trim()));
    }
  };

  const showNotification = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  // 1. Real-time Analyze Stream with Progress Bar
  const handleAnalyze = () => {
    if (!url.trim()) {
      showNotification('warning', 'Please enter a YouTube video URL first.');
      return;
    }
    if (!isValidUrl) {
      showNotification('error', 'Invalid YouTube URL format! Check the link and try again.');
      return;
    }

    setIsAnalyzing(true);
    setProgressPercent(5);
    setProgressStatus('Initializing connection...');
    setVideoData(null);

    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_URL}/api/analyze-stream?url=${encodeURIComponent(url.trim())}`
    );

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgressPercent(data.percent);
      setProgressStatus(data.status);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setVideoData(data);
      if (data.qualities && data.qualities.length > 0) {
        setSelectedQuality(data.qualities[0]);
      }
      setIsAnalyzing(false);
      eventSource.close();
      showNotification('success', 'Video analyzed successfully! Ready for download.');
    });

    eventSource.addEventListener('error', (e) => {
      let data = { message: 'Failed to fetch video details from YouTube.' };
      try {
        if (e.data) data = JSON.parse(e.data);
      } catch (err) {}
      showNotification('error', data.message);
      setIsAnalyzing(false);
      eventSource.close();
    });
  };

  // 2. Real-time Download Stream Handler for MP4 and MP3
  const triggerDownload = (type) => {
    if (!videoData) {
      showNotification('warning', 'Please analyze a video link before downloading.');
      return;
    }

    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadType(type);
    setDownloadProgress(0);
    setDownloadStatus('Initializing downloader on server...');

    const query = new URLSearchParams({
      url: url.trim(),
      type: type,
      quality: selectedQuality
    }).toString();

    const eventSource = new EventSource(`${import.meta.env.VITE_API_URL}/api/download-stream?${query}`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setDownloadProgress(Math.min(data.percent || 0, 99));
      const extraInfo = data.speed ? ` (${data.speed} - ETA: ${data.eta})` : '';
      setDownloadStatus(`${data.status}${extraInfo}`);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setDownloadProgress(100);
      setDownloadStatus('Download complete! Starting browser file handover...');
      eventSource.close();

      // Trigger instant browser download via the temporary file endpoint
      window.location.href = `${import.meta.env.VITE_API_URL}/api/fetch-file?id=${data.fileId}`;

      showNotification('success', `Your ${type.toUpperCase()} file download has started!`);

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadType(null);
      }, 2500);
    });

    eventSource.addEventListener('error', (e) => {
      let data = { message: 'Failed to complete download on server.' };
      try {
        if (e.data) data = JSON.parse(e.data);
      } catch (err) {}
      showNotification('error', data.message);
      setIsDownloading(false);
      setDownloadType(null);
      eventSource.close();
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-900 flex flex-col justify-between p-4 md:p-8 font-sans relative">
      
      {/* --- CUSTOM TOAST POPUP --- */}
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border bg-white animate-bounce transition-all duration-300">
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
          <span className="text-xs font-semibold text-gray-800">{toast.message}</span>
          <button onClick={() => setToast({ show: false, type: '', message: '' })} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- HOW IT WORKS DIALOGUE MODAL --- */}
      {showHowItWorks && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <button 
              onClick={() => setShowHowItWorks(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-red-600 font-bold mb-3">
              <HelpCircle className="w-5 h-5" />
              <h3>How TubeFetch Works</h3>
            </div>
            <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
              <p>1. <strong>Paste URL:</strong> Copy any standard YouTube link and paste it in the search bar. The border turns <span className="text-emerald-600 font-bold">green</span> when valid.</p>
              <p>2. <strong>Real-time Analysis:</strong> Click <em>Analyze</em> to fetch available resolutions directly from YouTube servers with live progress tracking.</p>
              <p>3. <strong>Live Server Merging:</strong> High quality video and audio streams are merged in real-time on the backend before delivering a clean local file to your browser.</p>
            </div>
            <button 
              onClick={() => setShowHowItWorks(false)}
              className="mt-6 w-full py-2.5 bg-red-600 text-white font-medium text-xs rounded-xl hover:bg-red-700 transition"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="max-w-5xl w-full mx-auto flex justify-between items-center py-4 px-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-red-600">
          <span>TubeFetch</span>
        </div>
        <button
          onClick={() => setShowHowItWorks(true)}
          className="text-xs text-gray-500 hover:text-red-600 font-medium transition flex items-center gap-1"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          How it works
        </button>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="max-w-4xl w-full mx-auto my-8 space-y-8">
        
        {/* HERO SECTION */}
        <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 text-center shadow-sm">
          <p className="text-[10px] font-bold tracking-widest text-red-500 uppercase mb-3">
            FAST • SIMPLE • CLEAN
          </p>
          <h1 className="text-2xl md:text-4xl font-black text-gray-900 mb-3 tracking-tight">
            Download YouTube Videos & Audio
          </h1>
          <p className="text-xs md:text-sm text-gray-500 max-w-xl mx-auto mb-8">
            Save your favorite videos as MP4 or extract audio as MP3 in a clean, distraction-free experience.
          </p>

          {/* DYNAMIC SEARCH INPUT BOX */}
          <div className="max-w-2xl mx-auto">
            <div 
              className={`flex items-center border-2 rounded-full p-1.5 transition-all bg-white shadow-inner ${
                isValidUrl === true 
                  ? 'border-emerald-500 shadow-emerald-50' 
                  : isValidUrl === false 
                  ? 'border-red-500 shadow-red-50' 
                  : 'border-gray-200 focus-within:border-gray-400'
              }`}
            >
              <input
                type="text"
                placeholder="Paste YouTube URL here..."
                value={url}
                onChange={handleUrlChange}
                disabled={isAnalyzing || isDownloading}
                className="flex-1 px-4 py-2 text-xs md:text-sm text-gray-800 focus:outline-none bg-transparent"
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || isDownloading}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-6 py-2.5 rounded-full transition disabled:opacity-50 flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze'
                )}
              </button>
            </div>

            {/* REAL-TIME ANALYSIS PROGRESS BAR */}
            {isAnalyzing && (
              <div className="mt-5 max-w-md mx-auto space-y-2">
                <div className="flex justify-between text-[11px] font-medium text-gray-500">
                  <span>{progressStatus}</span>
                  <span className="text-red-600 font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 to-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* MP4 DOWNLOAD CARD */}
        <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">
            Download MP4 videos from YouTube
          </h2>
          <p className="text-xs text-gray-400 mb-6">
            Choose any available video resolution and download it as an MP4 file.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* THUMBNAIL CONTAINER */}
            <div className="w-full sm:w-60 h-36 bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 flex items-center justify-center shrink-0 relative">
              {videoData?.thumbnail ? (
                <img
                  src={videoData.thumbnail}
                  alt="Video Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="bg-gray-100 w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <Sparkles className="w-8 h-8 mb-1" />
                  <span className="text-[10px]">Preview Area</span>
                </div>
              )}
            </div>

            {/* QUALITY SELECTOR & CONTROLS */}
            <div className="space-y-4 flex-1 w-full">
              <h3 className="font-semibold text-gray-800 text-sm line-clamp-2">
                {videoData?.title || 'Your YouTube video preview'}
              </h3>

              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Video quality</span>
                <select
                  value={selectedQuality}
                  onChange={(e) => setSelectedQuality(e.target.value)}
                  className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-red-500"
                  disabled={!videoData || isDownloading}
                >
                  {videoData?.qualities ? (
                    videoData.qualities.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))
                  ) : (
                    <option>1080p</option>
                  )}
                </select>
              </div>

              <button
                onClick={() => triggerDownload('mp4')}
                disabled={!videoData || isDownloading}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-6 py-2.5 rounded-xl transition disabled:opacity-40 flex items-center gap-2 shadow-sm"
              >
                {isDownloading && downloadType === 'mp4' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing MP4...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download MP4
                  </>
                )}
              </button>

              {/* LIVE SERVER-SIDE MP4 DOWNLOAD PROGRESS BAR */}
              {isDownloading && downloadType === 'mp4' && (
                <div className="mt-3 space-y-1.5 bg-red-50/50 p-3 rounded-xl border border-red-100">
                  <div className="flex justify-between text-[11px] font-medium text-gray-700">
                    <span className="truncate pr-2">{downloadStatus}</span>
                    <span className="text-red-600 font-bold shrink-0">{Math.round(downloadProgress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-600 transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* MP3 DOWNLOAD CARD */}
        <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">
            Download MP3 audio from YouTube
          </h2>
          <p className="text-xs text-gray-400 mb-6">
            Extract the audio track and save it as a clean MP3 file.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            {/* SOFT PINK AUDIO THUMBNAIL */}
            <div className="w-20 h-20 bg-red-50/70 rounded-2xl border border-red-100 flex items-center justify-center shrink-0 overflow-hidden">
              {videoData?.thumbnail ? (
                <img
                  src={videoData.thumbnail}
                  alt="Audio Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-red-50 rounded-2xl"></div>
              )}
            </div>

            <div className="space-y-3 flex-1">
              <h3 className="font-semibold text-gray-800 text-sm">
                Audio extraction
              </h3>
              <p className="text-xs text-gray-400">MP3 • High quality (192kbps)</p>
              
              <button
                onClick={() => triggerDownload('mp3')}
                disabled={!videoData || isDownloading}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-6 py-2.5 rounded-xl transition disabled:opacity-40 flex items-center gap-2 shadow-sm"
              >
                {isDownloading && downloadType === 'mp3' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting MP3...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download MP3
                  </>
                )}
              </button>

              {/* LIVE SERVER-SIDE MP3 EXTRACT PROGRESS BAR */}
              {isDownloading && downloadType === 'mp3' && (
                <div className="mt-3 space-y-1.5 bg-red-50/50 p-3 rounded-xl border border-red-100">
                  <div className="flex justify-between text-[11px] font-medium text-gray-700">
                    <span className="truncate pr-2">{downloadStatus}</span>
                    <span className="text-red-600 font-bold shrink-0">{Math.round(downloadProgress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-600 transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* --- FOOTER --- */}
      <footer className="text-center py-4 text-xs text-gray-400">
        TubeFetch • Simple downloads, no distractions
      </footer>
    </div>
  );
}