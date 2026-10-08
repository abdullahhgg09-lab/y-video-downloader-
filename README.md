# Keepsake

A local YouTube video downloader built with Next.js and `yt-dlp`. It can save videos as MP4 or WebM, or extract audio as MP3, M4A, or WAV. Only download videos you own or have permission to save.

## Requirements

- Node.js 20.9 or newer
- `yt-dlp` available on `PATH`
- FFmpeg available on `PATH` for MP3 conversion and merging video/audio streams

If `yt-dlp` is installed somewhere outside `PATH`, set `YTDLP_PATH` to its executable path in `.env.local`.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js (usually [http://localhost:3000](http://localhost:3000)). Paste a YouTube video link, load its details, choose a format, and download it. Downloads are streamed through the local server and temporary files are removed after streaming completes.

Downloads show live `yt-dlp` progress while the server retrieves the video. Long downloads can run for up to two hours and are stopped only after 15 minutes without any process output. The ten most recent completed downloads are saved in the current browser's local storage; clearing browser storage removes this history.

The API routes require a Node.js runtime and outbound access to YouTube. For deployment, configure `yt-dlp` and FFmpeg on the server and account for the server provider's request-duration and download-size limits.
