import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  actionItems,
  bots,
  insertActionItemSchema,
  selectActionItemSchema,
  updateActionItemSchema,
} from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const actionItemsRouter = createTRPCRouter({
  generateActionItems: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/bots/{botId}/action-items/generate",
        description: "Generate action items from a meeting transcript using AI",
      },
    })
    .input(z.object({
      botId: z.number(),
    }))
    .output(z.object({
      actionItems: z.array(selectActionItemSchema),
    }))
    .mutation(async ({ input, ctx }) => {
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
        throw new Error("Bot not found");
      }

      if (!bot.transcription) {
        throw new Error("No transcription available. Please transcribe the recording first.");
      }

      // Check if Gemini is available
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        throw new Error("Gemini API key not configured for action item generation");
      }

      // Generate action items using Gemini AI
      const systemPrompt = `You are an assistant that extracts action items from meeting transcripts. 
For each action item, provide:
- content: A clear description of the action
- assignee: The person responsible (if mentioned), or null
- priority: "low", "medium", or "high" based on urgency

Respond with a JSON object containing an "actionItems" array. Example:
{"actionItems": [
  {"content": "Schedule follow-up meeting", "assignee": "John", "priority": "high"},
  {"content": "Review the proposal document", "assignee": null, "priority": "medium"}
]}

Only include clear action items that were explicitly discussed. Do not make up items.`;

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
                    text: `${systemPrompt}\n\nExtract action items from this meeting transcript for "${bot.meetingTitle}":\n\n${bot.transcription}`,
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
        throw new Error(`Failed to generate action items: ${errorText}`);
      }

      const data: unknown = await response.json();
      const content = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      
      let parsedItems: Array<{ content: string; assignee?: string | null; priority?: string }>;
      try {
        const parsed: unknown = JSON.parse(content);
        const items = (parsed as { actionItems?: unknown; action_items?: unknown; items?: unknown }).actionItems ?? 
                     (parsed as { actionItems?: unknown; action_items?: unknown; items?: unknown }).action_items ?? 
                     (parsed as { actionItems?: unknown; action_items?: unknown; items?: unknown }).items ?? 
                     [];
        if (Array.isArray(items)) {
          parsedItems = items.map((item: unknown) => {
            const i = item as { content?: string; assignee?: string | null; priority?: string };
            return {
              content: i.content ?? "",
              assignee: i.assignee,
              priority: i.priority,
            };
          }).filter(item => item.content);
        } else {
          parsedItems = [];
        }
      } catch {
        parsedItems = [];
      }

      // Store action items in database
      const createdItems = [];
      for (const item of parsedItems) {
        if (!item.content) continue;
        
        const result = await ctx.db
          .insert(actionItems)
          .values({
            botId: input.botId,
            userId: ctx.session.user.id,
            content: item.content,
            assignee: item.assignee ?? null,
            priority: (item.priority as "low" | "medium" | "high") ?? "medium",
            isCompleted: false,
          })
          .returning();

        if (result[0]) {
          createdItems.push(result[0]);
        }
      }

      return { actionItems: createdItems };
    }),

  getActionItems: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/bots/{botId}/action-items",
        description: "Get all action items for a specific meeting/bot",
      },
    })
    .input(z.object({
      botId: z.number(),
    }))
    .output(z.object({
      actionItems: z.array(selectActionItemSchema),
    }))
    .query(async ({ input, ctx }) => {
      // Verify bot ownership
      const botResult = await ctx.db
        .select({ userId: bots.userId })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      const items = await ctx.db
        .select()
        .from(actionItems)
        .where(eq(actionItems.botId, input.botId))
        .orderBy(actionItems.createdAt);

      return { actionItems: items };
    }),

  createActionItem: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/action-items",
        description: "Create a new action item manually",
      },
    })
    .input(insertActionItemSchema)
    .output(selectActionItemSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify bot ownership
      const botResult = await ctx.db
        .select({ userId: bots.userId })
        .from(bots)
        .where(eq(bots.id, input.botId));

      const bot = botResult[0];
      if (!bot || bot.userId !== ctx.session.user.id) {
        throw new Error("Bot not found");
      }

      const result = await ctx.db
        .insert(actionItems)
        .values({
          botId: input.botId,
          userId: ctx.session.user.id,
          content: input.content,
          assignee: input.assignee ?? null,
          dueDate: input.dueDate ?? null,
          priority: input.priority ?? "medium",
          isCompleted: false,
        })
        .returning();

      const item = result[0];
      if (!item) {
        throw new Error("Failed to create action item");
      }

      return item;
    }),

  updateActionItem: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/action-items/{id}",
        description: "Update an action item (toggle completion, edit content, etc.)",
      },
    })
    .input(updateActionItemSchema)
    .output(selectActionItemSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const existingItem = await ctx.db
        .select()
        .from(actionItems)
        .where(
          and(
            eq(actionItems.id, input.id),
            eq(actionItems.userId, ctx.session.user.id)
          )
        );

      if (!existingItem[0]) {
        throw new Error("Action item not found");
      }

      const result = await ctx.db
        .update(actionItems)
        .set({
          ...(input.content !== undefined && { content: input.content }),
          ...(input.assignee !== undefined && { assignee: input.assignee }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.isCompleted !== undefined && { isCompleted: input.isCompleted }),
          ...(input.priority !== undefined && { priority: input.priority }),
          updatedAt: new Date(),
        })
        .where(eq(actionItems.id, input.id))
        .returning();

      const item = result[0];
      if (!item) {
        throw new Error("Failed to update action item");
      }

      return item;
    }),

  deleteActionItem: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/action-items/{id}",
        description: "Delete an action item",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const existingItem = await ctx.db
        .select()
        .from(actionItems)
        .where(
          and(
            eq(actionItems.id, input.id),
            eq(actionItems.userId, ctx.session.user.id)
          )
        );

      if (!existingItem[0]) {
        throw new Error("Action item not found");
      }

      await ctx.db
        .delete(actionItems)
        .where(eq(actionItems.id, input.id));

      return { success: true };
    }),

  getAllActionItems: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/action-items",
        description: "Get all action items for the current user across all meetings",
      },
    })
    .input(z.object({
      includeCompleted: z.boolean().optional().default(true),
    }))
    .output(z.object({
      actionItems: z.array(selectActionItemSchema),
    }))
    .query(async ({ input, ctx }) => {
      const query = ctx.db
        .select()
        .from(actionItems)
        .where(eq(actionItems.userId, ctx.session.user.id))
        .orderBy(actionItems.createdAt);

      const items = await query;
      
      const filteredItems = input.includeCompleted 
        ? items 
        : items.filter(item => !item.isCompleted);

      return { actionItems: filteredItems };
    }),
});
