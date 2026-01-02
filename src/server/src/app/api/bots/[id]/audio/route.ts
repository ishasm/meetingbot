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
    .select({ mp3: bots.mp3, userId: bots.userId })
    .from(bots)
    .where(eq(bots.id, botId));

  const bot = result[0];
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  if (!bot.mp3) {
    return NextResponse.json({ error: "No audio available" }, { status: 404 });
  }

  try {
    // Get signed URL and fetch the file
    const signedUrl = await generateSignedUrl(bot.mp3);
    const response = await fetch(signedUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    // Stream the response
    const headers = new Headers();
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Content-Disposition", `attachment; filename="audio-${botId}.mp3"`);
    
    const contentLength = response.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error streaming audio:", error);
    return NextResponse.json(
      { error: "Failed to stream audio" },
      { status: 500 }
    );
  }
}
