FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "dev", "--workspace", "@prop-hide-seek/server"]
