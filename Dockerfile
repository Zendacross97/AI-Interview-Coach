# 1. Base Image
FROM node:22-alpine

# 2. Working Directory
WORKDIR /usr/src/app

# 3. Copy Dependency Manifests
COPY package*.json ./

# 4. Install Dependencies
RUN npm install

# 5. Copy Source Code
COPY . .

# 6. Expose Port
EXPOSE 3000

# 7. Start Command
CMD ["npm", "start"]