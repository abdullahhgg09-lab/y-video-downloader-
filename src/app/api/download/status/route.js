import { NextResponse } from "next/server";
import { getDownloadJob } from "@/lib/downloads";

export const runtime = "nodejs";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  const job = id && getDownloadJob(id);

  if (!job) {
    return NextResponse.json({ error: "This download has expired. Start it again." }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    progress: job.progress,
    error: job.error || undefined,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
