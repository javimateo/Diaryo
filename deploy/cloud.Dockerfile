# The cloud server (cloud.diaryo.javiermateo.dev): PocketBase with diaryo's schema and
# rules from this repository (cloud/), applied when it starts. The data lives in
# /pb/pb_data, which must be a persistent volume.
FROM alpine:3.24
ARG PB_VERSION=0.40.6
# The release's checksum (its checksums.txt): a download that isn't that one stops the
# build.
ARG PB_SHA256=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
RUN apk add --no-cache ca-certificates unzip su-exec && adduser -D -H -s /sbin/nologin pocketbase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - && unzip /tmp/pb.zip -d /pb && rm /tmp/pb.zip
COPY cloud/pb_migrations /pb/pb_migrations
COPY cloud/pb_hooks /pb/pb_hooks
EXPOSE 8090
# PocketBase runs as its own user, not as root. The volume may be new or come from the
# images that ran as root (up to 1.0.0): at every start it is made that user's (only root
# can), and root steps aside. The schema only changes through the migrations here
# (--automigrate=false: changes in the dashboard don't write migration files).
CMD ["/bin/sh", "-c", "mkdir -p /pb/pb_data && chown -R pocketbase:pocketbase /pb/pb_data && exec su-exec pocketbase /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --automigrate=false --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks"]
