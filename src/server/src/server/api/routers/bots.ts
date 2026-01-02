import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import {
  bots,
  events,
  insertBotSchema,
  selectBotSchema,
  insertEventSchema,
  status,
  speakerTimeframeSchema,
} from "../../db/schema";
import { eq, sql, and, notInArray } from "drizzle-orm";
import { deployBot, shouldDeployImmediately } from "../services/botDeployment";
import { extractCount } from "~/server/utils/database";
import { generateSignedUrl } from "~/server/utils/s3";
import { 
  getTranscriptionService, 
  TranscriptionError,
} from "~/server/services/transcription";

// Transcription provider enum for API validation
const transcriptionProviderSchema = z.enum(["openai", "assemblyai", "whisper-self-hosted"]);

// Transcription result schema for API output
const transcriptionResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  segments: z.array(z.object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
    speaker: z.string().optional(),
    confidence: z.number().optional(),
  })).optional(),
  words: z.array(z.object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number().optional(),
    speaker: z.string().optional(),
  })).optional(),
  provider: transcriptionProviderSchema,
  processingTimeMs: z.number().optional(),
});

export const botsRouter = createTRPCRouter({
  getBots: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots",
        description: "Retrieve a list of all bots",
      },
    })
    .input(z.object({}))
    .output(z.array(selectBotSchema))
    .query(async ({ ctx }) => {
      return await ctx.db
        .select()
        .from(bots)
        .where(eq(bots.userId, ctx.session.user.id))
        .orderBy(bots.createdAt);
    }),

  getBot: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/{id}",
        description: "Get a specific bot by its ID",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(selectBotSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select()
        .from(bots)
        .where(eq(bots.id, input.id));
      if (!result[0] || result[0].userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }
      return result[0];
    }),

  createBot: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots",
        description: "Create a new bot with the specified configuration",
      },
    })
    .input(insertBotSchema)
    .output(selectBotSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("Starting bot creation...");
      try {
        // Test database connection
        await ctx.db.execute(sql`SELECT 1`);
        console.log("Database connection successful");

        // Extract database fields from input

        const dbInput = {
          botDisplayName: input.botDisplayName ?? "MeetingBot",
          botImage: input.botImage,
          userId: ctx.session.user.id,
          meetingTitle: input.meetingTitle ?? "Meeting",
          meetingInfo: input.meetingInfo,
          startTime: input.startTime ?? new Date(),
          endTime: input.endTime ?? new Date(),
          heartbeatInterval: input.heartbeatInterval ?? 5000,
          automaticLeave: input.automaticLeave ?? {
            waitingRoomTimeout: 300000, // 5 minutes
            noOneJoinedTimeout: 300000, // 5 minutes
            everyoneLeftTimeout: 300000, // 5 minutes
            inactivityTimeout: 300000, // 5 minutes
          },
          callbackUrl: input.callbackUrl, // Credit to @martinezpl for this line -- cannot merge at time of writing due to capstone requirements
        };

        const result = await ctx.db.insert(bots).values(dbInput).returning();

        if (!result[0]) {
          throw new Error("Bot creation failed - no result returned");
        }

        // Check if we should deploy immediately
        if (await shouldDeployImmediately(input.startTime)) {
          console.log("Deploying bot immediately...");
          return await deployBot({
            botId: result[0].id,
            db: ctx.db,
          });
        }

        return result[0];
      } catch (error) {
        console.error("Error creating bot:", error);
        throw error;
      }
    }),

  updateBot: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/bots/{id}",
        description: "Update an existing bot's configuration",
      },
    })
    .input(
      z.object({
        id: z.number(),
        data: insertBotSchema.partial(),
      }),
    )
    .output(selectBotSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if the bot belongs to the user
      const bot = await ctx.db.select().from(bots).where(eq(bots.id, input.id));

      if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      const result = await ctx.db
        .update(bots)
        .set(input.data)
        .where(eq(bots.id, input.id))
        .returning();

      if (!result[0]) {
        throw new Error("Bot not found");
      }
      return result[0];
    }),

  updateBotStatus: publicProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/bots/{id}/status",
        description: "Update the status of a bot",
      },
    })
    .input(
      z
        .object({
          id: z.number(),
          status: status,
          recording: z.string().optional(),
          mp3: z.string().nullable().optional(),
          speakerTimeframes: z.array(speakerTimeframeSchema).optional()
        })
        .refine(
          (data) => {
            if (data.status === "DONE") {
              return data.recording !== undefined;
            }
            return true;
          },
          {
            message: "Recording is required when status is DONE",
          },
        ),
    )
    .output(selectBotSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.db
        .update(bots)
        .set({ status: input.status })
        .where(eq(bots.id, input.id))
        .returning();

      if (!result[0]) {
        throw new Error("Bot not found");
      }

      // Get the bot to check for callback URL
      const bot = (
        await ctx.db
          .select({
            callbackUrl: bots.callbackUrl,
            id: bots.id,
          })
          .from(bots)
          .where(eq(bots.id, input.id))
      )[0];
      if (!bot) {
        throw new Error("Bot not found");
      }

      if (input.status === "DONE") {
        // add the recording and mp3 to the bot
        await ctx.db
          .update(bots)
          .set({ 
            recording: input.recording, 
            mp3: input.mp3,
            speakerTimeframes: input.speakerTimeframes 
          })
          .where(eq(bots.id, bot.id));

        if (bot.callbackUrl) {
          // call the callback url
          try {
            await fetch(bot.callbackUrl, {
              method: 'POST',
              body: JSON.stringify({
                botId: bot.id,
                status: input.status,
              }),
            })
          } catch (error) {
            console.error('Error calling callback URL:', error)
          }
        }
      }
      return result[0];
    }),

  deleteBot: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/bots/{id}",
        description: "Delete a bot by its ID",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ message: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Check if the bot belongs to the user
      const bot = await ctx.db.select().from(bots).where(eq(bots.id, input.id));

      if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      const result = await ctx.db
        .delete(bots)
        .where(eq(bots.id, input.id))
        .returning();

      if (!result[0]) {
        throw new Error("Bot not found");
      }
      return { message: "Bot deleted successfully" };
    }),

  getSignedRecordingUrl: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/{id}/recording",
        description:
          "Retrieve a signed URL for the video recording associated with a specific bot",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ recordingUrl: z.string().nullable() }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select({ recording: bots.recording })
        .from(bots)
        .where(eq(bots.id, input.id));

      if (!result[0]) {
        throw new Error("Bot not found");
      }

      if (!result[0].recording) {
        return { recordingUrl: null };
      }

      const signedUrl = await generateSignedUrl(result[0].recording);
      return { recordingUrl: signedUrl };
    }),

  getSignedAudioUrl: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/{id}/audio",
        description:
          "Retrieve a signed URL for the extracted MP3 audio associated with a specific bot",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ audioUrl: z.string().nullable() }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select({ mp3: bots.mp3 })
        .from(bots)
        .where(eq(bots.id, input.id));

      if (!result[0]) {
        throw new Error("Bot not found");
      }

      if (!result[0].mp3) {
        return { audioUrl: null };
      }

      const signedUrl = await generateSignedUrl(result[0].mp3);
      return { audioUrl: signedUrl };
    }),

  heartbeat: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{id}/heartbeat",
        description:
          "Called every few seconds by bot scripts to indicate that the bot is still running",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      console.log("Heartbeat received for bot", input.id);
      // Update bot's last heartbeat
      const botUpdate = await ctx.db
        .update(bots)
        .set({ lastHeartbeat: new Date() })
        .where(eq(bots.id, input.id))
        .returning();

      if (!botUpdate[0]) {
        throw new Error("Bot not found");
      }

      return { success: true };
    }),

  reportEvent: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{id}/events",
        description:
          "Called whenever an event occurs during the bot session to record it immediately",
      },
    })
    .input(
      z.object({
        id: z.number(),
        event: insertEventSchema.omit({ botId: true }),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Insert the event
      await ctx.db.insert(events).values({
        ...input.event,
        botId: input.id,
      });

      return { success: true };
    }),

  deployBot: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{id}/deploy",
        description:
          "Deploy a bot by provisioning necessary resources and starting it up",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(selectBotSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if the bot belongs to the user
      const bot = await ctx.db.select().from(bots).where(eq(bots.id, input.id));

      if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      return await deployBot({
        botId: input.id,
        db: ctx.db,
      });
    }),

  getActiveBotCount: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/active/count",
        description:
          "Get the count of currently active bots (not DONE or FATAL)",
      },
    })
    .input(z.object({}))
    .output(z.object({ count: z.number() }))
    .query(async ({ ctx }) => {
      const result = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bots)
        .where(
          and(
            eq(bots.userId, ctx.session.user.id),
            notInArray(bots.status, ["DONE", "FATAL"] as const),
          ),
        );

      return { count: extractCount(result) };
    }),

  // ============================================================================
  // Transcription Endpoints
  // ============================================================================

  getAvailableTranscriptionProviders: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/transcription/providers",
        description: "Get list of available transcription providers based on configured API keys",
      },
    })
    .input(z.object({}))
    .output(z.object({ 
      providers: z.array(transcriptionProviderSchema),
      defaultProvider: transcriptionProviderSchema.optional(),
    }))
    .query(async () => {
      const service = getTranscriptionService();
      const providers = await service.getAvailableProviders();
      
      return { 
        providers,
        defaultProvider: providers[0],
      };
    }),

  transcribeBot: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{id}/transcribe",
        description: "Transcribe the audio recording of a bot using the specified provider. Speaker diarization is enhanced using speaker timeframes captured during the meeting.",
      },
    })
    .input(z.object({
      id: z.number(),
      provider: transcriptionProviderSchema.optional(),
      language: z.string().optional(),
      speakerDiarization: z.boolean().default(true),
      saveToDatabase: z.boolean().default(true),
    }))
    .output(transcriptionResultSchema)
    .mutation(async ({ input, ctx }) => {
      // Get the bot and verify ownership
      const botResult = await ctx.db
        .select({ 
          mp3: bots.mp3, 
          recording: bots.recording,
          userId: bots.userId,
          status: bots.status,
          speakerTimeframes: bots.speakerTimeframes,
        })
        .from(bots)
        .where(eq(bots.id, input.id));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      if (bot.status !== "DONE") {
        throw new Error("Bot recording is not complete yet");
      }

      // Try MP3 first, fall back to recording if MP3 fails or is too small
      const audioKey = bot.mp3 ?? bot.recording;
      const fallbackKey = bot.mp3 ? bot.recording : null;
      
      if (!audioKey) {
        throw new Error("No recording available for this bot");
      }

      // Get signed URL for the audio and download it
      // We download first because external services like AssemblyAI can't access internal MinIO URLs
      const downloadAudio = async (key: string): Promise<Buffer> => {
        const url = await generateSignedUrl(key);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download audio: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
      };

      let audioBuffer: Buffer;
      let usedKey = audioKey;
      try {
        audioBuffer = await downloadAudio(audioKey);
        
        // Check if the buffer is too small (likely corrupted or empty)
        if (audioBuffer.length < 1000 && fallbackKey) {
          console.log(`Audio file too small (${audioBuffer.length} bytes), trying fallback...`);
          audioBuffer = await downloadAudio(fallbackKey);
          usedKey = fallbackKey;
        }
      } catch (downloadError) {
        // Try fallback if primary fails
        if (fallbackKey) {
          console.log(`Primary audio download failed, trying fallback: ${(downloadError as Error).message}`);
          audioBuffer = await downloadAudio(fallbackKey);
          usedKey = fallbackKey;
        } else {
          throw new Error(`Failed to download audio file: ${(downloadError as Error).message}`);
        }
      }

      console.log(`Transcribing audio from ${usedKey}, size: ${audioBuffer.length} bytes`);

      // Transcribe using the service with buffer (works with all providers)
      const service = getTranscriptionService();
      
      try {
        console.log(`Starting transcription with provider: ${input.provider ?? 'default'}`);
        const startTime = Date.now();
        
        // Pass speaker timeframes to improve diarization and map speaker names
        const result = await service.transcribe(audioBuffer, {
          provider: input.provider,
          language: input.language,
          speakerDiarization: input.speakerDiarization,
          speakerTimeframes: bot.speakerTimeframes ?? undefined,
        });

        console.log(`Transcription completed in ${Date.now() - startTime}ms, text length: ${result.text.length}`);

        // Save transcription to database if requested
        if (input.saveToDatabase) {
          await ctx.db
            .update(bots)
            .set({ 
              transcription: result.text,
              transcriptionProvider: result.provider,
            })
            .where(eq(bots.id, input.id));
        }

        return result;
      } catch (error) {
        console.error(`Transcription error:`, error);
        if (error instanceof TranscriptionError) {
          throw new Error(`Transcription failed (${error.provider}): ${error.message}`);
        }
        throw error;
      }
    }),

  getTranscription: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/{id}/transcription",
        description: "Get the stored transcription for a bot",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({
      transcription: z.string().nullable(),
      transcriptionProvider: z.string().nullable(),
    }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select({ 
          transcription: bots.transcription,
          transcriptionProvider: bots.transcriptionProvider,
          userId: bots.userId,
        })
        .from(bots)
        .where(eq(bots.id, input.id));

      const bot = result[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      return {
        transcription: bot.transcription,
        transcriptionProvider: bot.transcriptionProvider,
      };
    }),

  generateSummary: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{id}/summary",
        description: "Generate a summary of the meeting transcription using AI",
      },
    })
    .input(z.object({
      id: z.number(),
      customPrompt: z.string().optional(),
    }))
    .output(z.object({
      summary: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the bot and verify ownership
      const result = await ctx.db
        .select({ 
          transcription: bots.transcription,
          userId: bots.userId,
          meetingTitle: bots.meetingTitle,
        })
        .from(bots)
        .where(eq(bots.id, input.id));

      const bot = result[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      if (!bot.transcription) {
        throw new Error("No transcription available. Please transcribe the recording first.");
      }

      // Check if Gemini is available for summarization
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        throw new Error("Gemini API key not configured for summary generation");
      }

      const systemPrompt = input.customPrompt ?? 
        "You are a helpful assistant that summarizes meeting transcripts. Provide a concise summary including key discussion points, decisions made, and action items.";

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${systemPrompt}\n\nPlease summarize this meeting transcript for "${bot.meetingTitle}":\n\n${bot.transcription}`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate summary: ${errorText}`);
      }

      const data: unknown = await response.json();
      const summary = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Unable to generate summary";

      return { summary };
    }),

  // ============================================================================
  // User Meetings Endpoints (for user portal)
  // ============================================================================

  getUserMeetings: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/meetings",
        description: "Get simplified meeting list for user dashboard",
      },
    })
    .input(z.object({
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
    }))
    .output(z.object({
      meetings: z.array(z.object({
        id: z.number(),
        meetingTitle: z.string(),
        platform: z.string().nullable(),
        status: z.string(),
        createdAt: z.date().nullable(),
        hasTranscription: z.boolean(),
        hasRecording: z.boolean(),
      })),
      total: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select({
          id: bots.id,
          meetingTitle: bots.meetingTitle,
          meetingInfo: bots.meetingInfo,
          status: bots.status,
          createdAt: bots.createdAt,
          transcription: bots.transcription,
          recording: bots.recording,
        })
        .from(bots)
        .where(eq(bots.userId, ctx.session.user.id))
        .orderBy(bots.createdAt)
        .limit(input.limit)
        .offset(input.offset);

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bots)
        .where(eq(bots.userId, ctx.session.user.id));

      const meetings = result.map((bot) => ({
        id: bot.id,
        meetingTitle: bot.meetingTitle,
        platform: bot.meetingInfo?.platform ?? null,
        status: bot.status,
        createdAt: bot.createdAt,
        hasTranscription: !!bot.transcription,
        hasRecording: !!bot.recording,
      }));

      return {
        meetings,
        total: extractCount(countResult),
      };
    }),

  createMeeting: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/meetings",
        description: "Create a new meeting and deploy bot",
      },
    })
    .input(z.object({
      meetingUrl: z.string().url(),
      meetingTitle: z.string().optional(),
      botDisplayName: z.string().optional(),
    }))
    .output(selectBotSchema)
    .mutation(async ({ input, ctx }) => {
      // Parse meeting URL to determine platform
      const meetingInfo = parseMeetingUrl(input.meetingUrl);
      if (!meetingInfo) {
        throw new Error("Invalid meeting URL. Please provide a valid Google Meet, Zoom, or Teams meeting link.");
      }

      const dbInput = {
        botDisplayName: input.botDisplayName ?? "MeetingBot",
        userId: ctx.session.user.id,
        meetingTitle: input.meetingTitle ?? "Meeting",
        meetingInfo,
        startTime: new Date(),
        endTime: new Date(),
        heartbeatInterval: 5000,
        automaticLeave: {
          waitingRoomTimeout: 300000,
          noOneJoinedTimeout: 300000,
          everyoneLeftTimeout: 300000,
          inactivityTimeout: 300000,
        },
      };

      const result = await ctx.db.insert(bots).values(dbInput).returning();

      if (!result[0]) {
        throw new Error("Failed to create meeting");
      }

      // Deploy bot immediately
      if (await shouldDeployImmediately(new Date())) {
        return await deployBot({
          botId: result[0].id,
          db: ctx.db,
        });
      }

      return result[0];
    }),
});

