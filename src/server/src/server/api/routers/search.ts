import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { bots, actionItems, agendaItems } from "../../db/schema";
import { sql, eq } from "drizzle-orm";

const searchResultSchema = z.object({
  type: z.enum(["meeting", "actionItem", "agendaItem"]),
  id: z.number(),
  title: z.string(),
  snippet: z.string(),
  meetingId: z.number(),
  meetingTitle: z.string().nullable(),
  rank: z.number(),
});

export const searchRouter = createTRPCRouter({
  globalSearch: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
      type: z.enum(["all", "meetings", "actionItems", "agendaItems"]).optional().default("all"),
      limit: z.number().min(1).max(50).optional().default(20),
    }))
    .output(z.object({
      results: z.array(searchResultSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const tsQuery = input.query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.replace(/[^\w]/g, ""))
        .filter(Boolean)
        .join(" & ");

      if (!tsQuery) return { results: [], total: 0 };

      const results: z.infer<typeof searchResultSchema>[] = [];
      const userId = ctx.session.user.id;

      if (input.type === "all" || input.type === "meetings") {
        const meetingResults = await ctx.db
          .select({
            id: bots.id,
            meetingTitle: bots.meetingTitle,
            summary: bots.summary,
            rank: sql<number>`ts_rank(${bots}.search_vector, to_tsquery('english', ${tsQuery}))`,
          })
          .from(bots)
          .where(sql`${bots}.search_vector @@ to_tsquery('english', ${tsQuery}) AND ${eq(bots.userId, userId)}`)
          .orderBy(sql`ts_rank(${bots}.search_vector, to_tsquery('english', ${tsQuery})) DESC`)
          .limit(input.limit);

        for (const row of meetingResults) {
          results.push({
            type: "meeting",
            id: row.id,
            title: row.meetingTitle,
            snippet: row.summary?.substring(0, 200) ?? "",
            meetingId: row.id,
            meetingTitle: row.meetingTitle,
            rank: row.rank,
          });
        }
      }

      if (input.type === "all" || input.type === "actionItems") {
        const actionResults = await ctx.db
          .select({
            id: actionItems.id,
            content: actionItems.content,
            assignee: actionItems.assignee,
            botId: actionItems.botId,
            rank: sql<number>`ts_rank(${actionItems}.search_vector, to_tsquery('english', ${tsQuery}))`,
          })
          .from(actionItems)
          .where(sql`${actionItems}.search_vector @@ to_tsquery('english', ${tsQuery}) AND ${eq(actionItems.userId, userId)}`)
          .orderBy(sql`ts_rank(${actionItems}.search_vector, to_tsquery('english', ${tsQuery})) DESC`)
          .limit(input.limit);

        for (const row of actionResults) {
          results.push({
            type: "actionItem",
            id: row.id,
            title: row.content.substring(0, 100),
            snippet: row.assignee ? `Assigned to: ${row.assignee}` : row.content.substring(0, 200),
            meetingId: row.botId,
            meetingTitle: null,
            rank: row.rank,
          });
        }
      }

      if (input.type === "all" || input.type === "agendaItems") {
        const agendaResults = await ctx.db
          .select({
            id: agendaItems.id,
            description: agendaItems.description,
            discussionSummary: agendaItems.discussionSummary,
            botId: agendaItems.botId,
            rank: sql<number>`ts_rank(${agendaItems}.search_vector, to_tsquery('english', ${tsQuery}))`,
          })
          .from(agendaItems)
          .where(
            sql`${agendaItems}.search_vector @@ to_tsquery('english', ${tsQuery})`
          )
          .orderBy(sql`ts_rank(${agendaItems}.search_vector, to_tsquery('english', ${tsQuery})) DESC`)
          .limit(input.limit);

        for (const row of agendaResults) {
          results.push({
            type: "agendaItem",
            id: row.id,
            title: row.description.substring(0, 100),
            snippet: row.discussionSummary?.substring(0, 200) ?? row.description.substring(0, 200),
            meetingId: row.botId,
            meetingTitle: null,
            rank: row.rank,
          });
        }
      }

      // Sort all results by rank descending
      results.sort((a, b) => b.rank - a.rank);

      // Enrich meeting titles for non-meeting results
      const meetingIds = [...new Set(results.filter((r) => r.type !== "meeting").map((r) => r.meetingId))];
      if (meetingIds.length > 0) {
        const meetings = await ctx.db
          .select({ id: bots.id, meetingTitle: bots.meetingTitle })
          .from(bots)
          .where(sql`${bots.id} = ANY(${meetingIds})`);

        const titleMap: Record<number, string> = {};
        for (const m of meetings) {
          titleMap[m.id] = m.meetingTitle;
        }

        for (const result of results) {
          result.meetingTitle ??= titleMap[result.meetingId] ?? null;
        }
      }

      return {
        results: results.slice(0, input.limit),
        total: results.length,
      };
    }),
});
