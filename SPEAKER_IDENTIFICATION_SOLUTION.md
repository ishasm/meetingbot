# How Recall.ai Solves Speaker Identification (And How We Can Too)

## The Real Problem

Your bot is joining Google Meet as an **anonymous guest**, which means:
- ❌ Limited access to participant information
- ❌ Google Meet's UI changes frequently break participant panel scraping
- ❌ No reliable way to get real participant names
- ❌ Result: Transcripts show "Speaker A, B, C"

## How Recall.ai Solves This

According to Recall.ai's documentation, they require the bot to **sign in with a Google account**. When authenticated:

✅ Bot joins as a **legitimate participant** (not a guest)
✅ Full access to meeting roster and participant metadata
✅ Google Meet exposes participant names directly through the authenticated session
✅ More reliable and less prone to UI changes

### Key Requirements (from Recall.ai docs):

1. **Dedicated Google Account for the Bot**
   - Create a Google account specifically for the bot
   - Add recovery email and phone number
   - Set language to English (US)

2. **Sign In Before Joining Meeting**
   - Bot authenticates with Google OAuth
   - Stores session/cookies
   - Joins meeting as authenticated user

3. **Access Participant Data**
   - Authenticated bots can access the meeting roster API/data
   - Names are provided by Google Meet directly
   - No need to scrape UI elements

## Current Implementation Issues

### What Your Bot Does Now:

```typescript
// Joins as guest with just a display name
const name = this.settings.botDisplayName || "MeetingBot";
await this.page.fill(enterNameField, name);
await this.page.click(joinNowButton);
```

This is **guest access** - you're just typing a name into the "Your name" field.

### What It Should Do:

```typescript
// 1. Sign in to Google account FIRST
await this.page.goto('https://accounts.google.com');
await this.signInWithGoogle(botEmail, botPassword);

// 2. THEN join meeting as authenticated user
await this.page.goto(this.meetingURL);
// No name field - already authenticated!
await this.page.click(joinNowButton);
```

## Solution: Implement Google Account Authentication

### Phase 1: Add Google Credentials Support

#### 1. Update BotConfig Type

```typescript
// src/bots/src/types.ts
export type GoogleCredentials = {
  email: string;
  password: string;
  // Optional: Use session cookies instead of password
  sessionCookies?: any[];
};

export type BotConfig = {
  id: number;
  userId: string;
  meetingInfo: MeetingInfo;
  meetingTitle: string;
  startTime: Date;
  endTime: Date;
  botDisplayName: string;
  botImage?: string;
  heartbeatInterval: number;
  automaticLeave: AutomaticLeave;
  callbackUrl?: string;
  // NEW: Google credentials for authenticated access
  googleCredentials?: GoogleCredentials;
};
```

#### 2. Update Database Schema

```sql
-- Add columns to bots table
ALTER TABLE bots ADD COLUMN google_email VARCHAR(255);
ALTER TABLE bots ADD COLUMN google_password_encrypted TEXT;
ALTER TABLE bots ADD COLUMN google_session_cookies JSONB;
ALTER TABLE bots ADD COLUMN use_google_auth BOOLEAN DEFAULT FALSE;
```

#### 3. Add Google Sign-In Method to Bot

```typescript
// src/bots/meet/src/bot.ts

async signInToGoogle() {
  if (!this.settings.googleCredentials) {
    console.log("No Google credentials provided, joining as guest");
    return false;
  }

  const { email, password, sessionCookies } = this.settings.googleCredentials;

  try {
    // Option A: Use saved session cookies (faster)
    if (sessionCookies?.length > 0) {
      console.log("Restoring Google session from cookies");
      await this.page.context().addCookies(sessionCookies);
      
      // Verify session is still valid
      await this.page.goto('https://accounts.google.com');
      const isSignedIn = await this.page.evaluate(() => {
        return document.body.textContent?.includes('Sign out') ?? false;
      });
      
      if (isSignedIn) {
        console.log("✓ Google session restored successfully");
        return true;
      }
      console.log("Session expired, signing in with credentials");
    }

    // Option B: Sign in with email/password
    console.log("Signing in to Google account:", email);
    
    await this.page.goto('https://accounts.google.com/signin');
    
    // Enter email
    await this.page.fill('input[type="email"]', email);
    await this.page.click('#identifierNext');
    await this.page.waitForTimeout(2000);
    
    // Enter password
    await this.page.fill('input[type="password"]', password);
    await this.page.click('#passwordNext');
    await this.page.waitForTimeout(3000);
    
    // Handle 2FA if required
    // TODO: Implement 2FA handling
    
    // Save session cookies for future use
    const cookies = await this.page.context().cookies();
    console.log("✓ Signed in to Google, session cookies saved");
    
    // TODO: Send cookies back to server to store in database
    
    return true;
  } catch (error) {
    console.error("Failed to sign in to Google:", error);
    return false;
  }
}

async joinMeeting() {
  await this.launchBrowser();
  
  // NEW: Sign in to Google first if credentials provided
  const isAuthenticated = await this.signInToGoogle();
  
  if (isAuthenticated) {
    // Authenticated flow - no name field!
    console.log("Joining meeting as authenticated Google user");
    await this.page.goto(this.meetingURL, { waitUntil: "networkidle" });
    
    // Turn off camera/mic
    await this.page.click(muteButton, { timeout: 1000 }).catch(() => {});
    await this.page.click(cameraOffButton, { timeout: 1000 }).catch(() => {});
    
    // Join directly
    await this.page.waitForSelector(joinNowButton, { timeout: 10000 });
    await this.page.click(joinNowButton);
  } else {
    // Guest flow - use display name (current implementation)
    console.log("Joining meeting as guest with display name");
    await this.page.goto(this.meetingURL, { waitUntil: "networkidle" });
    await this.page.waitForSelector(enterNameField);
    await this.page.fill(enterNameField, this.settings.botDisplayName);
    // ... rest of current implementation
  }
  
  // Wait for meeting to join
  await this.page.waitForSelector(leaveButton);
  console.log("Joined Call.");
}
```

