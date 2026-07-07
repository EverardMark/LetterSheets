# syntax=docker/dockerfile:1

# ---- build stage ----
FROM golang:1.24-alpine AS build
WORKDIR /src

# Cache module downloads separately from source for faster rebuilds.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static, stripped binary — no libc dependency, so it runs on distroless/scratch.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/lettersheets ./cmd/server

# ---- runtime stage ----
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/lettersheets /app/lettersheets

# Configuration is supplied via LS_* environment variables (no config.json needed).
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/lettersheets"]
