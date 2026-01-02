import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { users, insertUserSchema, selectUserSchema } from "../../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const usersRouter = createTRPCRouter({
  register: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/users/register",
        description: "Register a new user with email and password",
      },
    })
    .input(insertUserSchema)
    .output(z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if user already exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error("User with this email already exists");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 12);

      // Create user
      const result = await ctx.db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          password: hashedPassword,
          role: "user",
        })
        .returning();

      const user = result[0];
      if (!user) {
        throw new Error("Failed to create user");
      }

      return {
        id: user.id,
        email: user.email ?? "",
        name: user.name ?? "",
      };
    }),

  getProfile: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/profile",
        description: "Get the current user's profile",
      },
    })
    .input(z.object({}))
    .output(selectUserSchema)
    .query(async ({ ctx }) => {
      const result = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      const user = result[0];
      if (!user) {
        throw new Error("User not found");
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        role: user.role,
      };
    }),

  updateProfile: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/users/profile",
        description: "Update the current user's profile",
      },
    })
    .input(z.object({
      name: z.string().optional(),
      image: z.string().url().optional(),
    }))
    .output(selectUserSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.db
        .update(users)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.image && { image: input.image }),
        })
        .where(eq(users.id, ctx.session.user.id))
        .returning();

      const user = result[0];
      if (!user) {
        throw new Error("Failed to update user");
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        role: user.role,
      };
    }),

  changePassword: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/users/change-password",
        description: "Change the current user's password",
      },
    })
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Get user with password
      const result = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      const user = result[0];
      if (!user?.password) {
        throw new Error("User not found or no password set");
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(input.currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error("Current password is incorrect");
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(input.newPassword, 12);

      // Update password
      await ctx.db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, ctx.session.user.id));

      return { success: true };
    }),
});
