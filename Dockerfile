FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Create dirs for uploads
RUN mkdir -p data uploads/thumbs uploads/avatars
EXPOSE 3000
CMD ["node", "server.js"]
