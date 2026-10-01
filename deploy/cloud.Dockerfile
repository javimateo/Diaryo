# The cloud server (cloud.diaryo.javiermateo.dev): PocketBase with diaryo's schema and
# rules from this repository (cloud/), applied when it starts. The data lives in
# /pb/pb_data, which must be a persistent volume.
FROM alpine:3.20
ARG PB_VERSION=0.40.4
RUN apk add --no-cache ca-certificates unzip
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb && rm /tmp/pb.zip
COPY cloud/pb_migrations /pb/pb_migrations
COPY cloud/pb_hooks /pb/pb_hooks
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
