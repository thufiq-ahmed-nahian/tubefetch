import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory registry for completed temporary download files
const tempFiles = new Map();
const cookiesPath = path.join(__dirname, 'cookies.txt');

// 1. Real-time Analysis Progress Endpoint
app.get('/api/analyze-stream', (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendSSE('progress', { percent: 15, status: 'Connecting to YouTube servers...' });

  const ytdlpArgs = ['--dump-json', '--no-warnings'];
  if (fs.existsSync(cookiesPath)) {
    ytdlpArgs.push('--cookies', cookiesPath);
  }
  ytdlpArgs.push(videoUrl);

  const ytdlp = spawn('yt-dlp', ytdlpArgs);

  let stdoutData = '';
  let stderrData = '';

  ytdlp.on('error', (err) => {
    console.error('Failed to start yt-dlp process:', err);
    sendSSE('error', { message: 'yt-dlp executable not found on host machine.' });
    res.end();
  });

  setTimeout(() => sendSSE('progress', { percent: 45, status: 'Fetching video stream signatures...' }), 600);
  setTimeout(() => sendSSE('progress', { percent: 75, status: 'Extracting resolution formats...' }), 1200);

  ytdlp.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
  });

  ytdlp.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      sendSSE('error', { message: stderrData || 'Invalid YouTube URL or video is restricted/private.' });
      return res.end();
    }

    try {
      const info = JSON.parse(stdoutData);

      const rawQualities = info.formats
        .filter((f) => f.vcodec !== 'none' && f.height)
        .map((f) => f.height);

      const uniqueQualities = Array.from(new Set(rawQualities))
        .sort((a, b) => b - a)
        .map((h) => {
          if (h >= 2160) return '4K (2160p)';
          if (h >= 1440) return '2K (1440p)';
          return `${h}p`;
        });

      sendSSE('progress', { percent: 100, status: 'Complete!' });
      sendSSE('complete', {
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration_string || 'N/A',
        qualities: uniqueQualities.length > 0 ? uniqueQualities : ['1080p', '720p', '480p', '360p'],
      });
    } catch (err) {
      sendSSE('error', { message: 'Failed to parse YouTube video metadata.' });
    }
    res.end();
  });
});

// 2. Real-Time Download Progress Stream
app.get('/api/download-stream', (req, res) => {
  const { url, type, quality } = req.query;

  if (!url || !type) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const fileId = crypto.randomUUID();
  const targetHeight = quality ? quality.replace(/[^0-9]/g, '') : '1080';
  const ext = type === 'mp3' ? 'mp3' : 'mp4';
  const fileName = `TubeFetch_${Date.now()}.${ext}`;
  const tempFilePath = path.join(os.tmpdir(), `tubefetch_${fileId}.${ext}`);

  let ytdlpArgs = ['--newline'];

  if (fs.existsSync(cookiesPath)) {
    ytdlpArgs.push('--cookies', cookiesPath);
  }

  if (type === 'mp3') {
    ytdlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '192K', '-o', tempFilePath, url);
  } else {
    ytdlpArgs.push(
      '-f', `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/best`,
      '--merge-output-format', 'mp4',
      '-o', tempFilePath,
      url
    );
  }

  const downloader = spawn('yt-dlp', ytdlpArgs);

  downloader.on('error', (err) => {
    sendSSE('error', { message: 'Failed to launch yt-dlp.' });
    res.end();
  });

  downloader.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.includes('[download]')) {
        const percentMatch = line.match(/(\d+\.\d+)%/);
        const speedMatch = line.match(/at\s+([^\s]+)/);
        const etaMatch = line.match(/ETA\s+([^\s]+)/);

        if (percentMatch) {
          sendSSE('progress', {
            percent: parseFloat(percentMatch[1]),
            speed: speedMatch ? speedMatch[1] : '',
            eta: etaMatch ? etaMatch[1] : '',
            status: 'Processing video streams on server...'
          });
        }
      } else if (line.includes('[ffmpeg]') || line.includes('[Merger]')) {
        sendSSE('progress', {
          percent: 98,
          speed: '',
          eta: '',
          status: 'Merging audio and video tracks...'
        });
      }
    }
  });

  downloader.on('close', (code) => {
    if (code === 0 && fs.existsSync(tempFilePath)) {
      tempFiles.set(fileId, { path: tempFilePath, name: fileName });
      sendSSE('complete', { fileId, fileName });
    } else {
      sendSSE('error', { message: 'Failed to complete download processing.' });
    }
    res.end();
  });

  req.on('close', () => {
    if (!tempFiles.has(fileId) && fs.existsSync(tempFilePath)) {
      downloader.kill();
      fs.unlink(tempFilePath, () => {});
    }
  });
});

// 3. Serve File to Browser Instantaneously
app.get('/api/fetch-file', (req, res) => {
  const { id } = req.query;
  const fileData = tempFiles.get(id);

  if (!fileData || !fs.existsSync(fileData.path)) {
    return res.status(404).send('Download link expired or not found.');
  }

  res.download(fileData.path, fileData.name, () => {
    tempFiles.delete(id);
    fs.unlink(fileData.path, () => {});
  });
});

app.listen(PORT, () => {
  console.log(`TubeFetch Backend active on http://localhost:${PORT}`);
});