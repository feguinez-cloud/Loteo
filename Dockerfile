FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY "Plano de Subdivision.pdf" ./
COPY public ./public
COPY src/data ./src/data
ENV NODE_ENV=production
ENV PORT=3050
EXPOSE 3050
CMD ["node", "server.js"]
