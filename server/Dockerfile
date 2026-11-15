# The Moshpoint relay server. Build from the repo root:
#   docker build -f server/Dockerfile -t moshpoint-server .
#   docker run -p 8080:8080 -v moshpoint-data:/data moshpoint-server
# Deploying it for real: docs/SERVER_PRODUCTION.md.
FROM gradle:8.11.1-jdk17 AS build
WORKDIR /src
# Only what the server needs (the Android app needs an SDK this image doesn't have).
COPY gradle/libs.versions.toml gradle/libs.versions.toml
COPY server server
RUN printf 'pluginManagement { repositories { maven("https://maven-central.storage-download.googleapis.com/maven2/"); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { maven("https://maven-central.storage-download.googleapis.com/maven2/"); mavenCentral() } }\nrootProject.name = "moshpoint"\ninclude(":server")\n' > settings.gradle.kts \
 && printf 'plugins { alias(libs.plugins.kotlin.jvm) apply false }\n' > build.gradle.kts \
 && gradle :server:installDist --no-daemon -x test

FROM eclipse-temurin:17-jre
# The relay runs as an ordinary user (uid 10001). The entrypoint starts as root only to hand the
# volume to that user (Fly mounts volumes owned by root), then drops to it before Java starts.
RUN groupadd --system --gid 10001 relay \
 && useradd --system --uid 10001 --gid relay --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin relay \
 && mkdir -p /data && chown relay:relay /data
COPY --from=build /src/server/build/install/server /app
COPY server/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 755 /app/docker-entrypoint.sh
# Heap and other JVM settings: applicationDefaultJvmArgs in server/build.gradle.kts (60% of the
# Machine's memory); JAVA_OPTS adds to or overrides them.
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/bin/server"]
