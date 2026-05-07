FROM node:20-alpine

WORKDIR /app

# Install bot deps from the bot/ subfolder
COPY bot/package.json ./bot/
RUN cd bot && npm install --omit=dev

# Copy bot sources
COPY bot/ ./bot/

# Persistent data dir (Railway can mount a volume here)
RUN mkdir -p /data
ENV RAILWAY_VOLUME_MOUNT_PATH=/data

CMD ["node", "bot/bot.js"]
