FROM node:22-slim

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
