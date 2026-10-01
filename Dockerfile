# Railway deploy for the Umuburo AI web app (Next.js in web/).
# Railway picks this up automatically from the repo root; it sets PORT at runtime.
FROM node:22-slim AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
