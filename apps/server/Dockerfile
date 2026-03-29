FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm install

COPY . .

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 8080

CMD ["npm", "run", "start"]

