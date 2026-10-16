# Vocabulary Governance Library: Iron Bank packaging

This folder is laid out like an [Iron Bank](https://repo1.dso.mil/dsop) image repository: `Dockerfile`, `hardening_manifest.yaml`, `LICENSE` and this README. It packages the same app as the repository's main `Dockerfile`, on an Iron Bank base.

## What the image is

- **Base:** Red Hat UBI 9 minimal (`redhat/ubi/ubi9-minimal` on registry1.dso.mil).
- **Web server:** `nginx-core` 1.26 from the UBI repositories (the `nginx:1.26` module stream; the default 1.20 stream lacks fixes for several high and critical CVEs). No other packages are added; `tar`, used to unpack the app, is removed in the same layer.
- **App:** static files only (HTML, JavaScript, CSS), from the `vocab-library-dist.tar.gz` resource. nginx serves them and forwards `/stardog/` to Stardog. Configuration: `nginx.conf` and `stardog-upstream.conf`, identical to `deploy/` in the main repository.
- **Runtime:** user 65532 (non-root), port 8080, writes only to `/tmp`, so the root filesystem can be read-only. `GET /healthz` is the liveness probe. No credentials are built in: each person signs in with their own Stardog account.

## Build offline, as Iron Bank does

Iron Bank builds without network access to package registries, so the app is built beforehand and added as a checksummed resource:

```bash
scripts/build-ironbank-bundle.sh      # from the repository root
# → ironbank/vocab-library-dist.tar.gz and its sha256
```

The tarball is reproducible (fixed file order, owner and timestamps), so anyone can rebuild it from the same commit and get the same sha256. For a release, publish the tarball, then put its URL and sha256 in `hardening_manifest.yaml` (the `set-at-release` values), together with the image version and a maintainer email.

## Try it without registry1 access

The same base is published as `registry.access.redhat.com/ubi9/ubi-minimal`:

```bash
scripts/build-ironbank-bundle.sh
docker build --build-arg BASE_REGISTRY=registry.access.redhat.com --build-arg BASE_IMAGE=ubi9/ubi-minimal \
  --build-arg BASE_TAG=latest -t vocab-library:ironbank ironbank/
docker run -d -p 8080:8080 --read-only --tmpfs /tmp --cap-drop ALL \
  --add-host stardog:<stardog host IP> vocab-library:ironbank
```

## Scan it

```bash
syft vocab-library:ironbank -o cyclonedx-json=sbom.cdx.json && grype sbom:sbom.cdx.json
trivy image vocab-library:ironbank
```

UBI images carry published CVEs that Red Hat has not fixed yet ("not-fixed" or "won't fix"); Iron Bank reviews these with written justifications. On 2026-10-16 the image built from the public UBI 9 minimal base had no finding with a fix available. Of grype's findings, 180 were in the base image itself and 18 (low and medium) in nginx 1.26. Run the scan again before deploying: new CVEs are published every day.

## Status

Built and tested locally on the public UBI 9 minimal image (container healthy, app, sign-in and queries through `/stardog/` work, read-only root filesystem, all capabilities dropped). It has **not** been built in the Iron Bank pipeline or submitted: that needs a sponsoring program, the release values in `hardening_manifest.yaml`, and justifications for the base image's open CVEs.
