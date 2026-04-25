#!/bin/bash

# Build bot Docker images for local Docker Compose deployment
echo "Building MeetingBot Docker images for local deployment..."

# Build Google Meet bot
echo "Building Google Meet bot..."
docker build -f src/bots/meet/Dockerfile.local -t meetingbot-meet:latest src/bots/

# Build Google Meet voice-assistant bot (Gemini Live)
echo "Building Google Meet voice-assistant bot..."
docker build -f src/bots/meet-voice/Dockerfile.local -t meetingbot-meet-voice:latest src/bots/

# Build Microsoft Teams bot
# echo "Building Microsoft Teams bot..."
# docker build -f src/bots/teams/Dockerfile.local -t meetingbot-teams:latest src/bots/

# # Build Zoom bot
# echo "Building Zoom bot..."
# docker build -f src/bots/zoom/Dockerfile.local -t meetingbot-zoom:latest src/bots/

echo "All bot images built successfully!"
echo ""
echo "Available images:"
echo "  - meetingbot-meet:latest"
echo "  - meetingbot-meet-voice:latest"
echo "  - meetingbot-teams:latest"
echo "  - meetingbot-zoom:latest"