// Helper function to parse meeting URLs
function parseMeetingUrl(url: string): { platform: "google" | "zoom" | "teams"; meetingUrl?: string; meetingId?: string; meetingPassword?: string; organizerId?: string; tenantId?: string } | null {
  // Google Meet
  if (url.includes("meet.google.com")) {
    return {
      platform: "google",
      meetingUrl: url,
    };
  }

  // Zoom
  if (url.includes("zoom.us")) {
    const zoomRegex = /\/j\/(\d+)/;
    const pwdRegex = /pwd=([^&]+)/;
    const zoomMatch = zoomRegex.exec(url);
    const pwdMatch = pwdRegex.exec(url);
    if (zoomMatch?.[1]) {
      return {
        platform: "zoom",
        meetingId: zoomMatch[1],
        meetingPassword: pwdMatch?.[1] ?? "",
      };
    }
  }

  // Teams
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/');
      const meetingSegment = pathSegments.find(segment => segment.startsWith('19%3ameeting_') || segment.startsWith('19:meeting_'));
      
      if (meetingSegment) {
        const params = new URLSearchParams(urlObj.search);
        const context = params.get("context");
        
        if (context) {
          const contextObj: unknown = JSON.parse(decodeURIComponent(context));
          const decoded = decodeURIComponent(meetingSegment);
          const meetingIdMatch = decoded.replace('19:meeting_', '').split('@');
          const meetingId = meetingIdMatch[0] ?? "";
          const organizerId = (contextObj as { Oid?: string }).Oid ?? "";
          const tenantId = (contextObj as { Tid?: string }).Tid ?? "";
          
          return {
            platform: "teams",
            meetingId,
            organizerId,
            tenantId,
          };
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}
