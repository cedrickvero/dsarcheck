FROM node:22-alpine

WORKDIR /app

# Dependencies first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=development
EXPOSE 3000

# Compose overrides this per service (npm run dev / dev:worker / db:migrate).
CMD ["npm", "run", "dev"]
