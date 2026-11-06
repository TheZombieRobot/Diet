# Build from the repo root:  docker build -f server/Dockerfile -t moshpoint-server .
FROM gradle:8.11.1-jdk17 AS build
WORKDIR /src
COPY . .
# Only the server is needed; skip the Android app (no SDK in this image).
RUN printf 'pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { mavenCentral() } }\nrootProject.name = "moshpoint"\ninclude(":server")\n' > settings.gradle.kts \
 && printf 'plugins { alias(libs.plugins.kotlin.jvm) apply false }\n' > build.gradle.kts \
 && gradle :server:installDist --no-daemon

FROM eclipse-temurin:17-jre
COPY --from=build /src/server/build/install/server /app
ENV PORT=8080
EXPOSE 8080
CMD ["/app/bin/server"]
