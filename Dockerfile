FROM node:20-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY package.json ./
COPY public ./public
COPY src ./src
COPY server.js ./server.js

EXPOSE 3000

USER node

CMD ["node", "server.js"]
