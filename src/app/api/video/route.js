import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getProcessError, getYtDlpPath, validateYouTubeUrl } from "@/lib/youtube";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

function parseJsonField(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid YouTube link." }, { status: 400 });
  }

  const url = validateYouTubeUrl(body.url);
  if (!url) {
    return NextResponse.json(
      { error: "Enter a secure YouTube video link to continue." },
      { status: 400 },
    );
  }

  try {
    const { stdout } = await execFileAsync(getYtDlpPath(), [
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      "--print",
      "%(title)j",
      "--print",
      "%(thumbnail)j",
      "--print",
      "%(duration)j",
      "--print",
      "%(uploader)j",
      url,
    ], { timeout: 30_000, maxBuffer: 64_000, windowsHide: true });
    const [title, thumbnail, duration, uploader] = stdout
      .trimEnd()
      .split(/\r?\n/)
      .map(parseJsonField);
    return NextResponse.json({
      title: typeof title === "string" ? title : "YouTube video",
      thumbnail: typeof thumbnail === "string" ? thumbnail : undefined,
      duration: typeof duration === "number" ? duration : undefined,
      uploader: typeof uploader === "string" ? uploader : undefined,
    });
  } catch (error) {
    const message = getProcessError(error);
    const status = message.startsWith("yt-dlp is not installed") ? 503 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}