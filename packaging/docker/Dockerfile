FROM debian:bookworm-slim
ARG VERSION
ARG REVISION
LABEL org.opencontainers.image.title="Open Calc Studio" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source="https://github.com/OpenAEC-Foundation/open-calc-studio" \
      org.opencontainers.image.licenses="LGPL-3.0-only"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dbus-x11 xvfb x11vnc openbox wmctrl novnc python3-websockify \
    python3 curl nodejs libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2 \
    fonts-dejavu-core tini x11-utils imagemagick libgl1-mesa-dri libegl-mesa0 libglx-mesa0 \
    && rm -rf /var/lib/apt/lists/*
# The context contains the exact DEB produced by the installer job, never source.
COPY app.deb /tmp/app.deb
RUN dpkg-deb -x /tmp/app.deb / && rm /tmp/app.deb \
    && useradd --uid 1000 --create-home --home-dir /config/home calc \
    && mkdir -p /openaec /config/data /config/cache /config/config /run/ocs \
    && chown -R calc:calc /openaec /config /run/ocs
COPY runtime /opt/ocs-container
COPY licenses /opt/ocs-container/licenses
ENV DISPLAY=:99 HOME=/config/home XDG_DATA_HOME=/config/data \
    XDG_CONFIG_HOME=/config/config XDG_CACHE_HOME=/config/cache \
    OCS_CONTAINER=1 OCS_MCP_TRANSPORT=http OCS_MCP_HOST=0.0.0.0 OCS_MCP_PORT=9743 \
    WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
USER calc
WORKDIR /openaec
EXPOSE 3000 9743
VOLUME ["/openaec", "/config"]
HEALTHCHECK --interval=15s --timeout=4s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/gezond || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/opt/ocs-container/start.py"]
