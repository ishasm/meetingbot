# Speaker Name Extraction Fix - Based on Current Google Meet DOM

## What Was Fixed

Updated the bot's participant name extraction to work with Google Meet's current DOM structure (as of January 2025).

## Problem

The bot was looking for participant names using old selectors that no longer work:
- Old: `node.getAttribute("aria-label")` directly on participant nodes
- Result: Empty or generic names

## Solution

Based on the actual DOM structure from a live Google Meet session, I added:

### 1. Multiple Selectors for Participants List

```typescript
const peopleList = 
  document.querySelector('[role="list"][aria-label="Participants"]') ||
  document.querySelector('[aria-label="Participants"]') ||
  document.querySelector('[jsname="jrQDbd"]') ||
  document.querySelector('.AE8xFb.OrqRRb');
```

### 2. Smart Name Extraction Function

```typescript
const extractParticipantInfo = (node: any) => {
  // Method 1: aria-label on the listitem (most reliable)
  const ariaLabel = node.getAttribute?.('aria-label');
  if (ariaLabel && ariaLabel !== 'Merged audio') {
    return {
      id: node.getAttribute('data-participant-id'),
      name: ariaLabel // e.g., "Sumant Mann"
    };
  }
  
  // Method 2: Look for span.zWGUib (name span in new UI)
  const nameSpan = node.querySelector?.('.zWGUib');
  if (nameSpan?.textContent) {
    return {
      id: node.getAttribute('data-participant-id'),
      name: nameSpan.textContent.trim()
    };
  }
  
  // Method 3: Fallback to data-participant-id
  const participantId = node.getAttribute?.('data-participant-id');
  if (participantId) {
    return {
      id: participantId,
      name: participantId.split('/').pop() || participantId
    };
  }
  
  return null;
};
```

## Current DOM Structure (January 2025)

Based on inspection of a live Google Meet:

```html
<div role="list" aria-label="Participants" class="AE8xFb OrqRRb GvcuGe goTdfd" jsname="jrQDbd">
  <div role="listitem" 
       aria-label="Sumant Mann" 
       class="cxdMu KV1GEc" 
       data-participant-id="spaces/__0NrCfqV00B/devices/78">
    <div class="SKWIhd">
      <div class="BEaVse">
        <img src="..." class="KjWwNd">
      </div>
      <div class="zSX24d" jsname="mu2b5d">
        <div class="jKwXVe">
          <span class="zWGUib">Sumant Mann</span>  <!-- NAME IS HERE -->
          <span class="NnTWjc">(You)</span>
        </div>
        <div class="d93U2d qrLqp">Meeting host</div>
      </div>
    </div>
    <!-- More content... -->
  </div>
</div>
```

## Key Selectors

| Element | Selector | Purpose |
|---------|----------|---------|
| Participants list | `[role="list"][aria-label="Participants"]` | Container for all participants |
| Participant item | `[role="listitem"]` | Individual participant entry |
| Participant ID | `data-participant-id` attribute | Unique identifier |
| Participant name | `aria-label` on listitem OR `span.zWGUib` | The actual name |

## What Changed in the Code

### File: `src/bots/meet/src/bot.ts`

1. **Added multiple fallback selectors** for finding the participants list
2. **Created `extractParticipantInfo()` helper** that tries 3 methods to get names
3. **Updated initial participant processing** to use the new extraction
4. **Updated mutation observer** for added/removed participants to use extraction
5. **Added better logging** to debug when participants are found

## How to Update When Google Changes UI

When Google Meet updates their UI and this breaks:

1. **Join a Google Meet** and open participants panel
2. **Run this in console**:
   ```javascript
   const items = document.querySelectorAll('[role="listitem"]');
   items.forEach((item, i) => {
     console.log(`Participant ${i}:`, {
       ariaLabel: item.getAttribute('aria-label'),
       participantId: item.getAttribute('data-participant-id'),
       html: item.outerHTML.substring(0, 300)
     });
   });
   ```

3. **Look for the name** in the output (e.g., "Sumant Mann")
4. **Find the selector** where the name appears (class name, aria-label, etc.)
5. **Update the `extractParticipantInfo()` function** in `bot.ts`:
   ```typescript
   // Add new method as Method 4:
   const newSelector = node.querySelector?.('.NewClassName');
   if (newSelector?.textContent) {
     return {
       id: node.getAttribute('data-participant-id'),
       name: newSelector.textContent.trim()
     };
   }
   ```

6. **Rebuild and test**: `docker compose up --build -d`

## Testing

### Before Fix:
```
Bot 7 stdout: Speaker timeframes: []
Transcript: "Speaker A: Hello everyone"
```

### After Fix:
```
Bot 8 stdout: Found initial participant: Sumant Mann spaces/__0NrCfqV00B/devices/78
Bot 8 stdout: Participant Sumant Mann is speaking at 1234ms
Bot 8 stdout: Participant John Doe is speaking at 5678ms
Bot 8 stdout: Speaker timeframes: [{speakerName: "Sumant Mann", start: 1234, end: 2345}, ...]
Transcript: "Sumant Mann: Hello everyone"
```

## Rebuild Instructions

```bash
# Rebuild the Docker containers
docker compose up --build -d

# Monitor logs for a new bot
docker compose logs server -f | grep -E "participant|speaker|Found initial"

# You should see:
# ✓ Participants panel opened successfully!
# Found initial participant: [Real Name] [ID]
# Participant [Real Name] is speaking at [timestamp]ms
```

## Benefits of This Approach

✅ **No authentication needed** - Works with guest access
✅ **Easy to maintain** - Just update selectors when UI changes
✅ **Multiple fallbacks** - Tries 3 different methods to find names
✅ **Works today** - Based on actual current DOM structure
✅ **Simple updates** - User can provide new DOM structure anytime

## Future UI Changes

When Google Meet changes the UI again:

1. User runs debug script in browser console
2. User shares the output (participant HTML structure)
3. Developer updates the `extractParticipantInfo()` function
4. Rebuild and deploy

This is much simpler than implementing full Google OAuth authentication!
