# Fix: Speaker Names Showing as A, B, C Instead of Real Names

## Problem

When transcribing meeting recordings, the transcript was showing generic speaker labels like "Speaker A", "Speaker B", "Speaker C" instead of the actual participant names from Google Meet.

## Root Cause

The issue was in the Google Meet bot's participant tracking system:

1. **The bot failed to open the Google Meet participants panel**
   - Error logs showed: `"People button not found, using fallback selector"` and `"Could not click People button. Continuing anyways."`
   
2. **Without the participants panel open, the mutation observers couldn't be set up**
   - The code looked for `[aria-label="Participants"]` element
   - If not found, it returned early and skipped setting up participant tracking
   
3. **No participant tracking = empty speaker timeframes**
   - Logs showed: `Bot 6 stdout: Speaker timeframes: []`
   - Without speaker timeframes, AssemblyAI only provides generic labels (A, B, C)

## What Was Changed

### File: `/home/isha/Desktop/meetingbot/src/bots/meet/src/bot.ts`

#### 1. Added Multiple Strategies to Open Participants Panel

Replaced the single attempt to click the People button with 4 different strategies:

- **Strategy 1**: Find the "people" icon (Material Icons) and click its parent button
- **Strategy 2**: Use aria-label selector `[aria-label="People"]`
- **Strategy 3**: Find button by text content containing "people"
- **Strategy 4**: Use keyboard shortcut `Ctrl+Alt+P`

Each strategy has a 3-second timeout and tries the next one if it fails.

#### 2. Added Debug Logging

Added code to log available buttons and their aria-labels to help diagnose future UI changes:

```typescript
console.log("=== Debugging: Available buttons in the meeting ===");
// Logs first 20 buttons with their aria-labels and text content
```

#### 3. Improved Error Messages

Changed vague warnings to clear critical error messages:

```typescript
console.error("⚠️ CRITICAL: Could not open participants panel after trying all strategies!");
console.error("⚠️ Speaker names will NOT be captured - transcripts will show A, B, C");
```

#### 4. Added Status Tracking

The code now tracks whether the participants panel was successfully opened and reports success/failure clearly.

## How to Test the Fix

1. **Rebuild the Docker containers**:
   ```bash
   docker compose up --build -d
   ```

2. **Create a new meeting bot** (don't reuse old recordings)

3. **Check the logs while bot is joining**:
   ```bash
   docker compose logs server -f | grep -i "participant\|people\|speaker"
   ```
   
   You should see:
   - `"✓ Participants panel opened successfully!"`
   - `"✓ Participant tracking set up successfully!"`
   - `"Participant [Name] is speaking at [timestamp]ms"`

4. **After the meeting ends, check speaker timeframes**:
   - The logs should show non-empty speaker timeframes array
   - When transcribing, you should see real names in the transcript

## Why Google Meet UI Changes Broke This

Google Meet frequently updates their UI, which can break web scraping bots:
- Aria labels change
- Button selectors change  
- Material Icons update (text content changes from "people" to something else)

The new multi-strategy approach is more resilient to these changes.

## What Happens Now

- ✅ **New recordings**: Will capture real speaker names
- ❌ **Old recordings**: Already recorded without speaker timeframes, cannot be fixed retroactively
- 💡 **For old recordings**: You'd need to manually re-record the meeting or accept A, B, C labels

## Future Improvements

If this breaks again, consider:

1. Using Google Meet's official API instead of scraping (if available)
2. Adding visual screenshot logging when strategies fail
3. Implementing a "headless: false" debug mode to see what the bot sees
4. Creating a fallback that prompts user to manually map A/B/C to real names

## Technical Details

### AssemblyAI Integration

The transcription system uses AssemblyAI with two approaches:

1. **Speaker Identification API**: Sends speaker names to AssemblyAI to try to identify speakers by voice
2. **Timeframe Matching**: Maps generic labels (A, B, C) to real names by matching speech timing with captured speaker activity

Both approaches require the `speakerTimeframes` data captured during recording.

### Speaker Timeframes Format

```typescript
{
  speakerName: string,  // e.g. "John Doe"
  start: number,        // milliseconds from recording start
  end: number          // milliseconds from recording start  
}
```

These are captured by monitoring DOM mutations in the Google Meet participants list when someone is speaking.
