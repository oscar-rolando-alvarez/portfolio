# syntax=docker/dockerfile:1
ARG SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0.402-alpine3.24
ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0.13-alpine3.24

FROM ${SDK_IMAGE} AS build
WORKDIR /src

COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/DocumentManagement.Domain/DocumentManagement.Domain.csproj src/DocumentManagement.Domain/
COPY src/DocumentManagement.Application/DocumentManagement.Application.csproj src/DocumentManagement.Application/
COPY src/DocumentManagement.Infrastructure/DocumentManagement.Infrastructure.csproj src/DocumentManagement.Infrastructure/
COPY src/DocumentManagement.Api/DocumentManagement.Api.csproj src/DocumentManagement.Api/
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages,sharing=locked \
    dotnet restore src/DocumentManagement.Api/DocumentManagement.Api.csproj

COPY src/ src/
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages,sharing=locked \
    dotnet publish src/DocumentManagement.Api/DocumentManagement.Api.csproj -c Release --no-restore -o /app/publish -p:UseAppHost=false

FROM ${RUNTIME_IMAGE} AS final
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Storage__RootPath=/data/storage

WORKDIR /app
RUN mkdir -p /data/storage && chown -R app:app /data
COPY --from=build --chown=app:app /app/publish .

# Non-root user shipped with the official .NET images.
USER $APP_UID
EXPOSE 8080
VOLUME ["/data/storage"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/alive || exit 1

ENTRYPOINT ["dotnet", "DocumentManagement.Api.dll"]
