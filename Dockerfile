FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY bin/ ./bin/
COPY public/ ./public/
EXPOSE 8086
ENV CLAUDE_PROJECTS_DIR=/data
CMD ["node", "server.js"]
