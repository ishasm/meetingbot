import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  attendees,
  insertAttendeeSchema,
  selectAttendeeSchema,
  updateAttendeeSchema,
} from "../../db/schema";
import { eq } from "drizzle-orm";

export const attendeesRouter = createTRPCRouter({
  // Get all attendees
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/attendees",
        description: "Get all attendees from the master list",
      },
    })
    .input(z.object({
      search: z.string().optional(),
    }).optional())
    .output(z.object({
      attendees: z.array(selectAttendeeSchema),
    }))
    .query(async ({ ctx, input }) => {
      const allAttendees = await ctx.db
        .select()
        .from(attendees)
        .orderBy(attendees.name);

      // Filter by search term if provided
      if (input?.search) {
        const searchLower = input.search.toLowerCase();
        const filtered = allAttendees.filter(
          (a) =>
            a.name.toLowerCase().includes(searchLower) ??
            a.email?.toLowerCase().includes(searchLower) ??
            a.role?.toLowerCase().includes(searchLower) ??
            a.department?.toLowerCase().includes(searchLower)
        );
        return { attendees: filtered };
      }

      return { attendees: allAttendees };
    }),

  // Get a single attendee by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/attendees/{id}",
        description: "Get an attendee by ID",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(selectAttendeeSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(attendees)
        .where(eq(attendees.id, input.id));

      return result[0] ?? null;
    }),

  // Create a new attendee
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/attendees",
        description: "Create a new attendee in the master list",
      },
    })
    .input(insertAttendeeSchema)
    .output(selectAttendeeSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .insert(attendees)
        .values({
          name: input.name,
          email: input.email ?? null,
          role: input.role ?? null,
          department: input.department ?? null,
        })
        .returning();

      const attendee = result[0];
      if (!attendee) {
        throw new Error("Failed to create attendee");
      }

      return attendee;
    }),

  // Update an attendee
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/attendees/{id}",
        description: "Update an attendee",
      },
    })
    .input(updateAttendeeSchema)
    .output(selectAttendeeSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const result = await ctx.db
        .update(attendees)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.email !== undefined && { email: updates.email }),
          ...(updates.role !== undefined && { role: updates.role }),
          ...(updates.department !== undefined && { department: updates.department }),
          updatedAt: new Date(),
        })
        .where(eq(attendees.id, id))
        .returning();

      const attendee = result[0];
      if (!attendee) {
        throw new Error("Attendee not found");
      }

      return attendee;
    }),

  // Delete an attendee
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/attendees/{id}",
        description: "Delete an attendee from the master list",
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(attendees).where(eq(attendees.id, input.id));
      return { success: true };
    }),

  // Bulk create attendees (for CSV upload)
  bulkCreate: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/attendees/bulk",
        description: "Bulk create attendees from CSV data",
      },
    })
    .input(z.object({
      attendees: z.array(insertAttendeeSchema),
    }))
    .output(z.object({
      created: z.number(),
      failed: z.number(),
      attendees: z.array(selectAttendeeSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const createdAttendees: Array<typeof attendees.$inferSelect> = [];
      let failed = 0;

      for (const attendee of input.attendees) {
        try {
          const result = await ctx.db
            .insert(attendees)
            .values({
              name: attendee.name,
              email: attendee.email ?? null,
              role: attendee.role ?? null,
              department: attendee.department ?? null,
            })
            .returning();

          if (result[0]) {
            createdAttendees.push(result[0]);
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return {
        created: createdAttendees.length,
        failed,
        attendees: createdAttendees,
      };
    }),
});
