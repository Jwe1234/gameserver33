FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    wget \
    unzip \
    android-sdk \
    && rm -rf /var/lib/apt/lists/*

ENV GRADLE_VERSION=8.5

RUN wget https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip \
    && unzip gradle-${GRADLE_VERSION}-bin.zip -d /opt \
    && rm gradle-${GRADLE_VERSION}-bin.zip

ENV PATH="/opt/gradle-${GRADLE_VERSION}/bin:${PATH}"

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm","start"]