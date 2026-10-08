import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { finishDownloadJob, getDownloadJob, formats } from "@/lib/downloads";

export const runtime = "nodejs";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  const job = id && getDownloadJob(id);

  if (!job || job.status !== "completed" || !job.filename) {
    return NextResponse.json({ error: "The completed download is no longer available." }, { status: 404 });
  }

  const filePath = join(job.directory, job.filename);
  try {
    const fileInfo = await stat(filePath);
    const extension = job.filename.split(".").at(-1);
    const mimeType = {
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
    }[extension];

    if (!mimeType || !Object.values(formats).some((format) => format.extension === extension)) {
      throw new Error("The completed download has an unsupported file type.");
    }

    const nodeStream = createReadStream(filePath);
    nodeStream.once("close", () => finishDownloadJob(id));

    return new Response(Readable.toWeb(nodeStream), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="keepsake.${extension}"`,
        "Content-Length": String(fileInfo.size),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    finishDownloadJob(id);
    return NextResponse.json({ error: "The completed download could not be read." }, { status: 500 });
  }
}
