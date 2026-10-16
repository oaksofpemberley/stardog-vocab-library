# Iron Bank image: the built app served by nginx on Red Hat UBI 9 minimal. See ironbank/README.md.
#
# Iron Bank builds offline: the app comes from the checksummed resource in hardening_manifest.yaml
# (vocab-library-dist.tar.gz, made by scripts/build-ironbank-bundle.sh), and nginx from the UBI
# repositories. Same nginx configuration, user and behaviour as the repository's main Dockerfile.
ARG BASE_REGISTRY=registry1.dso.mil/ironbank
ARG BASE_IMAGE=redhat/ubi/ubi9-minimal
ARG BASE_TAG=9.6

FROM ${BASE_REGISTRY}/${BASE_IMAGE}:${BASE_TAG}

COPY nginx.conf /etc/nginx/nginx.conf
COPY stardog-upstream.conf /etc/nginx/stardog-upstream.conf
# Iron Bank forbids ADD, so the resource is copied and unpacked with tar below
# hadolint ignore=DL3010
COPY vocab-library-dist.tar.gz /tmp/

# nginx-core only (no modules), from the nginx:1.26 module stream: the default 1.20 stream lacks
# Red Hat's fixes for several high and critical CVEs. tar is needed just to unpack the app, so it
# is removed again in the same layer, along with the package manager caches.
# Versions come from the UBI repositories at build time:
# hadolint ignore=DL3041
RUN microdnf -y module enable nginx:1.26 \
 && microdnf -y install nginx-core tar gzip \
 && rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*.conf \
 && tar -xzf /tmp/vocab-library-dist.tar.gz -C /usr/share/nginx/html \
 && rm /tmp/vocab-library-dist.tar.gz \
 && chmod -R a+rX /usr/share/nginx/html \
 && microdnf -y remove tar \
 && microdnf clean all \
 && rm -rf /var/cache/yum /var/lib/dnf/history*

USER 65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["/usr/sbin/nginx", "-t", "-q", "-e", "/dev/stderr"]
CMD ["/usr/sbin/nginx", "-e", "/dev/stderr", "-g", "daemon off;"]
