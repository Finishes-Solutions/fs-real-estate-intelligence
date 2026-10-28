# The BIM worker (worker/bim/server.mjs): BIMCraft's command line built at a pinned commit, and the app's lib/.
# Build from the repository root: docker build -f worker/bim/Dockerfile -t bim-worker .
# Run: docker run -p 8080:8080 -e BIM_WORKER_TOKEN=… bim-worker
FROM rust:1.97-bookworm AS bimcraft
# BIMCraft 0.8.0 (github.com/IPedrax/BIMCraft, MIT OR Apache-2.0). Built without the Revit reader, which keeps the licence
# MIT OR Apache-2.0; bump the commit only after test/bim-cli.mjs passes on it.
ARG BIMCRAFT_COMMIT=b36160b5bae0fcb9a2978ec07d655cc64b500956
RUN git clone https://github.com/IPedrax/BIMCraft /src && cd /src && git checkout "$BIMCRAFT_COMMIT" \
 && cargo build --release -p bimcraft-cli --no-default-features && cp target/release/bimcraft-cli /bimcraft-cli

FROM node:22-bookworm-slim
COPY --from=bimcraft /bimcraft-cli /usr/local/bin/bimcraft-cli
WORKDIR /app
COPY package.json ./
COPY lib/ lib/
COPY worker/bim/ worker/bim/
ENV BIMCRAFT_CLI=/usr/local/bin/bimcraft-cli PORT=8080 NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "worker/bim/server.mjs"]
