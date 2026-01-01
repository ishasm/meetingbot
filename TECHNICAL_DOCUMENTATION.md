# MeetingBot Technical Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Bot Implementation](#bot-implementation)
7. [Deployment Options](#deployment-options)
8. [Development Workflow](#development-workflow)
9. [Security & Authentication](#security--authentication)
10. [Monitoring & Events](#monitoring--events)

---

## System Overview

MeetingBot is an open-source meeting bot API that provides infrastructure for sending bots to video meetings (Google Meet, Microsoft Teams, and Zoom) and recording them. The system enables developers to build applications using meeting recording data with just a few lines of code.

### Key Features

- **Multi-Platform Support**: Google Meet, Microsoft Teams, and Zoom
- **Self-Hosted**: Deploy to AWS or run locally with Docker Compose
- **Type-Safe API**: Built with tRPC for end-to-end type safety
- **Automated Recording**: Bots join meetings, record audio/video, and upload to S3
- **Audio Extraction**: Automatic MP3 extraction (mono, 16kHz, 64kbps) optimized for transcription
- **Multi-Provider Transcription**: Support for OpenAI Whisper, AssemblyAI, and self-hosted Whisper
- **Speaker Diarization**: Automatic speaker identification using meeting participant data
- **AI Summarization**: Generate meeting summaries using GPT-4
- **Event System**: Real-time event notifications for bot lifecycle
- **API Key Management**: Secure authentication and usage tracking
- **Callback Webhooks**: Receive notifications when bot status changes

---

## Architecture

```mermaid
graph TB
    subgraph "Client Applications"
        A[Web Dashboard]
        B[Example App]
        C[Third-Party Apps]
    end
    
    subgraph "MeetingBot Server (Next.js)"
        D[tRPC API]
        E[NextAuth]
        F[Bot Deployment Service]
    end
    
    subgraph "Database Layer"
        G[(PostgreSQL)]
    end
    
    subgraph "Bot Infrastructure"
        H[Google Meet Bot]
        I[Teams Bot]
        J[Zoom Bot]
    end
    
    subgraph "Storage"
        K[S3/MinIO]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    D --> F
    D --> G
    F --> H
    F --> I
    F --> J
    H --> K
    I --> K
    J --> K
    H --> D
    I --> D
    J --> D
```

### Component Overview

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Server** | Next.js 14+ | Web dashboard and tRPC API backend |
| **Database** | PostgreSQL | Persistent storage for users, bots, events, API keys |
| **Bot Runtime** | Puppeteer + TypeScript | Browser automation for joining meetings |
| **Storage** | S3/MinIO | Recording storage (video MP4 + audio MP3) |
| **Transcription** | OpenAI/AssemblyAI/Whisper | Multi-provider speech-to-text with speaker diarization |
| **Infrastructure** | Terraform + AWS/Docker | Deployment and orchestration |
| **API Layer** | tRPC | Type-safe API endpoints |
| **ORM** | Drizzle | Type-safe database queries |

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Components**: React 18+
- **Styling**: TailwindCSS
- **Type Safety**: TypeScript
- **API Client**: tRPC Client

### Backend
- **Framework**: Next.js API Routes
- **API**: tRPC
- **Authentication**: NextAuth.js (GitHub OAuth)
- **Database ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Validation**: Zod

### Bots
- **Runtime**: Node.js 18+
- **Browser Automation**: Puppeteer
- **Language**: TypeScript
- **Storage Client**: AWS SDK (S3)

### Infrastructure
- **IaC**: Terraform
- **Cloud Provider**: AWS (ECS, RDS, S3, ALB, VPC)
- **Local Development**: Docker Compose
- **Container Registry**: ECR (AWS) or local Docker

### CI/CD
- **Platform**: GitHub Actions
- **Package Manager**: pnpm
- **Testing**: Jest, Playwright

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    user ||--o{ account : has
    user ||--o{ session : has
    user ||--o{ api_keys : owns
    user ||--o{ bots : creates
    api_keys ||--o{ api_request_logs : generates
    bots ||--o{ events : produces
    
    user {
        uuid id PK
        text name
        text email UK
        timestamp emailVerified
        text image
        timestamp createdAt
    }
    
    account {
        uuid userId FK
        text type
        text provider
        text providerAccountId
        text refresh_token
        text access_token
    }
    
    session {
        text sessionToken PK
        uuid userId FK
        timestamp expires
    }
    
    api_keys {
        serial id PK
        uuid user_id FK
        varchar key UK
        varchar name
        timestamp created_at
        timestamp last_used_at
        timestamp expires_at
        boolean is_revoked
    }
    
    bots {
        serial id PK
        uuid user_id FK
        varchar bot_display_name
        varchar bot_image
        varchar meeting_name
        json meeting_info
        timestamp start_time
        timestamp end_time
        varchar recording
        varchar mp3
        text transcription
        varchar transcription_provider
        json speaker_timeframes
        timestamp last_heartbeat
        varchar status
        varchar deployment_error
        integer heartbeat_interval
        json automatic_leave
        varchar callback_url
        timestamp created_at
    }
    
    events {
        serial id PK
        integer bot_id FK
        varchar event_type
        timestamp event_time
        json details
        timestamp created_at
    }
    
    api_request_logs {
        serial id PK
        integer api_key_id FK
        uuid user_id FK
        varchar method
        varchar path
        integer status_code
        json request_body
        json response_body
        varchar error
        integer duration
        timestamp created_at
    }
```

### Table Descriptions

#### **user**
Stores user account information for authentication.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key, auto-generated |
| name | text | User's display name |
| email | text | User's email (unique) |
| emailVerified | timestamp | Email verification timestamp |
| image | text | Profile image URL |
| createdAt | timestamp | Account creation timestamp |

#### **api_keys**
API keys for programmatic access to the MeetingBot API.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | uuid | Foreign key to user |
| key | varchar(64) | API key (unique, 64-char hex) |
| name | varchar(255) | Human-readable key name |
| created_at | timestamp | Creation timestamp |
| last_used_at | timestamp | Last usage timestamp |
| expires_at | timestamp | Expiration timestamp |
| is_revoked | boolean | Revocation status |

#### **bots**
Bot configurations and meeting recordings.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | uuid | Foreign key to user |
| bot_display_name | varchar(255) | Bot's display name in meeting |
| bot_image | varchar(255) | Bot's profile image URL |
| meeting_name | varchar(255) | Meeting title |
| meeting_info | json | Platform-specific meeting details |
| start_time | timestamp | Scheduled start time |
| end_time | timestamp | Scheduled end time |
| recording | varchar(255) | S3 key for video recording (MP4) |
| mp3 | varchar(255) | S3 key for extracted audio (MP3) |
| transcription | text | Full transcription text with speaker labels |
| transcription_provider | varchar(50) | Provider used (openai/assemblyai/whisper-self-hosted) |
| speaker_timeframes | json | Array of speaker segments |
| last_heartbeat | timestamp | Last heartbeat from bot |
| status | varchar(255) | Current bot status |
| deployment_error | varchar(1024) | Error message if deployment failed |
| heartbeat_interval | integer | Heartbeat interval in milliseconds |
| automatic_leave | json | Auto-leave configuration |
| callback_url | varchar(1024) | Webhook URL for events |
| created_at | timestamp | Creation timestamp |

**Bot Status Values:**
- `READY_TO_DEPLOY`: Bot created, ready to deploy
- `DEPLOYING`: Bot deployment in progress
- `JOINING_CALL`: Bot connecting to meeting
- `IN_WAITING_ROOM`: Bot in waiting room
- `IN_CALL`: Bot actively recording
- `CALL_ENDED`: Bot left the meeting
- `DONE`: Recording uploaded, bot shutdown
- `FATAL`: Error occurred

**meeting_info Schema (Platform-Specific):**

*Zoom:*
```json
{
  "platform": "zoom",
  "meetingId": "string",
  "meetingPassword": "string"
}
```

*Google Meet:*
```json
{
  "platform": "google",
  "meetingUrl": "string"
}
```

*Microsoft Teams:*
```json
{
  "platform": "teams",
  "meetingId": "string",
  "organizerId": "string",
  "tenantId": "string"
}
```

**automatic_leave Schema:**
```json
{
  "waitingRoomTimeout": 60000,
  "noOneJoinedTimeout": 300000,
  "everyoneLeftTimeout": 30000,
  "inactivityTimeout": 600000
}
```

#### **events**
Event log for bot lifecycle and activities.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| bot_id | integer | Foreign key to bots |
| event_type | varchar(255) | Event type code |
| event_time | timestamp | Event occurrence time |
| details | json | Event-specific data |
| created_at | timestamp | Log creation timestamp |

**Event Types:**
- `READY_TO_DEPLOY`: Bot ready to join meeting
- `DEPLOYING`: Bot deployment started
- `JOINING_CALL`: Bot connecting to meeting
- `IN_WAITING_ROOM`: Bot in waiting room
- `IN_CALL`: Bot in meeting, recording
- `CALL_ENDED`: Bot left meeting
- `DONE`: Bot shutdown complete
- `FATAL`: Fatal error occurred
- `PARTICIPANT_JOIN`: Participant joined
- `PARTICIPANT_LEAVE`: Participant left
- `LOG`: General log message

#### **api_request_logs**
Audit log for API requests.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| api_key_id | integer | Foreign key to api_keys |
| user_id | uuid | Foreign key to user |
| method | varchar(10) | HTTP method |
| path | varchar(255) | Request path |
| status_code | integer | HTTP status code |
| request_body | json | Request payload |
| response_body | json | Response payload |
| error | varchar(1024) | Error message if any |
| duration | integer | Request duration (ms) |
| created_at | timestamp | Log creation timestamp |

---

## API Reference

### Authentication

MeetingBot supports two authentication methods:

1. **Session-based (Web Dashboard)**: NextAuth.js with GitHub OAuth
2. **API Key (Programmatic Access)**: Bearer token authentication

**API Key Authentication:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-server.com/api/trpc/bots.getBots
```

### tRPC Routers

#### **bots Router**

##### `getBots`
Get all bots for the authenticated user.

```typescript
// Request
input: {}

// Response
output: Bot[]
```

##### `getBot`
Get a specific bot by ID.

```typescript
// Request
input: { id: number }

// Response
output: Bot
```

##### `createBot`
Create a new bot and optionally deploy it immediately.

```typescript
// Request
input: {
  botDisplayName?: string,
  botImage?: string,
  meetingTitle?: string,
  meetingInfo: MeetingInfo,
  startTime?: Date,
  endTime?: Date,
  heartbeatInterval?: number,
  automaticLeave?: AutomaticLeave,
  callbackUrl?: string
}

// Response
output: Bot
```

**Example:**
```typescript
const bot = await trpc.bots.createBot.mutate({
  botDisplayName: "Recording Bot",
  meetingTitle: "Team Standup",
  meetingInfo: {
    platform: "zoom",
    meetingId: "123456789",
    meetingPassword: "secret"
  },
  startTime: new Date("2024-01-01T10:00:00Z"),
  endTime: new Date("2024-01-01T11:00:00Z"),
  callbackUrl: "https://myapp.com/webhook"
});
```

##### `updateBot`
Update bot configuration.

```typescript
// Request
input: {
  id: number,
  data: Partial<Bot>
}

// Response
output: Bot
```

##### `updateBotStatus`
Update bot status (used by bot scripts).

```typescript
// Request
input: {
  id: number,
  status: Status,
  recording?: string,
  speakerTimeframes?: SpeakerTimeframe[]
}

// Response
output: Bot
```

##### `deleteBot`
Delete a bot.

```typescript
// Request
input: { id: number }

// Response
output: { message: string }
```

##### `getSignedRecordingUrl`
Get a signed URL to download the video recording.

```typescript
// Request
input: { id: number }

// Response
output: { recordingUrl: string | null }
```

##### `getSignedAudioUrl`
Get a signed URL to download the extracted MP3 audio.

```typescript
// Request
input: { id: number }

// Response
output: { audioUrl: string | null }
```

##### `heartbeat`
Bot heartbeat endpoint (called by bot scripts).

```typescript
// Request
input: { id: number }

// Response
output: { success: boolean }
```

##### `reportEvent`
Report a bot event (called by bot scripts).

```typescript
// Request
input: {
  id: number,
  event: {
    eventType: EventCode,
    eventTime: Date,
    data?: EventData
  }
}

// Response
output: { success: boolean }
```

##### `deployBot`
Manually deploy a bot.

```typescript
// Request
input: { id: number }

// Response
output: Bot
```

##### `getActiveBotCount`
Get count of active bots for the user.

```typescript
// Request
input: {}

// Response
output: { count: number }
```

#### **Transcription Endpoints**

##### `getAvailableTranscriptionProviders`
Get list of available transcription providers based on configured API keys.

```typescript
// Request
input: {}

// Response
output: {
  providers: ("openai" | "assemblyai" | "whisper-self-hosted")[],
  defaultProvider?: "openai" | "assemblyai" | "whisper-self-hosted"
}
```

##### `transcribeBot`
Transcribe the audio recording using the specified provider with enhanced speaker diarization.

```typescript
// Request
input: {
  id: number,
  provider?: "openai" | "assemblyai" | "whisper-self-hosted",
  language?: string,  // e.g., "en", "es", "fr"
  speakerDiarization?: boolean,  // Default: true
  saveToDatabase?: boolean  // Default: true
}

// Response
output: {
  text: string,
  language?: string,
  duration?: number,
  segments?: Array<{
    start: number,
    end: number,
    text: string,
    speaker?: string,
    confidence?: number
  }>,
  words?: Array<{
    word: string,
    start: number,
    end: number,
    confidence?: number,
    speaker?: string
  }>,
  provider: string,
  processingTimeMs?: number
}
```

**Example:**
```typescript
const result = await trpc.bots.transcribeBot.mutate({
  id: 123,
  provider: "assemblyai",
  speakerDiarization: true
});

// Result includes speaker names from meeting
console.log(result.text);
// "John Smith: Welcome everyone...
//  Jane Doe: Thanks for having me..."
```

##### `getTranscription`
Get the stored transcription for a bot.

```typescript
// Request
input: { id: number }

// Response
output: {
  transcription: string | null,
  transcriptionProvider: string | null
}
```

##### `generateSummary`
Generate an AI summary of the meeting transcription.

```typescript
// Request
input: {
  id: number,
  customPrompt?: string  // Optional custom summarization prompt
}

// Response
output: {
  summary: string
}
```

**Example:**
```typescript
const summary = await trpc.bots.generateSummary.mutate({
  id: 123
});

console.log(summary.summary);
// "Meeting Summary:
//  - Discussed Q4 objectives...
//  - Action items assigned to..."
```

#### **apiKeys Router**

##### `createApiKey`
Create a new API key.

```typescript
// Request
input: {
  name: string,
  expiresAt?: Date // Default: 6 months from now
}

// Response
output: {
  id: number,
  key: string, // Only returned on creation
  name: string,
  created_at: Date,
  expires_at: Date,
  is_revoked: boolean
}
```

##### `listApiKeys`
List all API keys for the user.

```typescript
// Request
input: {}

// Response
output: ApiKey[]
```

##### `revokeApiKey`
Revoke an API key.

```typescript
// Request
input: { id: number }

// Response
output: ApiKey
```

##### `getApiKeyLogs`
Get usage logs for a specific API key.

```typescript
// Request
input: {
  id: number,
  limit?: number, // Default: 50, Max: 100
  offset?: number // Default: 0
}

// Response
output: {
  logs: ApiRequestLog[],
  total: number
}
```

##### `getAllApiKeyLogs`
Get usage logs for all API keys.

```typescript
// Request
input: {
  limit?: number,
  offset?: number
}

// Response
output: {
  logs: ApiRequestLog[],
  total: number
}
```

##### `getApiKeyCount`
Get count of non-expired API keys.

```typescript
// Request
input: {}

// Response
output: { count: number }
```

#### **events Router**

##### `getEvents`
Get events for a specific bot.

```typescript
// Request
input: {
  botId: number,
  limit?: number,
  offset?: number
}

// Response
output: {
  events: Event[],
  total: number
}
```

##### `getAllEvents`
Get all events for the user's bots.

```typescript
// Request
input: {
  limit?: number,
  offset?: number
}

// Response
output: {
  events: Event[],
  total: number
}
```

#### **usage Router**

##### `getDailyUsage`
Get daily usage statistics.

```typescript
// Request
input: {
  startDate: Date,
  endDate: Date
}

// Response
output: {
  date: string,
  msEllapsed: number,
  estimatedCost: string,
  count: number
}[]
```

---

## Bot Implementation

### Bot Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant BotContainer
    participant Meeting
    participant S3
    
    User->>Server: Create Bot
    Server->>Server: Store in DB (READY_TO_DEPLOY)
    Server->>BotContainer: Deploy (ECS/Docker)
    BotContainer->>Server: Report DEPLOYING
    BotContainer->>Server: Start Heartbeat
    BotContainer->>Meeting: Join Meeting
    BotContainer->>Server: Report JOINING_CALL
    Meeting-->>BotContainer: Waiting Room
    BotContainer->>Server: Report IN_WAITING_ROOM
    Meeting-->>BotContainer: Admitted
    BotContainer->>Server: Report IN_CALL
    BotContainer->>BotContainer: Record Audio/Video
    BotContainer->>Server: Report PARTICIPANT_JOIN/LEAVE
    Meeting-->>BotContainer: Meeting Ends
    BotContainer->>Server: Report CALL_ENDED
    BotContainer->>BotContainer: Extract Audio (MP3)
    BotContainer->>S3: Upload Video (MP4)
    BotContainer->>S3: Upload Audio (MP3)
    BotContainer->>Server: Report DONE (with video & audio keys)
    Server->>User: Callback Webhook (if configured)
    User->>Server: Transcribe Recording
    Server->>TranscriptionAPI: Send Audio
    TranscriptionAPI-->>Server: Return Transcription with Speakers
    Server->>Server: Map Speakers to Names
    Server->>User: Return Transcription
    BotContainer->>BotContainer: Shutdown
```

### Bot Architecture

Each bot is a containerized Node.js application that:

1. **Launches a Browser**: Uses Puppeteer to control a headless Chrome instance
2. **Navigates to Meeting**: Platform-specific navigation logic
3. **Joins Meeting**: Handles authentication, waiting rooms, permissions
4. **Records**: Captures audio/video streams using FFmpeg
5. **Tracks Speakers**: Detects active speakers and records timeframes
6. **Monitors**: Sends heartbeats and events to server
7. **Auto-Leave**: Implements timeout logic for various scenarios
8. **Extracts Audio**: Converts video to optimized MP3 (mono, 16kHz, 64kbps)
9. **Uploads**: Transfers both video (MP4) and audio (MP3) to S3/MinIO
10. **Cleanup**: Shuts down gracefully

### Audio Processing Pipeline

After recording ends, the bot automatically:

1. **Stops Recording**: FFmpeg finalizes the video file
2. **Extracts Audio**: Uses FFmpeg to convert video → optimized MP3
   - Sample rate: 16kHz (optimal for speech recognition)
   - Channels: Mono (reduces file size by 50%)
   - Bitrate: 64kbps (good quality for speech)
   - Result: ~30MB per hour (vs ~500MB+ for video)
3. **Uploads Both Files**: 
   - Video: `recordings/{uuid}-{platform}-recording.mp4`
   - Audio: `recordings/{uuid}-{platform}-audio.mp3`
4. **Reports Completion**: Sends both S3 keys to server

### Bot Entry Point

**File**: `src/bots/src/index.ts`

```typescript
export const main = async () => {
  // 1. Parse bot configuration from environment
  const botData: BotConfig = JSON.parse(process.env.BOT_DATA!);
  
  // 2. Initialize S3 client
  const s3Client = createS3Client(...);
  
  // 3. Create platform-specific bot instance
  const bot = await createBot(botData);
  
  // 4. Start heartbeat in background
  startHeartbeat(botId, heartbeatInterval);
  
  // 5. Report READY_TO_DEPLOY
  await reportEvent(botId, EventCode.READY_TO_DEPLOY);
  
  // 6. Run the bot (join meeting, record)
  await bot.run();
  
  // 7. Upload recording to S3 (video + extracted audio)
  const uploadResult = await uploadRecordingToS3(s3Client, bot);
  // uploadResult = { videoKey: "...", audioKey: "..." }
  
  // 8. Report DONE with both video and audio keys
  await reportEvent(botId, EventCode.DONE, { 
    recording: uploadResult.videoKey,
    mp3: uploadResult.audioKey,
    speakerTimeframes
  });
  
  // 9. Exit
  process.exit(0);
};
```

### Platform-Specific Bots

Each platform has its own bot implementation:

- **Google Meet**: `src/bots/meet/src/bot.ts`
- **Microsoft Teams**: `src/bots/teams/src/bot.ts`
- **Zoom**: `src/bots/zoom/src/bot.ts`

All bots extend a base `Bot` class and implement platform-specific logic for:
- Authentication
- Meeting navigation
- Permission handling
- Audio/video capture
- Speaker detection

### Transcription & AI Features

MeetingBot includes powerful post-recording features for transcription and analysis:

#### **Multi-Provider Transcription Support**

Three transcription providers are supported, allowing you to choose based on your needs:

| Provider | Best For | Key Features |
|----------|----------|--------------|
| **AssemblyAI** | Production use | Best speaker diarization, fast processing, speaker mapping |
| **OpenAI Whisper** | General use | Good accuracy, simple API, word timestamps |
| **Self-hosted Whisper** | Privacy/Cost | Full control, no API costs, supports faster-whisper-server |

#### **Automatic Audio Extraction**

When a recording completes, the bot automatically:
1. Extracts audio from video using FFmpeg
2. Optimizes for transcription (mono, 16kHz, 64kbps MP3)
3. Uploads both video and audio to S3
4. Result: ~30MB audio per hour vs ~500MB+ video

This means transcription is **fast and cost-effective** - no need to download or process large video files.

#### **Enhanced Speaker Diarization**

MeetingBot's unique advantage is speaker identification using meeting participant data:

**How it works:**
1. **Bot records speaker timeframes**: During the meeting, the bot tracks which participants are actively speaking and when
2. **Transcription with diarization**: Audio is sent to AssemblyAI with speaker hints (expected speaker count)
3. **Speaker mapping**: Generic labels (Speaker A, B, C) are automatically mapped to actual participant names using timestamp overlap analysis
4. **Named transcript**: Final result includes real names instead of generic labels

**Example Output:**
```
John Smith: Welcome everyone to the Q4 planning meeting.
Jane Doe: Thanks for having me. I'd like to discuss our roadmap.
John Smith: Great, let's start with the priorities.
```

Instead of:
```
Speaker A: Welcome everyone to the Q4 planning meeting.
Speaker B: Thanks for having me. I'd like to discuss our roadmap.
Speaker A: Great, let's start with the priorities.
```

#### **AI Summarization**

Generate concise meeting summaries using GPT-4:
- Key discussion points
- Decisions made
- Action items
- Participants mentioned

#### **Transcription API Flow**

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant S3
    participant TranscriptionAPI
    
    User->>Server: POST /bots/{id}/transcribe
    Server->>S3: Get Audio URL (MP3)
    S3-->>Server: Signed URL
    Server->>TranscriptionAPI: Send Audio + Speaker Hints
    Note over TranscriptionAPI: Transcribe with<br/>speaker diarization
    TranscriptionAPI-->>Server: Generic Labels (A, B, C)
    Server->>Server: Map to Real Names
    Note over Server: Using speaker_timeframes<br/>timestamp overlap
    Server->>Server: Save to Database
    Server-->>User: Named Transcription
    User->>Server: POST /bots/{id}/summary
    Server->>OpenAI: Generate Summary
    OpenAI-->>Server: Meeting Summary
    Server-->>User: AI Summary
```

#### **Configuration**

Set your preferred transcription provider via environment variables:

```env
# Choose your provider (auto-detected if not set)
TRANSCRIPTION_PROVIDER=assemblyai

# Provider API keys
OPENAI_API_KEY=sk-...
ASSEMBLYAI_API_KEY=...
WHISPER_API_URL=http://localhost:8000  # For self-hosted
```

The system automatically uses the first available provider based on configured API keys.

---

### Speaker Timeframes

During recording, bots track when each participant is actively speaking:

### Monitoring & Heartbeat

Bots send heartbeats to the server every few seconds (configurable via `heartbeatInterval`):

```typescript
// Bot sends heartbeat
POST /api/trpc/bots.heartbeat
{
  id: 123
}

// Server updates last_heartbeat timestamp
UPDATE bots SET last_heartbeat = NOW() WHERE id = 123;
```

If a bot stops sending heartbeats, the server can detect it's unresponsive.

### Event Reporting

Bots report events throughout their lifecycle:

```typescript
// Bot reports event
POST /api/trpc/bots.reportEvent
{
  id: 123,
  event: {
    eventType: "IN_CALL",
    eventTime: "2024-01-01T10:05:00Z",
    data: null
  }
}

// Server stores event and optionally calls webhook
INSERT INTO events (bot_id, event_type, event_time, details) VALUES (...);
```

---

## Deployment Options

### Docker Compose (Local/Development)

**Advantages:**
- No AWS account required
- Runs entirely on your hardware
- Quick setup (5 minutes)
- Perfect for development and testing

**Components:**
- PostgreSQL container
- MinIO container (S3-compatible storage)
- MeetingBot Server container
- Bot containers (dynamically created)

**Setup:**
```bash
git clone https://github.com/meetingbot/meetingbot.git
cd meetingbot
./setup.sh
make start
```

**Access:**
- Dashboard: http://localhost:3000
- MinIO Console: http://localhost:9001

**Configuration:**
- Edit `.env` file with GitHub OAuth credentials
- Bots are deployed as Docker containers on the same host

### AWS Deployment (Production)

**Advantages:**
- Auto-scaling
- High availability
- Managed services
- Production-ready

**Components:**
- **VPC**: Private network with public, private, and database subnets
- **RDS**: PostgreSQL database
- **ALB**: Application Load Balancer
- **ECS Fargate**: Serverless container orchestration
- **S3**: Recording storage
- **Route53**: DNS management
- **ECR**: Container registry

**Setup:**
```bash
# 1. Configure AWS credentials
make sso

# 2. Initialize Terraform
cp backend.tfvars.example backend.tfvars
cp terraform.tfvars.example terraform.tfvars
# Edit .tfvars files
make init

# 3. Select workspace
terraform workspace select dev

# 4. Deploy
terraform apply
```

**Configuration:**
- Terraform variables in `terraform.tfvars`
- Environment variables in `.env` files
- Bots are deployed as ECS Fargate tasks

### Deployment Comparison

| Feature | Docker Compose | AWS Deployment |
|---------|----------------|----------------|
| **Setup Time** | 5 minutes | 30-60 minutes |
| **Cost** | Free (your hardware) | AWS costs apply |
| **Scalability** | Single machine | Auto-scaling |
| **Maintenance** | Manual updates | Managed services |
| **Requirements** | Docker + 4GB RAM | AWS account + domain |
| **Best For** | Development, small teams | Production, enterprise |

---

## Development Workflow

### Repository Structure

```
meetingbot/
├── src/
│   ├── server/              # Next.js server (dashboard + API)
│   │   ├── src/
│   │   │   ├── app/         # Next.js app router pages
│   │   │   ├── server/      # Backend code
│   │   │   │   ├── api/     # tRPC routers
│   │   │   │   ├── auth/    # NextAuth config
│   │   │   │   └── db/      # Database schema
│   │   │   └── trpc/        # tRPC client
│   │   └── drizzle/         # Database migrations
│   │
│   ├── bots/                # Bot implementations
│   │   ├── src/             # Shared bot code
│   │   ├── meet/            # Google Meet bot
│   │   ├── teams/           # Microsoft Teams bot
│   │   └── zoom/            # Zoom bot
│   │
│   ├── example-app/         # Example integration
│   ├── landing-page/        # Marketing site
│   └── terraform/           # Infrastructure as code
│
├── docker-compose.yml       # Local deployment
├── Makefile                 # Convenience commands
└── setup.sh                 # Setup script
```

### Local Development

**Server:**
```bash
cd src/server
cp .env.example .env
# Edit .env with your credentials
pnpm install
pnpm dev
```

**Bots (for testing):**
```bash
cd src/bots
cp .env.example .env
# Edit .env with bot configuration
pnpm install
pnpm dev
```

**Example App:**
```bash
cd src/example-app
cp .env.example .env
pnpm install
pnpm dev
```

### Database Migrations

**Create a migration:**
```bash
cd src/server
pnpm drizzle-kit generate
```

**Apply migrations:**
```bash
pnpm drizzle-kit push
```

**View database:**
```bash
pnpm drizzle-kit studio
```

### Testing

**Unit Tests:**
```bash
cd src/server
pnpm test
```

**E2E Tests:**
```bash
cd src/server
pnpm test:e2e
```

**Bot Tests:**
```bash
cd src/bots
pnpm test
```

### Building Bot Images

```bash
cd src/bots
docker build -f meet/Dockerfile -t meetingbot-meet .
docker build -f teams/Dockerfile -t meetingbot-teams .
docker build -f zoom/Dockerfile -t meetingbot-zoom .
```

Or use the convenience script:
```bash
./build-bots.sh
```

---

## Security & Authentication

### Web Dashboard Authentication

- **Provider**: GitHub OAuth via NextAuth.js
- **Session Storage**: Database sessions
- **Protected Routes**: All dashboard pages require authentication

**Configuration:**
```env
AUTH_GITHUB_ID=your_github_app_id
AUTH_GITHUB_SECRET=your_github_app_secret
AUTH_SECRET=random_secret_string
```

### API Key Authentication

- **Format**: 64-character hexadecimal string
- **Storage**: Hashed in database (not shown, only on creation)
- **Expiration**: Configurable (default: 6 months)
- **Revocation**: Can be revoked at any time

**Usage:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.meetingbot.tech/api/trpc/bots.getBots
```

### Security Best Practices

1. **API Keys**: Never commit API keys to version control
2. **Environment Variables**: Use `.env` files for secrets
3. **HTTPS**: Always use HTTPS in production
4. **CORS**: Configure CORS appropriately for your domain
5. **Rate Limiting**: Implement rate limiting on API endpoints
6. **Webhook Validation**: Validate webhook signatures if implementing callbacks

### Data Privacy

- **Self-Hosted**: All data stays on your infrastructure
- **Recording Storage**: Encrypted at rest in S3
- **Database**: PostgreSQL with connection encryption
- **Access Control**: User-scoped data access

---

## Monitoring & Events

### Event System

The event system provides real-time visibility into bot lifecycle:

**Event Flow:**
```
Bot Created → READY_TO_DEPLOY
           → DEPLOYING
           → JOINING_CALL
           → IN_WAITING_ROOM (optional)
           → IN_CALL
           → PARTICIPANT_JOIN (multiple)
           → PARTICIPANT_LEAVE (multiple)
           → CALL_ENDED
           → DONE
```

**Error Handling:**
```
Any Stage → FATAL (with error details)
```

### Webhook Callbacks

Configure a `callbackUrl` when creating a bot to receive event notifications:

```typescript
const bot = await trpc.bots.createBot.mutate({
  // ... other config
  callbackUrl: "https://myapp.com/webhook"
});
```

**Webhook Payload:**
```json
{
  "botId": 123,
  "status": "DONE",
  "recording": "recordings/123/meeting.webm",
  "speakerTimeframes": [
    {
      "speakerName": "John Doe",
      "start": 0,
      "end": 30000
    }
  ]
}
```

### Logging

**Server Logs:**
```bash
# Docker Compose
make logs-server

# AWS
aws logs tail /ecs/meetingbot-server --follow
```

**Bot Logs:**
```bash
# Docker Compose
docker logs meetingbot-bot-123

# AWS
aws logs tail /ecs/meetingbot-bot --follow
```

### Health Checks

**Server Health:**
```bash
curl http://localhost:3000/api/health
```

**Database Connection:**
```bash
# Included in bot deployment checks
SELECT 1;
```

---

## Appendix

### Environment Variables Reference

**Server (`src/server/.env`):**
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/meetingbot

# NextAuth
AUTH_SECRET=random_secret_string
AUTH_GITHUB_ID=github_app_id
AUTH_GITHUB_SECRET=github_app_secret
NEXTAUTH_URL=http://localhost:3000

# AWS (for production)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET_NAME=meetingbot-recordings

# Deployment
DEPLOYMENT_MODE=docker-compose  # or 'aws'

# Transcription Providers
TRANSCRIPTION_PROVIDER=assemblyai  # or "openai" or "whisper-self-hosted"
OPENAI_API_KEY=sk-your-openai-api-key
ASSEMBLYAI_API_KEY=your-assemblyai-api-key
WHISPER_API_URL=http://localhost:8000  # For self-hosted
WHISPER_API_KEY=optional-api-key  # For self-hosted
```

**Bots (`src/bots/.env`):**
```env
# Bot Configuration
BOT_DATA={"id":123,"meetingInfo":{...},...}

# AWS
AWS_REGION=us-east-1
AWS_BUCKET_NAME=meetingbot-recordings
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Environment
NODE_ENV=production  # or 'development'

# Server URL
SERVER_URL=http://localhost:3000
```

### Troubleshooting

**Bot fails to join meeting:**
- Check meeting credentials are correct
- Verify bot has network access to meeting platform
- Check browser logs in bot container

**Recording not uploaded:**
- Verify S3/MinIO credentials
- Check bucket permissions
- Review bot logs for upload errors

**Database connection issues:**
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Verify network connectivity

**Authentication not working:**
- Verify GitHub App credentials
- Check callback URL matches GitHub App config
- Ensure AUTH_SECRET is set

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Code style
- Pull request process
- Testing requirements
- Documentation standards

### License

GNU Lesser General Public License v3.0 - See [LICENSE](LICENSE)

### Support

- **Discord**: https://discord.gg/3q37XYUEnK
- **Issues**: https://github.com/meetingbot/meetingbot/issues
- **Documentation**: https://meetingbot.tech

---

*Last Updated: December 2024*
