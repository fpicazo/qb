FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Copy validation files
COPY .well-known .well-known

EXPOSE 80

CMD ["node", "server.js"]