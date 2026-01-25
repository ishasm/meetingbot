import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { bots } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { generateSignedUrl } from "~/server/utils/s3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const botId = parseInt(id, 10);
  if (isNaN(botId)) {
    return NextResponse.json({ error: "Invalid bot ID" }, { status: 400 });
  }

  // Get bot and verify ownership
  const result = await db
    .select({ recording: bots.recording, userId: bots.userId })
    .from(bots)
    .where(eq(bots.id, botId));

  const bot = result[0];
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  if (!bot.recording) {
    return NextResponse.json({ error: "No recording available" }, { status: 404 });
  }

  try {
    // Get signed URL and fetch the file
    const signedUrl = await generateSignedUrl(bot.recording);
    
    // Check for Range header (needed for video seeking)
    const rangeHeader = request.headers.get("Range");
    
    if (rangeHeader) {
      // Forward the Range request to S3
      const response = await fetch(signedUrl, {
        headers: {
          Range: rangeHeader,
        },
      });
      
      if (!response.ok && response.status !== 206) {
        throw new Error(`Failed to fetch recording: ${response.status}`);
      }

      const headers = new Headers();
      headers.set("Content-Type", response.headers.get("Content-Type") ?? "video/webm");
      headers.set("Accept-Ranges", "bytes");
      
      const contentRange = response.headers.get("Content-Range");
      if (contentRange) {
        headers.set("Content-Range", contentRange);
      }
      
      const contentLength = response.headers.get("Content-Length");
      if (contentLength) {
        headers.set("Content-Length", contentLength);
      }

      return new NextResponse(response.body, {
        status: 206, // Partial Content
        headers,
      });
    } else {
      // Non-range request - return full file
      const response = await fetch(signedUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch recording: ${response.status}`);
      }

      const headers = new Headers();
      headers.set("Content-Type", response.headers.get("Content-Type") ?? "video/webm");
      headers.set("Accept-Ranges", "bytes");
      
      const contentLength = response.headers.get("Content-Length");
      if (contentLength) {
        headers.set("Content-Length", contentLength);
      }

      return new NextResponse(response.body, {
        status: 200,
        headers,
      });
    }
  } catch (error) {
    console.error("Error streaming recording:", error);
    return NextResponse.json(
      { error: "Failed to stream recording" },
      { status: 500 }
    );
  }
}
