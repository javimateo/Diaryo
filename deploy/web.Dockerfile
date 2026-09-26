# The website (diaryo.javiermateo.dev). Built from the repository root: its live demo
# uses the app's code, so both dependency sets are installed.
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci
COPY . .
# Its address and the web app's (the site links to it). Coolify can override them.
ARG SITE_URL=https://diaryo.javiermateo.dev
ARG APP_URL=https://app.diaryo.javiermateo.dev
# Umami (visits without cookies): its script and the site's id. Empty: nothing is counted.
ARG UMAMI_SRC=
ARG UMAMI_ID=
ENV SITE_URL=$SITE_URL APP_URL=$APP_URL UMAMI_SRC=$UMAMI_SRC UMAMI_ID=$UMAMI_ID
RUN npm --prefix web run build

FROM nginx:1.27-alpine
COPY deploy/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 80
