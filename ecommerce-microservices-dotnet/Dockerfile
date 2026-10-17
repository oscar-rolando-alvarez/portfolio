# syntax=docker/dockerfile:1
#
# One parameterised multi-stage image definition for every service:
#   docker build --build-arg PROJECT=src/Services/Catalog/ECommerce.Services.Catalog/ECommerce.Services.Catalog.csproj \
#                --build-arg ASSEMBLY=ECommerce.Services.Catalog -t ecommerce/catalog .

ARG SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0.402-alpine3.24
ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0.13-alpine3.24

FROM ${SDK_IMAGE} AS build
ARG PROJECT
WORKDIR /src

# Build configuration first so restore layers are reused across services.
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/ src/

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages,sharing=locked \
    dotnet restore "${PROJECT}"

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages,sharing=locked \
    dotnet publish "${PROJECT}" -c Release --no-restore -o /app/publish -p:UseAppHost=false

FROM ${RUNTIME_IMAGE} AS final
ARG ASSEMBLY
ENV ASSEMBLY=${ASSEMBLY} \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0

WORKDIR /app
COPY --from=build --chown=app:app /app/publish .

# Non-root user shipped with the official .NET images.
USER $APP_UID
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/alive || exit 1

ENTRYPOINT ["sh", "-c", "exec dotnet \"${ASSEMBLY}.dll\""]
