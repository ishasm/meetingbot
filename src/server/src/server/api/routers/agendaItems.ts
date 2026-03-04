import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  agendaItems,
  attendees,
  bots,
  insertAgendaItemSchema,
  selectAgendaItemSchema,
  updateAgendaItemSchema,
} from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const agendaItemsRouter = createTRPCRouter({
  // Get all agenda items for a specific meeting
  getByMeeting: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/meetings/{botId}/agenda-items",
        description: "Get all agenda items for a specific meeting",
      },
    })
    .input(z.object({ botId: z.number() }))
    .output(z.object({
      agendaItems: z.array(selectAgendaItemSchema.extend({
        ownerName: z.string().nullable(),
        ownerNames: z.array(z.object({ id: z.number(), name: z.string() })),
      })),
    }))
    .query(async ({ ctx, input }) => {
      // Verify bot ownership
      const botResult = await ctx.db
        .select({ userId: bots.userId })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Meeting not found");
      }

      // Get all agenda items with owner names
      const results = await ctx.db
        .select({
          id: agendaItems.id,
          botId: agendaItems.botId,
          serialNum: agendaItems.serialNum,
          description: agendaItems.description,
          duration: agendaItems.duration,
          dateAdded: agendaItems.dateAdded,
          status: agendaItems.status,
          remarks: agendaItems.remarks,
          discussionSummary: agendaItems.discussionSummary,
          decisionResolution: agendaItems.decisionResolution,
          ownerAttendeeId: agendaItems.ownerAttendeeId,
          ownerAttendeeIds: agendaItems.ownerAttendeeIds,
          sadhguruComments: agendaItems.sadhguruComments,
          attachments: agendaItems.attachments,
          source: agendaItems.source,
          category: agendaItems.category,
          createdAt: agendaItems.createdAt,
          updatedAt: agendaItems.updatedAt,
          ownerName: attendees.name,
        })
        .from(agendaItems)
        .leftJoin(attendees, eq(agendaItems.ownerAttendeeId, attendees.id))
        .where(eq(agendaItems.botId, input.botId))
        .orderBy(agendaItems.serialNum);

      // Fetch all attendee names for multiple owners
      const allAttendeeIds = new Set<number>();
      results.forEach((item) => {
        const ids = item.ownerAttendeeIds;
        if (ids && Array.isArray(ids)) {
          ids.forEach((id) => {
            if (typeof id === "number") allAttendeeIds.add(id);
          });
        }
      });

      const attendeeMap = new Map<number, string>();
      if (allAttendeeIds.size > 0) {
        const attendeesList = await ctx.db
          .select({ id: attendees.id, name: attendees.name })
          .from(attendees);
        attendeesList.forEach((a) => attendeeMap.set(a.id, a.name));
      }

      // Map results with owner names
      const agendaItemsWithOwners = results.map((item) => {
        const rawIds = item.ownerAttendeeIds;
        const ids: number[] = rawIds && Array.isArray(rawIds) ? rawIds.filter((id): id is number => typeof id === "number") : [];
        const ownerNames = ids
          .map((id) => ({ id, name: attendeeMap.get(id) ?? "Unknown" }))
          .filter((o) => o.name !== "Unknown");
        return {
          ...item,
          source: item.source as "manual" | "ai-generated" | null,
          category: item.category as "Policy" | "Budget Approval" | "Follow-up" | "General" | null,
          ownerNames,
        };
      });

      return { agendaItems: agendaItemsWithOwners };
    }),

  // Get all agenda items for the current user across all meetings
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/agenda-items",
        description: "Get all agenda items across all meetings for the current user",
      },
    })
    .input(z.object({
      status: z.enum(["Open", "Closed"]).optional(),
      ownerAttendeeId: z.number().optional(),
      category: z.string().optional(),
    }).optional())
    .output(z.object({
      agendaItems: z.array(selectAgendaItemSchema.extend({
        ownerName: z.string().nullable(),
        ownerNames: z.array(z.object({ id: z.number(), name: z.string() })),
        meetingTitle: z.string(),
        meetingDate: z.date(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      // Get all agenda items for the user's meetings
      const results = await ctx.db
        .select({
          id: agendaItems.id,
          botId: agendaItems.botId,
          serialNum: agendaItems.serialNum,
          description: agendaItems.description,
          duration: agendaItems.duration,
          dateAdded: agendaItems.dateAdded,
          status: agendaItems.status,
          remarks: agendaItems.remarks,
          discussionSummary: agendaItems.discussionSummary,
          decisionResolution: agendaItems.decisionResolution,
          ownerAttendeeId: agendaItems.ownerAttendeeId,
          ownerAttendeeIds: agendaItems.ownerAttendeeIds,
          sadhguruComments: agendaItems.sadhguruComments,
          attachments: agendaItems.attachments,
          source: agendaItems.source,
          category: agendaItems.category,
          createdAt: agendaItems.createdAt,
          updatedAt: agendaItems.updatedAt,
          ownerName: attendees.name,
          meetingTitle: bots.meetingTitle,
          meetingDate: bots.startTime,
        })
        .from(agendaItems)
        .innerJoin(bots, eq(agendaItems.botId, bots.id))
        .leftJoin(attendees, eq(agendaItems.ownerAttendeeId, attendees.id))
        .where(eq(bots.userId, ctx.session.user.id))
        .orderBy(desc(agendaItems.dateAdded), agendaItems.serialNum);

      // Fetch all attendee names for multiple owners
      const allAttendeeIds = new Set<number>();
      results.forEach((item) => {
        const ids = item.ownerAttendeeIds;
        if (ids && Array.isArray(ids)) {
          ids.forEach((id) => {
            if (typeof id === "number") allAttendeeIds.add(id);
          });
        }
      });

      const attendeeMap = new Map<number, string>();
      if (allAttendeeIds.size > 0) {
        const attendeesList = await ctx.db
          .select({ id: attendees.id, name: attendees.name })
          .from(attendees);
        attendeesList.forEach((a) => attendeeMap.set(a.id, a.name));
      }

      // Map results with owner names
      const agendaItemsWithOwners = results.map((item) => {
        const rawIds = item.ownerAttendeeIds;
        const ids: number[] = rawIds && Array.isArray(rawIds) ? rawIds.filter((id): id is number => typeof id === "number") : [];
        const ownerNames = ids
          .map((id) => ({ id, name: attendeeMap.get(id) ?? "Unknown" }))
          .filter((o) => o.name !== "Unknown");
        return {
          ...item,
          source: item.source as "manual" | "ai-generated" | null,
          category: item.category as "Policy" | "Budget Approval" | "Follow-up" | "General" | null,
          ownerNames,
        };
      });

      // Apply filters
      let filtered = agendaItemsWithOwners;
      if (input?.status) {
        filtered = filtered.filter((item) => item.status === input.status);
      }
      if (input?.ownerAttendeeId) {
        filtered = filtered.filter((item) => item.ownerAttendeeId === input.ownerAttendeeId);
      }
      if (input?.category) {
        filtered = filtered.filter((item) => item.category === input.category);
      }

      return { agendaItems: filtered };
    }),

  // Create a new agenda item
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/meetings/{botId}/agenda-items",
        description: "Create a new agenda item for a meeting",
      },
    })
    .input(insertAgendaItemSchema)
    .output(selectAgendaItemSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify bot ownership
      const botResult = await ctx.db
        .select({ userId: bots.userId })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Meeting not found");
      }

      // Get the next serial number if not provided
      let serialNum = input.serialNum;
      if (!serialNum) {
        const maxResult = await ctx.db
          .select({ maxNum: agendaItems.serialNum })
          .from(agendaItems)
          .where(eq(agendaItems.botId, input.botId))
          .orderBy(desc(agendaItems.serialNum))
          .limit(1);

        serialNum = (maxResult[0]?.maxNum ?? 0) + 1;
      }

      const result = await ctx.db
        .insert(agendaItems)
        .values({
          botId: input.botId,
          serialNum,
          description: input.description,
          duration: input.duration ?? null,
          status: input.status ?? "Open",
          remarks: input.remarks ?? null,
          discussionSummary: input.discussionSummary ?? null,
          decisionResolution: input.decisionResolution ?? null,
          ownerAttendeeId: input.ownerAttendeeId ?? null,
          ownerAttendeeIds: input.ownerAttendeeIds ?? [],
          sadhguruComments: input.sadhguruComments ?? null,
          attachments: input.attachments ?? [],
          category: input.category ?? null,
        })
        .returning();

      const item = result[0];
      if (!item) {
        throw new Error("Failed to create agenda item");
      }

      return {
        ...item,
        source: item.source as "manual" | "ai-generated" | null,
        category: item.category as "Policy" | "Budget Approval" | "Follow-up" | "General" | null,
      };
    }),

  // Update an agenda item
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/agenda-items/{id}",
        description: "Update an agenda item",
      },
    })
    .input(updateAgendaItemSchema)
    .output(selectAgendaItemSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership through bot
      const existingItem = await ctx.db
        .select({
          agendaItem: agendaItems,
          botUserId: bots.userId,
        })
        .from(agendaItems)
        .innerJoin(bots, eq(agendaItems.botId, bots.id))
        .where(eq(agendaItems.id, input.id));

      if (!existingItem[0] || existingItem[0].botUserId !== ctx.session.user.id) {
        throw new Error("Agenda item not found");
      }

      const { id, ...updates } = input;

      const result = await ctx.db
        .update(agendaItems)
        .set({
          ...(updates.serialNum !== undefined && { serialNum: updates.serialNum }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.duration !== undefined && { duration: updates.duration }),
          ...(updates.status !== undefined && { status: updates.status }),
          ...(updates.remarks !== undefined && { remarks: updates.remarks }),
          ...(updates.discussionSummary !== undefined && { discussionSummary: updates.discussionSummary }),
          ...(updates.decisionResolution !== undefined && { decisionResolution: updates.decisionResolution }),
          ...(updates.ownerAttendeeId !== undefined && { ownerAttendeeId: updates.ownerAttendeeId }),
          ...(updates.ownerAttendeeIds !== undefined && { ownerAttendeeIds: updates.ownerAttendeeIds }),
          ...(updates.sadhguruComments !== undefined && { sadhguruComments: updates.sadhguruComments }),
          ...(updates.attachments !== undefined && { attachments: updates.attachments }),
          ...(updates.category !== undefined && { category: updates.category }),
          updatedAt: new Date(),
        })
        .where(eq(agendaItems.id, id))
        .returning();

      const item = result[0];
      if (!item) {
        throw new Error("Failed to update agenda item");
      }

      return {
        ...item,
        source: item.source as "manual" | "ai-generated" | null,
        category: item.category as "Policy" | "Budget Approval" | "Follow-up" | "General" | null,
      };
    }),

  // Delete an agenda item
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/agenda-items/{id}",
        description: "Delete an agenda item",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership through bot
      const existingItem = await ctx.db
        .select({
          agendaItem: agendaItems,
          botUserId: bots.userId,
        })
        .from(agendaItems)
        .innerJoin(bots, eq(agendaItems.botId, bots.id))
        .where(eq(agendaItems.id, input.id));

      if (!existingItem[0] || existingItem[0].botUserId !== ctx.session.user.id) {
        throw new Error("Agenda item not found");
      }

      await ctx.db.delete(agendaItems).where(eq(agendaItems.id, input.id));

      return { success: true };
    }),

  reorder: protectedProcedure
    .input(z.object({
      botId: z.number(),
      items: z.array(z.object({
        id: z.number(),
        serialNum: z.number(),
      })),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const botResult = await ctx.db
        .select({ userId: bots.userId })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Meeting not found");
      }

      for (const item of input.items) {
        await ctx.db
          .update(agendaItems)
          .set({ serialNum: item.serialNum })
          .where(
            and(
              eq(agendaItems.id, item.id),
              eq(agendaItems.botId, input.botId)
            )
          );
      }

      return { success: true };
    }),

  // Generate discussion summaries from transcript using AI
  generateSummaries: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/meetings/{botId}/agenda-items/generate-summaries",
        description: "Generate discussion summaries for agenda items from the meeting transcript. Updates existing agenda items and creates new ones for topics discussed that were not in the original agenda.",
      },
    })
    .input(z.object({ botId: z.number() }))
    .output(z.object({
      updated: z.number(),
      created: z.number(),
      agendaItems: z.array(selectAgendaItemSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the bot and verify ownership
      const botResult = await ctx.db
        .select({
          transcription: bots.transcription,
          userId: bots.userId,
          meetingTitle: bots.meetingTitle,
        })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Meeting not found");
      }

      if (!bot.transcription) {
        throw new Error("No transcription available. Please transcribe the recording first.");
      }

      // Get all agenda items for this meeting
      const items = await ctx.db
        .select()
        .from(agendaItems)
        .where(eq(agendaItems.botId, input.botId))
        .orderBy(agendaItems.serialNum);

      // Check if Gemini is available
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        throw new Error("Gemini API key not configured for summary generation");
      }

      // Build the agenda items list for the prompt (could be empty)
      const hasExistingItems = items.length > 0;
      const agendaList = hasExistingItems
        ? items.map((item) => `${item.serialNum}. ${item.description}`).join("\n")
        : "(No existing agenda items)";

      const systemPrompt = `You are an assistant that analyzes meeting transcripts and matches discussion content to agenda items.

${hasExistingItems ? `Given the following existing agenda items:
${agendaList}` : "There are no existing agenda items for this meeting."}

Analyze the transcript and provide:
1. For EXISTING agenda items (if any): discussion summaries for each item that was discussed
2. For NEW topics: identify any significant topics that were discussed but are NOT covered by the existing agenda items

Respond with a JSON object with two keys:
- "existingItems": An object where keys are the agenda item serial numbers and values are objects with:
  - "discussionSummary": A concise summary of what was discussed (or null if not discussed)
  - "decisionResolution": Any decisions or resolutions made (or null if none)
- "newItems": An array of new agenda items for topics discussed that were NOT in the original agenda. Each item should have:
  - "description": A clear, concise title for the topic
  - "discussionSummary": What was discussed about this topic
  - "decisionResolution": Any decisions made (or null if none)

Example response:
{
  "existingItems": {
    "1": {"discussionSummary": "Team discussed the migration timeline...", "decisionResolution": "Agreed to complete by Q2"},
    "2": {"discussionSummary": "Budget was reviewed...", "decisionResolution": null}
  },
  "newItems": [
    {"description": "Team building event planning", "discussionSummary": "The team discussed organizing a Q3 offsite event...", "decisionResolution": "Decided to schedule for September"}
  ]
}

IMPORTANT:
- Only include existing items that were actually discussed in the transcript
- Only add new items for substantial topics that were genuinely discussed (not just briefly mentioned)
- Do NOT create duplicate entries for topics already covered in the existing agenda
- Be accurate and concise in summaries`;

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
                    text: `${systemPrompt}\n\nMeeting: "${bot.meetingTitle}"\n\nTranscript:\n${bot.transcription}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate summaries: ${errorText}`);
      }

      const data: unknown = await response.json();
      const content = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

      // Type for the AI response
      interface AISummaryResponse {
        existingItems?: Record<string, { discussionSummary?: string | null; decisionResolution?: string | null }>;
        newItems?: Array<{ description: string; discussionSummary?: string | null; decisionResolution?: string | null }>;
      }

      let aiResponse: AISummaryResponse;
      try {
        aiResponse = JSON.parse(content) as AISummaryResponse;
      } catch {
        aiResponse = { existingItems: {}, newItems: [] };
      }

      const existingSummaries = aiResponse.existingItems ?? {};
      const newItemsFromAI = aiResponse.newItems ?? [];

      // Update existing agenda items with summaries
      const updatedItems: Array<typeof agendaItems.$inferSelect> = [];
      for (const item of items) {
        const summary = existingSummaries[String(item.serialNum)];
        if (summary) {
          const result = await ctx.db
            .update(agendaItems)
            .set({
              discussionSummary: summary.discussionSummary ?? item.discussionSummary,
              decisionResolution: summary.decisionResolution ?? item.decisionResolution,
              updatedAt: new Date(),
            })
            .where(eq(agendaItems.id, item.id))
            .returning();

          if (result[0]) {
            updatedItems.push(result[0]);
          }
        }
      }

      // Create new agenda items from AI-identified topics
      const createdItems: Array<typeof agendaItems.$inferSelect> = [];
      if (newItemsFromAI.length > 0) {
        // Get the next serial number
        const maxSerialNum = items.length > 0 
          ? Math.max(...items.map(i => i.serialNum))
          : 0;

        for (let i = 0; i < newItemsFromAI.length; i++) {
          const newItem = newItemsFromAI[i];
          if (!newItem?.description) continue;

          const result = await ctx.db
            .insert(agendaItems)
            .values({
              botId: input.botId,
              serialNum: maxSerialNum + i + 1,
              description: newItem.description,
              status: "Open",
              discussionSummary: newItem.discussionSummary ?? null,
              decisionResolution: newItem.decisionResolution ?? null,
              source: "ai-generated",
            })
            .returning();

          if (result[0]) {
            createdItems.push(result[0]);
          }
        }
      }

      const allItems = [...updatedItems, ...createdItems].map(item => ({
        ...item,
        source: item.source as "manual" | "ai-generated" | null,
        category: item.category as "Policy" | "Budget Approval" | "Follow-up" | "General" | null,
      }));

      return {
        updated: updatedItems.length,
        created: createdItems.length,
        agendaItems: allItems,
      };
    }),
});
