import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getProcessError, getYtDlpPath, validateYouTubeUrl } from "@/lib/youtube";
import { formats, startDownloadJob } from "@/lib/downloads";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid YouTube link and format." }, { status: 400 });
  }

  const url = validateYouTubeUrl(body?.url);
  const format = body?.format;
  if (!url || typeof format !== "string" || !Object.hasOwn(formats, format)) {
    return NextResponse.json({ error: "Enter a YouTube link and choose a supported format." }, { status: 400 });
  }

  try {
    const job = await startDownloadJob(url, format);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: getProcessError(error) }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = validateYouTubeUrl(searchParams.get("url"));
  const format = searchParams.get("format");

  if (!url || !format || !Object.hasOwn(formats, format)) {
    return NextResponse.json({ error: "Enter a YouTube link and choose a supported format." }, { status: 400 });
  }

  let directory;
  try {
    directory = await mkdtemp(join(tmpdir(), "keepsake-"));
  } catch {
    return NextResponse.json({ error: "The server could not prepare a download." }, { status: 500 });
  }

  const outputTemplate = join(directory, "video.%(ext)s");
  const selectedFormat = formats[format];
  const isAudio = "audio" in selectedFormat;
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--newline",
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

  try {
    await execFileAsync(getYtDlpPath(), args, {
      timeout: 2 * 60 * 60 * 1000,
      maxBuffer: 1_000_000,
      windowsHide: true,
    });

    const files = await readdir(directory);
    const filename = files.find((file) => file.startsWith("video."));
    if (!filename) throw new Error("Download did not produce a file.");

    const filePath = join(directory, filename);
    const fileInfo = await stat(filePath);
    const nodeStream = createReadStream(filePath);
    nodeStream.once("close", () => {
      void rm(directory, { recursive: true, force: true });
    });
    const file = Readable.toWeb(nodeStream);

    return new Response(file, {
      headers: {
        "Content-Type": {
          mp4: "video/mp4",
          webm: "video/webm",
          mp3: "audio/mpeg",
          m4a: "audio/mp4",
          wav: "audio/wav",
        }[selectedFormat.extension],
        "Content-Disposition": `attachment; filename="keepsake.${selectedFormat.extension}"`,
        "Content-Length": String(fileInfo.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    const message = getProcessError(error);
    const status = message.startsWith("yt-dlp is not installed") ? 503 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}