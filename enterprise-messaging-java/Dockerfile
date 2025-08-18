# Build stage
FROM maven:3.9.5-openjdk-17-slim AS build

WORKDIR /app

# Copy pom.xml and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-jre-slim

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r messaging && useradd -r -g messaging messaging

# Create app directory
WORKDIR /app

# Copy the jar file
COPY --from=build /app/target/*.jar app.jar

# Create uploads directory
RUN mkdir -p /tmp/messaging-uploads && chown messaging:messaging /tmp/messaging-uploads

# Change ownership
RUN chown -R messaging:messaging /app

# Switch to app user
USER messaging

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# Run the application
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]