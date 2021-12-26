FROM node:15.14.0-stretch
WORKDIR /grid
COPY package.json /grid
COPY app.js /grid
COPY apps /grid/apps
COPY src /grid/src
COPY web /grid/web
EXPOSE 8080
RUN npm i
RUN npm install -g @gridspace/app-server
CMD gs-app-server
