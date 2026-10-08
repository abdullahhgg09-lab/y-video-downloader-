const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export function validateYouTubeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getYtDlpPath() {
  return process.env.YTDLP_PATH || "yt-dlp";
}

export function getProcessError(error) {
  if (!error || typeof error !== "object") return "yt-dlp could not process this video.";

  const processError = error;
  if (processError.code === "ENOENT") {
    return "yt-dlp is not installed or could not be found. Install it and make it available on PATH.";
  }
  if (processError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "This video returned more metadata than the server could process. Try another video.";
  }
  if (processError.code === "KEEPSAKE_STALLED") {
    return "The download stopped making progress for 15 minutes. Check your connection and try again.";
  }
  if (processError.code === "KEEPSAKE_TIMEOUT") {
    return "The download exceeded the two-hour limit. Try a lower resolution or a shorter video.";
  }
  if (processError.killed) {
    return "yt-dlp took too long to respond. Check the link or try again later.";
  }

  const details = processError.stderr?.trim().split("\n").at(-1)?.trim().slice(0, 220);
  if (details?.toLowerCase().includes("ffmpeg")) {
    return "FFmpeg is required for this format. Install FFmpeg and restart the server.";
  }
  if (details) return details;

  const message = processError.message?.trim();
  if (message && !message.startsWith("Command failed:")) return message.slice(0, 220);
  return "yt-dlp could not retrieve this video. It may be unavailable, private, or restricted.";
}