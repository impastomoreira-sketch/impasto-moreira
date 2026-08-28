FROM node:20-alpine
WORKDIR /app

COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev

COPY server ./server
COPY public ./public

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "server.js"]
