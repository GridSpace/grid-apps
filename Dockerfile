FROM node:15.14.0-stretch
WORKDIR /app
COPY ./ /app/
EXPOSE 8080
RUN npm i
RUN npm install -g @gridspace/app-server
CMD gs-app-server --debug