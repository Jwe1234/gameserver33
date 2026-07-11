FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    gradle \
    android-sdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN node --version
RUN java --version
RUN gradle --version

EXPOSE 3000

CMD ["npm", "start"]