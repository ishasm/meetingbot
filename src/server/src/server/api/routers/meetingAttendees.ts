import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  meetingAttendees,
  attendees,
  bots,
  insertMeetingAttendeeSchema,
  selectMeetingAttendeeSchema,
  selectAttendeeSchema,
} from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const meetingAttendeesRouter = createTRPCRouter({
  // Get all attendees for a specific meeting
  getByMeeting: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/meetings/{botId}/attendees",
        description: "Get all attendees linked to a specific meeting",
      },
    })
    .input(z.object({ botId: z.number() }))
    .output(z.object({
      attendees: z.array(selectAttendeeSchema.extend({
        meetingAttendeeId: z.number(),
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

      // Get all attendees for this meeting
      const results = await ctx.db
        .select({
          meetingAttendeeId: meetingAttendees.id,
          id: attendees.id,
          name: attendees.name,
          email: attendees.email,
          role: attendees.role,
          department: attendees.department,
          createdAt: attendees.createdAt,
          updatedAt: attendees.updatedAt,
        })
        .from(meetingAttendees)
        .innerJoin(attendees, eq(meetingAttendees.attendeeId, attendees.id))
        .where(eq(meetingAttendees.botId, input.botId))
        .orderBy(attendees.name);

      return { attendees: results };
    }),

  // Link an attendee to a meeting
  add: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/meetings/{botId}/attendees",
        description: "Link an attendee to a meeting",
      },
    })
    .input(insertMeetingAttendeeSchema)
    .output(selectMeetingAttendeeSchema)
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

      // Check if already linked
      const existing = await ctx.db
        .select()
        .from(meetingAttendees)
        .where(
          and(
            eq(meetingAttendees.botId, input.botId),
            eq(meetingAttendees.attendeeId, input.attendeeId)
          )
        );

      if (existing[0]) {
        return existing[0];
      }

      // Create the link
      const result = await ctx.db
        .insert(meetingAttendees)
        .values({
          botId: input.botId,
          attendeeId: input.attendeeId,
        })
        .returning();

      const link = result[0];
      if (!link) {
        throw new Error("Failed to link attendee to meeting");
      }

      return link;
    }),

  // Remove an attendee from a meeting
  remove: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/meetings/{botId}/attendees/{attendeeId}",
        description: "Remove an attendee from a meeting",
      },
    })
    .input(z.object({
      botId: z.number(),
      attendeeId: z.number(),
    }))
    .output(z.object({ success: z.boolean() }))
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

      await ctx.db
        .delete(meetingAttendees)
        .where(
          and(
            eq(meetingAttendees.botId, input.botId),
            eq(meetingAttendees.attendeeId, input.attendeeId)
          )
        );

      return { success: true };
    }),

  // Bulk add attendees to a meeting
  bulkAdd: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/meetings/{botId}/attendees/bulk",
        description: "Link multiple attendees to a meeting",
      },
    })
    .input(z.object({
      botId: z.number(),
      attendeeIds: z.array(z.number()),
    }))
    .output(z.object({
      added: z.number(),
      skipped: z.number(),
    }))
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

      let added = 0;
      let skipped = 0;

      for (const attendeeId of input.attendeeIds) {
        // Check if already linked
        const existing = await ctx.db
          .select()
          .from(meetingAttendees)
          .where(
            and(
              eq(meetingAttendees.botId, input.botId),
              eq(meetingAttendees.attendeeId, attendeeId)
            )
          );

        if (existing[0]) {
          skipped++;
          continue;
        }

        try {
          await ctx.db
            .insert(meetingAttendees)
            .values({
              botId: input.botId,
              attendeeId,
            });
          added++;
        } catch {
          skipped++;
        }
      }

      return { added, skipped };
    }),

  // Replace all attendees for a meeting
  setAttendees: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/meetings/{botId}/attendees",
        description: "Set the attendees for a meeting (replaces existing)",
      },
    })
    .input(z.object({
      botId: z.number(),
      attendeeIds: z.array(z.number()),
    }))
    .output(z.object({
      count: z.number(),
    }))
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

      // Remove all existing attendees
      await ctx.db
        .delete(meetingAttendees)
        .where(eq(meetingAttendees.botId, input.botId));

      // Add new attendees
      if (input.attendeeIds.length > 0) {
        await ctx.db
          .insert(meetingAttendees)
          .values(
            input.attendeeIds.map((attendeeId) => ({
              botId: input.botId,
              attendeeId,
            }))
          );
      }

      return { count: input.attendeeIds.length };
    }),
});
