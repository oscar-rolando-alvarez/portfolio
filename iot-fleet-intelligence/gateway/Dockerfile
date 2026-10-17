# syntax=docker/dockerfile:1.7

# ---- build ---------------------------------------------------------------
FROM golang:1.27.2-alpine3.24@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-trimpath
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -o /out/fleetgw ./cmd/fleetgw

# ---- runtime -------------------------------------------------------------
# Distroless static: no shell, no package manager, runs as UID 65532.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:e2e927ec666bae08560abb3c55d0659eceabb657f56b6782ab500a9fc7f555e3
LABEL org.opencontainers.image.title="iot-fleet-intelligence-gateway" \
      org.opencontainers.image.source="https://github.com/oscar-rolando-alvarez/portfolio" \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /out/fleetgw /usr/local/bin/fleetgw
USER 65532:65532
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD ["/usr/local/bin/fleetgw", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/fleetgw"]
