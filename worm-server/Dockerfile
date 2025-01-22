# Stage 1: Build the Angular frontend
FROM node:18 AS build-frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build --prod

# Stage 2: Build the NestJS backend
FROM node:18 AS build-backend
WORKDIR /app/worm-server
COPY worm-server/package.json worm-server/package-lock.json ./
RUN npm install
COPY worm-server/ ./
RUN npm run build

# Stage 3: Create the final image
FROM node:18-alpine
WORKDIR /app
COPY --from=build-backend /app/worm-server/dist ./worm-server/dist
COPY --from=build-frontend /app/frontend/dist ./frontend/dist
COPY worm-server/package.json worm-server/package-lock.json ./
RUN npm install --only=production

EXPOSE 8333
CMD ["node", "worm-server/dist/main.js"]
