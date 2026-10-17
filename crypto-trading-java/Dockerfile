# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM eclipse-temurin:21.0.12.1_1-jdk-noble AS build
WORKDIR /workspace

# Resolve dependencies first so they are cached independently of source changes
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline

COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q package -DskipTests \
    && java -Djarmode=tools -jar target/crypto-trading-platform-*.jar extract --layers --launcher --destination target/extracted

# ---- Runtime stage ----
FROM eclipse-temurin:21.0.12.1_1-jre-alpine-3.24
WORKDIR /app

RUN addgroup -S app && adduser -S -G app -u 10001 app

# Copy Spring Boot layers from least to most frequently changing
COPY --from=build --chown=app:app /workspace/target/extracted/dependencies/ ./
COPY --from=build --chown=app:app /workspace/target/extracted/spring-boot-loader/ ./
COPY --from=build --chown=app:app /workspace/target/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=app:app /workspace/target/extracted/application/ ./

USER 10001
EXPOSE 8080

ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError" \
    LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
