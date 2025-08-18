# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution file
COPY DocumentManagement.sln .

# Copy project files
COPY src/DocumentManagement.API/DocumentManagement.API.csproj src/DocumentManagement.API/
COPY src/DocumentManagement.Application/DocumentManagement.Application.csproj src/DocumentManagement.Application/
COPY src/DocumentManagement.Domain/DocumentManagement.Domain.csproj src/DocumentManagement.Domain/
COPY src/DocumentManagement.Infrastructure/DocumentManagement.Infrastructure.csproj src/DocumentManagement.Infrastructure/
COPY src/DocumentManagement.Storage/DocumentManagement.Storage.csproj src/DocumentManagement.Storage/
COPY src/DocumentManagement.Search/DocumentManagement.Search.csproj src/DocumentManagement.Search/
COPY src/DocumentManagement.Workflow/DocumentManagement.Workflow.csproj src/DocumentManagement.Workflow/

# Restore dependencies
RUN dotnet restore

# Copy source code
COPY src/ src/

# Build application
WORKDIR /src/src/DocumentManagement.API
RUN dotnet build -c Release -o /app/build

# Publish Stage
FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install system dependencies for OCR and document processing
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libreoffice \
    imagemagick \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 docmgmt \
    && adduser --system --uid 1001 --gid 1001 docmgmt

# Create necessary directories
RUN mkdir -p /app/storage /app/logs /app/temp \
    && chown -R docmgmt:docmgmt /app

# Copy published application
COPY --from=publish /app/publish .
RUN chown -R docmgmt:docmgmt /app

# Switch to non-root user
USER docmgmt

# Expose port
EXPOSE 80

# Configure environment
ENV ASPNETCORE_URLS=http://+:80
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start application
ENTRYPOINT ["dotnet", "DocumentManagement.API.dll"]