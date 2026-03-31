FROM node:20-alpine

# Prisma requires openssl
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/

EXPOSE 3002

CMD ["node", "src/index.js"]
