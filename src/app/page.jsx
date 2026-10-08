"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const HISTORY_KEY = "keepsake-download-history";

const formats = [
  { value: "mp4-best", label: "MP4", detail: "Best quality", type: "MP4" },
  { value: "mp4-1080", label: "MP4", detail: "1080p Full HD", type: "MP4" },
  { value: "mp4-720", label: "MP4", detail: "720p HD", type: "MP4" },
  { value: "mp4-480", label: "MP4", detail: "480p", type: "MP4" },
  { value: "webm", label: "WebM", detail: "Best quality", type: "WEBM" },
  { value: "mp3", label: "MP3", detail: "Audio only", type: "MP3" },
  { value: "m4a", label: "M4A", detail: "Audio only", type: "M4A" },
  { value: "wav", label: "WAV", detail: "Audio only", type: "WAV" },
];

function durationLabel(duration) {
  if (!duration) return null;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function PasteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M7 5.5h-2A1.5 1.5 0 0 0 3.5 7v8A1.5 1.5 0 0 0 5 16.5h7A1.5 1.5 0 0 0 13.5 15v-2" />
      <path d="M8 3.5h7A1.5 1.5 0 0 1 16.5 5v7A1.5 1.5 0 0 1 15 13.5H8A1.5 1.5 0 0 1 6.5 12V5A1.5 1.5 0 0 1 8 3.5Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 13v2.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState(null);
  const [format, setFormat] = useState("mp4-best");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedHistory = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
        if (Array.isArray(savedHistory)) {
          setHistory(savedHistory.filter((item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.format === "string" &&
            typeof item.downloadedAt === "string" &&
            Number.isFinite(Date.parse(item.downloadedAt)),
          ).slice(0, 10));
        } else {
          setHistory([]);
        }
      } catch {
        setHistory([]);
        setHistoryError("Download history could not be loaded in this browser.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function inspectVideo(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setVideo(null);

    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load this video.");
      setVideo(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadVideo() {
    setDownloading(true);
    setProgress(0);
    setError("");
    setHistoryError("");

    try {
      const startResponse = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, format }),
      });
      const job = await startResponse.json();
      if (!startResponse.ok) throw new Error(job.error || "Could not start this download.");

      let status;
      do {
        const statusResponse = await fetch(`/api/download/status?id=${encodeURIComponent(job.id)}`, {
          cache: "no-store",
        });
        status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error || "Could not check download progress.");
        setProgress(status.progress || 0);
        if (status.status === "error") throw new Error(status.error || "The download failed.");
        if (status.status !== "completed") {
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      } while (status.status !== "completed");

      const selectedFormat = formats.find((item) => item.value === format);
      const historyItem = {
        id: job.id,
        title: video.title,
        format: `${selectedFormat.label} · ${selectedFormat.detail}`,
        downloadedAt: new Date().toISOString(),
      };
      const nextHistory = [historyItem, ...(history || []).filter((item) => item.id !== job.id)].slice(0, 10);
      setHistory(nextHistory);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        setHistoryError("Download started, but browser history could not be saved.");
      }

      const link = document.createElement("a");
      link.href = `/api/download/file?id=${encodeURIComponent(job.id)}`;
      link.download = `keepsake.${selectedFormat.type.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a aria-label="Keepsake home" className="wordmark" href="#top">
          <span className="brand-mark"><span /></span>
          <span>keepsake<span className="wordmark-dot">.</span></span>
        </a>
        <div className="topbar-note"><span className="status-dot" /> YOUR PERSONAL VIDEO TOOLKIT</div>
        <span className="topbar-index">NO. 001 / VIDEO</span>
      </header>

      <section className="workspace" id="top">
        <div className="intro-column">
          <p className="eyebrow"><span>01</span> SAVE A MOMENT</p>
          <h1>Good videos<br />deserve to <em>stay.</em></h1>
          <p className="intro-copy">Bring a video link. Choose how you want it. Keep it close.</p>
          <div className="little-note"><span className="note-rule" /> MADE FOR YOUR OWN VIDEO LIBRARY</div>
        </div>

        <section className="download-panel" aria-label="Video download form">
          <div className="panel-topline">
            <div><span className="panel-kicker">YOUR DOWNLOAD</span><span className="panel-count">/ 01</span></div>
            <span className="panel-ready">READY WHEN YOU ARE</span>
          </div>

          <form onSubmit={inspectVideo}>
            <label className="field-label" htmlFor="video-url">VIDEO LINK</label>
            <div className="url-input-wrap">
              <span className="url-play" aria-hidden="true">▶</span>
              <input
                autoComplete="url"
                id="video-url"
                onChange={(event) => {
                  if (downloading) return;
                  setUrl(event.target.value);
                  setVideo(null);
                  setError("");
                }}
                placeholder="Paste a YouTube link here"
                required
                type="url"
                value={url}
              />
              {url && <button className="clear-button" disabled={downloading} onClick={() => { setUrl(""); setVideo(null); setError(""); }} type="button" aria-label="Clear link">×</button>}
            </div>
            <button className="inspect-button" disabled={busy || downloading} type="submit">
              {busy ? <><span className="spinner" /> Checking link</> : <><PasteIcon /> Get video details <span className="button-arrow">↗</span></>}
            </button>
          </form>

          {video ? (
            <div className="video-result" aria-live="polite">
              <div className="result-divider"><span>VIDEO FOUND</span><i /></div>
              <div className="video-preview">
                {video.thumbnail && <Image className="video-thumbnail" src={video.thumbnail} alt="" width={160} height={90} unoptimized />}
                <div className="video-copy">
                  <h2>{video.title}</h2>
                  <p>{video.uploader || "YouTube video"}{durationLabel(video.duration) ? ` · ${durationLabel(video.duration)}` : ""}</p>
                </div>
              </div>
              <label className="field-label format-label" htmlFor="format">CHOOSE A FORMAT</label>
              <div className="format-select-wrap">
                <select disabled={downloading} id="format" onChange={(event) => setFormat(event.target.value)} value={format}>
                  {formats.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.detail}</option>)}
                </select>
                <span aria-hidden="true" className="select-chevron">⌄</span>
              </div>
              <button className="download-button" disabled={downloading} onClick={() => void downloadVideo()} type="button">
                {downloading ? <><span className="spinner" /> Preparing download</> : <><ArrowIcon /> Download file <span className="download-format">{formats.find((item) => item.value === format)?.type}</span></>}
              </button>
              {downloading ? (
                <div className="download-progress" role="status" aria-live="polite">
                  <div className="progress-label"><span>DOWNLOADING VIDEO</span><b>{Math.floor(progress)}%</b></div>
                  <progress aria-label="Video download progress" max="100" value={progress} />
                  <p>{progress > 0 ? "Downloading from YouTube…" : "Connecting to YouTube…"}</p>
                </div>
              ) : (
                <p className="stream-note"><span /> Download progress updates in real time.</p>
              )}
            </div>
          ) : (
            <div className="format-hint"><span className="hint-lines">≋</span><span>MP4, WebM or audio<br /><small>MP3 · M4A · WAV</small></span></div>
          )}
          {(historyError || error) && <p className="error-message" role="alert">{historyError || error}</p>}
          <section className="download-history" aria-label="Download history">
            <div className="history-heading"><span>RECENT DOWNLOADS</span><span>{(history?.length || 0).toString().padStart(2, "0")}</span></div>
            {history === null ? (
              <p className="history-empty">Loading download history…</p>
            ) : history.length ? (
              <ul>
                {history.map((item) => (
                  <li key={item.id}>
                    <span className="history-item-copy"><b>{item.title}</b><small>{item.format}</small></span>
                    <time dateTime={item.downloadedAt}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.downloadedAt))}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="history-empty">Your completed downloads will appear here.</p>
            )}
          </section>
        </section>
      </section>

      <section className="bottom-strip" aria-label="Download steps">
        <span className="strip-title">THREE SMALL STEPS</span>
        <div className="step"><b>01</b><span>Paste your link</span></div>
        <span className="step-separator">/</span>
        <div className="step"><b>02</b><span>Choose your format</span></div>
        <span className="step-separator">/</span>
        <div className="step"><b>03</b><span>Save it for later</span></div>
        <div className="strip-stamp"><span>KEEP</span><span>WHAT</span><span>MATTERS</span></div>
      </section>

      <footer className="page-footer">
        <span>ONLY DOWNLOAD VIDEOS YOU OWN OR HAVE PERMISSION TO SAVE.</span>
        <span>USE RESPONSIBLY · RESPECT CREATOR RIGHTS</span>
      </footer>
    </main>
  );
}