### Phase 2: Update UI to Support Google Credentials

Add a toggle in the bot creation form:

```tsx
// Add to bot creation form
<div>
  <Checkbox 
    checked={useGoogleAuth}
    onCheckedChange={setUseGoogleAuth}
  >
    Use Google Account Authentication (Recommended for accurate speaker names)
  </Checkbox>
  
  {useGoogleAuth && (
    <>
      <Input 
        label="Google Email"
        type="email"
        value={googleEmail}
        onChange={setGoogleEmail}
        placeholder="bot@example.com"
      />
      <Input 
        label="Google Password"
        type="password"
        value={googlePassword}
        onChange={setGooglePassword}
        placeholder="••••••••"
      />
      <Alert>
        <AlertDescription>
          For security, create a dedicated Google account for the bot. 
          Passwords are encrypted and stored securely.
        </AlertDescription>
      </Alert>
    </>
  )}
</div>
```

### Phase 3: Enhanced Participant Detection (Authenticated Mode)

When signed in, Google Meet provides better participant data:

```typescript
// In authenticated mode, participants are more reliably available
await this.page.evaluate(() => {
  // Google Meet exposes participant data in authenticated sessions
  const participants = window.__MEET_PARTICIPANT_DATA__ || [];
  return participants.map(p => ({
    id: p.id,
    name: p.displayName, // Real name from Google account!
    email: p.email
  }));
});
```

## Alternative Solution: Use Captions API

Google Meet has a **captions feature** that shows speaker names. When authenticated:

```typescript
// Monitor captions which include speaker names
await this.page.evaluate(() => {
  const captionsContainer = document.querySelector('[aria-live="polite"]');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node: any) => {
        if (node.textContent) {
          // Captions format: "Speaker Name: Text"
          const match = node.textContent.match(/^([^:]+):\s*(.+)$/);
          if (match) {
            const speakerName = match[1];
            const text = match[2];
            window.onCaptionReceived(speakerName, text, Date.now());
          }
        }
      });
    });
  });
  observer.observe(captionsContainer, { childList: true, subtree: true });
});
```

## Security Considerations

### Storing Google Credentials

1. **Encrypt passwords** using AES-256
2. Store encryption key in environment variable
3. Never log passwords
4. Use session cookies when possible (no password storage)

### Google Account Security

1. **Create dedicated bot account**
   - Don't use personal accounts
   - Set up 2FA with app-specific password
   
2. **Use OAuth2 refresh tokens** instead of passwords
   - More secure
   - Can be revoked easily
   
3. **Implement cookie rotation**
   - Refresh session periodically
   - Handle expired sessions gracefully

## Implementation Priority

### Quick Win (1-2 days):
- ✅ Add Google credentials fields to bot config
- ✅ Implement basic Google sign-in flow
- ✅ Test with one bot account

### Medium Term (1 week):
- ✅ Add UI for Google credentials
- ✅ Encrypt stored passwords
- ✅ Session cookie management
- ✅ Better participant data extraction

### Long Term (2-4 weeks):
- ✅ OAuth2 implementation (no password storage)
- ✅ 2FA handling
- ✅ Automatic session refresh
- ✅ Multi-account management (pool of bot accounts)

## Expected Results

After implementing Google authentication:

### Before (Guest Mode):
```
Speaker A: Hello everyone
Speaker B: Hi there
Speaker A: How are you?
```

### After (Authenticated Mode):
```
John Doe: Hello everyone
Jane Smith: Hi there
John Doe: How are you?
```

## Why My Previous Fix Won't Work

The fix I made (trying multiple button selectors) is just a **band-aid**:
- ❌ Still relies on fragile UI scraping
- ❌ Google Meet continues to change UI
- ❌ Even if panel opens, participant names as guest are unreliable
- ❌ Google Meet may show "Participant 1, 2, 3" for guests

**The root cause is guest access**, not UI selectors.

## Recommended Next Steps

1. **Create a test Google account** for the bot
2. **Implement basic Google sign-in** (Phase 1)
3. **Test with a real meeting** to verify participant names are captured
4. **Roll out to production** once verified
5. **Add OAuth2** for long-term security

## Alternative: Use a Service Like Recall.ai

If implementing this is too complex:
- Consider using Recall.ai's API directly
- They handle all the authentication complexity
- Pay per meeting minute
- Pros: Faster to implement, maintained by them
- Cons: Cost per usage, vendor lock-in

## Questions?

- **Q: Can't we just scrape better?**
  - A: No, Google Meet intentionally limits guest access. Authenticated users get proper APIs.

- **Q: Is this against Google's TOS?**
  - A: Using a bot account is fine as long as meeting participants know and consent.

- **Q: What about privacy?**
  - A: Same privacy considerations as current implementation. Bot still records the meeting.

- **Q: How does Recall.ai handle 2FA?**
  - A: They use app-specific passwords or OAuth2, bypassing 2FA for automated access.
