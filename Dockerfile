# Stage 1: Build the frontend
FROM oven/bun:1 AS builder
WORKDIR /app

# Accept build arguments
ARG GITHUB_TOKEN
ARG PUBLIC_BACKEND_URL
ARG PUBLIC_ACCOUNT_FRONTEND_URL

# Make the public variable available to Vite/SvelteKit during build
ENV PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL}
ENV PUBLIC_ACCOUNT_FRONTEND_URL=${PUBLIC_ACCOUNT_FRONTEND_URL}

# Configure npm/Bun to authenticate with GitHub Packages
RUN echo "@davidnet-net:registry=https://npm.pkg.github.com" >> ~/.npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> ~/.npmrc

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Remove token from image layer
RUN rm -f ~/.npmrc

COPY . .
RUN bun run build

# Stage 2: Serve the application
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "run", "build/index.js"]