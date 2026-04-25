# Dockerfile for the Google Meet voice-assistant bot (AWS ECS build).
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base

RUN apt-get update && apt-get install -y \
    xvfb \
    ffmpeg \
    x11-utils \
    pulseaudio \
    pulseaudio-utils \
    x11-xserver-utils \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY meet/package.json meet/pnpm-lock.yaml ./meet/
COPY meet-voice/package.json meet-voice/entrypoint.sh ./meet-voice/

RUN sed -i 's/\r$//' ./meet-voice/entrypoint.sh

RUN pnpm install --filter "@bots/meet" --filter "@bots/meet-voice" --filter "bots"

RUN pnpm dlx playwright@1.52.0 install-deps
RUN pnpm dlx playwright@1.52.0 install --with-deps
RUN mkdir -p /root/ms-playwright && chmod -R 777 /root/ms-playwright

# Runtime stage
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS runtime

ENV DOCKER_MEETING_PLATFORM=meet-voice

WORKDIR /app

RUN useradd -ms /bin/bash meetbot && chown -R meetbot:meetbot /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    xserver-xephyr \
    x11-xserver-utils \
    fluxbox \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/package.json /app/package.json
COPY --from=base /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=base /app/meet/node_modules /app/meet/node_modules
COPY --from=base /app/meet/package.json /app/meet/package.json
COPY --from=base /app/meet/pnpm-lock.yaml /app/meet/pnpm-lock.yaml
COPY --from=base /app/meet-voice/node_modules /app/meet-voice/node_modules
COPY --from=base /app/meet-voice/package.json /app/meet-voice/package.json
COPY --from=base /root/ms-playwright /root/ms-playwright
COPY --from=base /app/meet-voice/entrypoint.sh /app/entrypoint.sh

RUN chown -R meetbot:meetbot /app
RUN chown -R meetbot:meetbot /root/ms-playwright

COPY src ./src
COPY meet/src ./meet/src
COPY meet-voice/src ./meet-voice/src
COPY test.env ./
RUN chown -R meetbot:meetbot ./src
RUN chown -R meetbot:meetbot ./meet/src
RUN chown -R meetbot:meetbot ./meet-voice/src

ENV DISPLAY=:99
EXPOSE 7070

USER meetbot
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]
