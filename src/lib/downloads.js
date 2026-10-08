import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProcessError, getYtDlpPath } from "@/lib/youtube";

export const formats = {
  "mp4-best": { selector: "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]", extension: "mp4" },
  "mp4-1080": { selector: "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]", extension: "mp4" },
  "mp4-720": { selector: "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]", extension: "mp4" },
  "mp4-480": { selector: "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]", extension: "mp4" },
  webm: { selector: "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]", extension: "webm" },
  mp3: { selector: "bestaudio/best", extension: "mp3", audio: true },
  m4a: { selector: "bestaudio/best", extension: "m4a", audio: true },
  wav: { selector: "bestaudio/best", extension: "wav", audio: true },
};

const jobsKey = "__keepsakeDownloadJobs";
const jobs = globalThis[jobsKey] || (globalThis[jobsKey] = new Map());
const downloadStallTimeout = 15 * 60 * 1000;
const maxDownloadTime = 2 * 60 * 60 * 1000;
const jobRetentionTime = 10 * 60 * 1000;

function armDownloadTimeouts(job) {
  clearTimeout(job.stallTimer);
  job.stallTimer = setTimeout(() => {
    job.process?.kill();
    failJob(job, { code: "KEEPSAKE_STALLED" });
  }, downloadStallTimeout);
  job.stallTimer.unref();
}

function removeJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  clearTimeout(job.cleanupTimer);
  if (job.process && job.status === "downloading") {
    job.process.kill();
  }
  jobs.delete(id);
  void rm(job.directory, { recursive: true, force: true });
}

function scheduleCleanup(job) {
  clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => removeJob(job.id), jobRetentionTime);
  job.cleanupTimer.unref();
}

function updateProgress(job, stream, text) {
  const lines = `${job.progressBuffers[stream]}${text}`.split(/[\r\n]+/);
  job.progressBuffers[stream] = lines.pop().slice(-5000);

  for (const line of lines) {
    const marker = line.indexOf("KEEPSAKE_PROGRESS ");
    if (marker !== -1) {
      const [formatId, downloadedValue, totalValue, estimateValue, percentValue] =
        line.slice(marker + "KEEPSAKE_PROGRESS ".length).trim().split(/\s+/);
      const downloadedBytes = Number(downloadedValue);
      const totalBytes = Number(totalValue) || Number(estimateValue);

      if (formatId && Number.isFinite(downloadedBytes) && Number.isFinite(totalBytes) && totalBytes > 0) {
        job.progressByFormat.set(formatId, { downloadedBytes, totalBytes });
        const totals = Array.from(job.progressByFormat.values()).reduce(
          (result, item) => ({
            downloadedBytes: result.downloadedBytes + item.downloadedBytes,
            totalBytes: result.totalBytes + item.totalBytes,
          }),
          { downloadedBytes: 0, totalBytes: 0 },
        );
        job.progress = Math.min(99, (totals.downloadedBytes / totals.totalBytes) * 100);
      } else if (Number.isFinite(Number(percentValue))) {
        job.progress = Math.min(99, Number(percentValue));
      }
      continue;
    }

    if (!line.includes("[download]")) continue;
    const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
    if (match) job.progress = Math.min(99, Number(match[1]));
  }
}

function failJob(job, error) {
  if (job.status !== "downloading") return;
  clearTimeout(job.timeoutTimer);
  clearTimeout(job.stallTimer);
  job.process = null;
  job.status = "error";
  job.error = getProcessError({
    code: error?.code,
    killed: error?.killed,
    message: error?.message,
    stderr: job.stderr,
  });
  scheduleCleanup(job);
}

export async function startDownloadJob(url, format) {
  const directory = await mkdtemp(join(tmpdir(), "keepsake-"));
  const id = randomUUID();
  const selectedFormat = formats[format];
  const outputTemplate = join(directory, "video.%(ext)s");
  const isAudio = Object.hasOwn(selectedFormat, "audio");
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--newline",
    "--progress",
    "--progress-template",
    "download:KEEPSAKE_PROGRESS %(info.format_id)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress._percent)s",
    "--format",
    selectedFormat.selector,
    "--output",
    outputTemplate,
    "--print",
    "after_move:filepath",
    ...(isAudio
      ? ["--extract-audio", "--audio-format", selectedFormat.extension, ...(format === "mp3" ? ["--audio-quality", "0"] : [])]
      : ["--merge-output-format", selectedFormat.extension]),
    url,
  ];

  const job = {
    id,
    directory,
    status: "downloading",
    progress: 0,
    progressBuffers: { stdout: "", stderr: "" },
    progressByFormat: new Map(),
    stderr: "",
    error: null,
    filename: null,
    process: null,
    timeoutTimer: null,
    cleanupTimer: null,
  };
  jobs.set(id, job);

  try {
    job.process = spawn(getYtDlpPath(), args, { windowsHide: true });
  } catch (error) {
    failJob(job, error);
    return { id };
  }

  job.process.stdout.on("data", (chunk) => updateProgress(job, "stdout", chunk.toString()));
  job.process.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    job.stderr = `${job.stderr}${text}`.slice(-20_000);
    updateProgress(job, "stderr", text);
  });
  job.process.stdout.on("data", () => armDownloadTimeouts(job));
  job.process.stderr.on("data", () => armDownloadTimeouts(job));
  job.process.once("error", (error) => failJob(job, error));
  job.process.once("close", async (code) => {
    if (job.status !== "downloading") return;
    clearTimeout(job.timeoutTimer);
    clearTimeout(job.stallTimer);

    if (code !== 0) {
      failJob(job, { code, stderr: job.stderr });
      return;
    }

    try {
      const files = await readdir(directory);
      job.filename = files.find((file) => file.startsWith("video."));
      if (!job.filename) throw new Error("Download did not produce a file.");
      job.status = "completed";
      job.progress = 100;
      job.process = null;
      scheduleCleanup(job);
    } catch (error) {
      failJob(job, error);
    }
  });

  job.timeoutTimer = setTimeout(() => {
    if (job.status === "downloading") {
      job.process?.kill();
      failJob(job, { code: "KEEPSAKE_TIMEOUT" });
    }
  }, maxDownloadTime);
  job.timeoutTimer.unref();
  armDownloadTimeouts(job);

  return { id };
}

export function getDownloadJob(id) {
  return jobs.get(id);
}

export function finishDownloadJob(id) {
  removeJob(id);
}
