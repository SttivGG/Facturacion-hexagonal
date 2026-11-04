# syntax=docker/dockerfile:1
FROM maven:3.10.0-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn --batch-mode --no-transfer-progress clean verify

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

RUN addgroup -S app && adduser -S -G app app
COPY --from=build --chown=app:app /workspace/target/*.jar /app/app.jar

ENV SERVER_ADDRESS=0.0.0.0 \
    SERVER_PORT=8080 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70.0"

USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -q -T 4 -O /dev/null http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
