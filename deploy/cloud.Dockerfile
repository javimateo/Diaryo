# The cloud server (cloud.diaryo.javiermateo.dev): PocketBase with diaryo's schema and
# rules from this repository (cloud/), applied when it starts. The data lives in
# /pb/pb_data, which must be a persistent volume.
FROM alpine:3.20
ARG PB_VERSION=0.40.4
# The release's checksum (its checksums.txt): a download that isn't that one stops the
# build. It changes with the version, here and in .github/workflows/ci.yml.
ARG PB_SHA256=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa
RUN apk add --no-cache ca-certificates unzip
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - && unzip /tmp/pb.zip -d /pb && rm /tmp/pb.zip
COPY cloud/pb_migrations /pb/pb_migrations
COPY cloud/pb_hooks /pb/pb_hooks
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
