FROM node:20-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-arm-none-eabi binutils-arm-none-eabi \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
