FROM node:22-slim
WORKDIR /grid
COPY package.json /grid
COPY app.js /grid
COPY apps /grid/apps
COPY src /grid/src
COPY web /grid/web
COPY bin /grid/bin
RUN apt-get -y update; apt-get -y install curl git
EXPOSE 8080
RUN npm i
RUN npm run webpack-ext
RUN npm install -g @gridspace/app-server
RUN npm run pack-prod
RUN rm -rf /grid/bin
CMD gs-app-server

