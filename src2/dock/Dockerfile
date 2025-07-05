FROM node:18-slim
WORKDIR /grid
COPY package.json /grid
COPY app.js /grid
COPY apps /grid/apps
COPY src /grid/src
COPY web /grid/web
COPY bin /grid/bin
RUN apt-get -y update; apt-get -y install curl
EXPOSE 8080
RUN npm i
RUN npm install -g @gridspace/app-server
RUN rm -rf /grid/bin
CMD gs-app-server
