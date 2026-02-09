import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { bots, attendees, meetingAttendees } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  fetchCalendarEvents,
  fetchCalendarEvent,
  isGoogleCalendarConnected,
  extractMeetingUrl,
} from "../services/googleCalendar";

// Schema for Google Calendar event output
const googleCalendarEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  start: z.object({
    dateTime: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    timeZone: z.string().optional().nullable(),
  }),
  end: z.object({
    dateTime: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    timeZone: z.string().optional().nullable(),
  }),
  hangoutLink: z.string().optional().nullable(),
  htmlLink: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  attendees: z.array(z.object({
    email: z.string(),
    displayName: z.string().optional().nullable(),
    responseStatus: z.string().optional().nullable(),
    self: z.boolean().optional().nullable(),
    organizer: z.boolean().optional().nullable(),
  })).optional().nullable(),
  organizer: z.object({
    email: z.string(),
    displayName: z.string().optional().nullable(),
    self: z.boolean().optional().nullable(),
  }).optional().nullable(),
  status: z.string().optional().nullable(),
});

// Schema for imported attendee result
const importedAttendeeSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  isNew: z.boolean(),
});

// Schema for import result
const importResultSchema = z.object({
  meetingId: z.number(),
  meetingTitle: z.string(),
  attendeesImported: z.array(importedAttendeeSchema),
  meetingUrl: z.string().nullable(),
});

export const googleCalendarRouter = createTRPCRouter({
  // Check if user has Google Calendar connected
  isConnected: protectedProcedure
    .input(z.object({}))
    .output(z.object({ connected: z.boolean() }))
    .query(async ({ ctx }) => {
      const connected = await isGoogleCalendarConnected(ctx.session.user.id);
      return { connected };
    }),

  // Get calendar events for a date range
  getEvents: protectedProcedure
    .input(z.object({
      timeMin: z.string().datetime(),
      timeMax: z.string().datetime(),
      maxResults: z.number().min(1).max(100).optional().default(50),
    }))
    .query(async ({ input, ctx }) => {
      console.log("[GoogleCalendar] Fetching events for user:", ctx.session.user.id);
      const events = await fetchCalendarEvents(
        ctx.session.user.id,
        new Date(input.timeMin),
        new Date(input.timeMax),
        input.maxResults
      );
      console.log("[GoogleCalendar] Found", events.length, "events");
      return events;
    }),

  // Get a specific calendar event
  getEvent: protectedProcedure
    .input(z.object({
      eventId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const event = await fetchCalendarEvent(ctx.session.user.id, input.eventId);
      return event;
    }),

  // Import a calendar event as a meeting with attendees
  importEvent: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      importAttendees: z.boolean().optional().default(true),
    }))
    .output(importResultSchema)
    .mutation(async ({ input, ctx }) => {
      // Fetch the event from Google Calendar
      const event = await fetchCalendarEvent(ctx.session.user.id, input.eventId);
      
      if (!event) {
        throw new Error("Calendar event not found");
      }

      // Extract meeting URL if available
      const meetingUrl = extractMeetingUrl(event);
      
      // Parse dates from the event
      const startDateTime = event.start.dateTime 
        ? new Date(event.start.dateTime) 
        : event.start.date 
          ? new Date(event.start.date) 
          : new Date();
      
      const endDateTime = event.end.dateTime 
        ? new Date(event.end.dateTime) 
        : event.end.date 
          ? new Date(event.end.date) 
          : new Date();

      // Create meeting info based on meeting URL
      let meetingInfo: {
        platform?: "google" | "zoom" | "teams";
        meetingUrl?: string;
        meetingId?: string;
        meetingPassword?: string;
      } = {};

      if (meetingUrl) {
        if (meetingUrl.includes("meet.google.com")) {
          meetingInfo = { platform: "google", meetingUrl };
        } else if (meetingUrl.includes("zoom.us")) {
          const zoomRegex = /\/j\/(\d+)/;
          const pwdRegex = /pwd=([^&]+)/;
          const zoomMatch = zoomRegex.exec(meetingUrl);
          const pwdMatch = pwdRegex.exec(meetingUrl);
          meetingInfo = {
            platform: "zoom",
            meetingId: zoomMatch?.[1] ?? "",
            meetingPassword: pwdMatch?.[1] ?? "",
          };
        } else if (meetingUrl.includes("teams.microsoft.com") || meetingUrl.includes("teams.live.com")) {
          meetingInfo = { platform: "teams", meetingUrl };
        }
      }

      // Create the meeting (bot record)
      const dbInput = {
        botDisplayName: "MeetingBot",
        userId: ctx.session.user.id,
        meetingTitle: event.summary || "Imported Meeting",
        meetingInfo,
        startTime: startDateTime,
        endTime: endDateTime,
        heartbeatInterval: 5000,
        automaticLeave: {
          waitingRoomTimeout: 300000,
          noOneJoinedTimeout: 300000,
          everyoneLeftTimeout: 300000,
          inactivityTimeout: 300000,
        },
      };

      const [createdBot] = await ctx.db.insert(bots).values(dbInput).returning();

      if (!createdBot) {
        throw new Error("Failed to create meeting");
      }

      const importedAttendees: Array<{
        id: number;
        name: string;
        email: string | null;
        isNew: boolean;
      }> = [];

      // Import attendees if requested
      if (input.importAttendees && event.attendees && event.attendees.length > 0) {
        for (const googleAttendee of event.attendees) {
          // Skip attendees without email (shouldn't happen but just in case)
          if (!googleAttendee.email) continue;
          
          // Skip the user's own attendance (marked as self)
          if (googleAttendee.self) continue;

          // Check if attendee already exists by email
          const existingAttendee = await ctx.db
            .select()
            .from(attendees)
            .where(eq(attendees.email, googleAttendee.email))
            .limit(1);

          let attendeeId: number;
          let isNew = false;

          if (existingAttendee[0]) {
            // Use existing attendee
            attendeeId = existingAttendee[0].id;
          } else {
            // Create new attendee
            const attendeeName = googleAttendee.displayName ?? googleAttendee.email.split("@")[0] ?? "Unknown";
            
            const [newAttendee] = await ctx.db
              .insert(attendees)
              .values({
                name: attendeeName,
                email: googleAttendee.email,
              })
              .returning();

            if (!newAttendee) {
              console.error("Failed to create attendee:", googleAttendee.email);
              continue;
            }

            attendeeId = newAttendee.id;
            isNew = true;
          }

          // Link attendee to the meeting
          await ctx.db.insert(meetingAttendees).values({
            botId: createdBot.id,
            attendeeId: attendeeId,
          }).onConflictDoNothing();

          importedAttendees.push({
            id: attendeeId,
            name: googleAttendee.displayName ?? googleAttendee.email.split("@")[0] ?? "Unknown",
            email: googleAttendee.email,
            isNew,
          });
        }
      }

      return {
        meetingId: createdBot.id,
        meetingTitle: createdBot.meetingTitle,
        attendeesImported: importedAttendees,
        meetingUrl,
      };
    }),
});
