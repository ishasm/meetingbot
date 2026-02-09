import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

// Google Calendar API types
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: GoogleCalendarAttendee[];
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  status?: string;
  location?: string;
}

export interface GoogleCalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

/**
 * Get Google OAuth tokens for a user
 */
export async function getGoogleTokens(userId: string) {
  const result = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Refresh Google access token using refresh token
 */
export async function refreshGoogleToken(
  refreshToken: string
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to refresh Google token:", error);
    return null;
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return data.access_token;
}

/**
 * Get a valid access token for a user, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokenData = await getGoogleTokens(userId);

  if (!tokenData) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenData.expires_at ?? 0;

  if (expiresAt > now + 300 && tokenData.access_token) {
    // Token is still valid
    return tokenData.access_token;
  }

  // Token expired or about to expire, refresh it
  if (!tokenData.refresh_token) {
    console.error("No refresh token available for user:", userId);
    return null;
  }

  const newAccessToken = await refreshGoogleToken(tokenData.refresh_token);

  if (newAccessToken) {
    // Update the access token in the database
    await db
      .update(accounts)
      .set({
        access_token: newAccessToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Assume 1 hour expiry
      })
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  }

  return newAccessToken;
}

/**
 * Fetch calendar events for a user within a date range
 */
export async function fetchCalendarEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  maxResults = 50
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(userId);

  if (!accessToken) {
    throw new Error("No valid Google access token. Please reconnect your Google account.");
  }

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: maxResults.toString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to fetch calendar events:", error);
    throw new Error("Failed to fetch calendar events from Google");
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  return data.items ?? [];
}

/**
 * Fetch a specific calendar event by ID
 */
export async function fetchCalendarEvent(
  userId: string,
  eventId: string
): Promise<GoogleCalendarEvent | null> {
  const accessToken = await getValidAccessToken(userId);

  if (!accessToken) {
    throw new Error("No valid Google access token. Please reconnect your Google account.");
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.text();
    console.error("Failed to fetch calendar event:", error);
    throw new Error("Failed to fetch calendar event from Google");
  }

  return (await response.json()) as GoogleCalendarEvent;
}

/**
 * Check if user has Google Calendar connected
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const tokenData = await getGoogleTokens(userId);
  return tokenData?.refresh_token != null;
}

/**
 * Extract meeting URL from a Google Calendar event
 */
export function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
  // Check for Google Meet link
  if (event.hangoutLink) {
    return event.hangoutLink;
  }

  // Check description for meeting URLs
  if (event.description) {
    // Zoom URL pattern
    const zoomRegex = /https:\/\/[\w.-]*zoom\.us\/j\/\d+(\?pwd=[a-zA-Z0-9]+)?/;
    const zoomMatch = zoomRegex.exec(event.description);
    if (zoomMatch) {
      return zoomMatch[0];
    }

    // Teams URL pattern
    const teamsRegex = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+/;
    const teamsMatch = teamsRegex.exec(event.description);
    if (teamsMatch) {
      return teamsMatch[0];
    }

    // Google Meet URL pattern (if not in hangoutLink)
    const meetRegex = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/;
    const meetMatch = meetRegex.exec(event.description);
    if (meetMatch) {
      return meetMatch[0];
    }
  }

  // Check location for meeting URLs
  if (event.location) {
    const urlRegex = /https:\/\/(meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s]+/;
    const urlMatch = urlRegex.exec(event.location);
    if (urlMatch) {
      return urlMatch[0];
    }
  }

  return null;
}
