FROM node:lts

# Setup
ARG ENVIRONMENT=production
ENV NODE_ENV=$ENVIRONMENT

# Set working directory
WORKDIR /app/server

# Copy files specified in .dockerignore
COPY ./ ./

# Build
RUN npm install || exit 1

# Run
CMD npm start
