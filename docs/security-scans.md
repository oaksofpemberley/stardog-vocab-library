# Security scans

This page is for anyone who has to approve this app before deploying it. It lists what is scanned, the latest results, and how to run the same scans yourself rather than trusting ours.

Much of this code was written with an AI coding assistant. Treat it like any third-party code: read it, run the scans below and the test suite (`npm test`), and decide for yourself.

## Latest results

[`security/results/SUMMARY.md`](../security/results/SUMMARY.md) has the commit scanned, the date, the tool versions and the number of findings per check. The raw output of every tool is in the same folder:

| File | Contents |
|---|---|
| `gitleaks.json` | Secrets found in any commit of the git history |
| `trivy-fs.json` | Source tree: known vulnerabilities in `package-lock.json`, secrets, Dockerfile misconfiguration |
| `npm-audit.json` | npm's advisory check over every dependency, including dev-only ones |
| `hadolint.json` | Dockerfile lint |
| `sbom-<arch>.cdx.json` | CycloneDX software bill of materials for the container image (amd64 and arm64) |
| `grype-<arch>.json` | Known vulnerabilities in that SBOM |
| `trivy-image-<arch>.json` | Known vulnerabilities and secrets in the image, scanned directly |

New vulnerabilities are published every day, so these results are a record of one date, not a guarantee. Run the scans again before you deploy.

## Run the scans yourself

Install the tools (versions used for the latest results are in `SUMMARY.md`):

```bash
brew install gitleaks trivy syft grype hadolint jq   # or each project's release binaries
```

You also need Node.js (22 was used) with npm, and Docker with buildx (to build the image for both amd64 and arm64).

Then, from a fresh clone:

```bash
npm ci
scripts/security-scan.sh
```

The script rebuilds the image from the Dockerfile for each platform, runs every check, rewrites `security/results/`, prints the summary, and exits non-zero if anything was found. Read [`scripts/security-scan.sh`](../scripts/security-scan.sh) to see the exact commands, or run them one at a time:

```bash
gitleaks git . --redact                                  # every commit
trivy fs . --scanners vuln,secret,misconfig --skip-dirs node_modules,dist
npm audit
hadolint Dockerfile
docker build --platform linux/amd64 -t vocab-library:scan-amd64 .
syft vocab-library:scan-amd64 -o cyclonedx-json=sbom.cdx.json
grype sbom:sbom.cdx.json
trivy image vocab-library:scan-amd64
```

## What the scans don't cover

- **Your Stardog server.** The app is a browser front end. Data, accounts and permissions live in Stardog, which you scan and harden separately.
- **Iron Bank.** See the next section.
- **Dynamic testing.** No penetration test or DAST scan has been run. The README's "Security notes" section describes the controls in the code (SPARQL value escaping, the dev proxy's same-origin check, the image's Content-Security-Policy and non-root, read-only filesystem).

## Iron Bank

[Iron Bank](https://repo1.dso.mil/dsop) is the DoD's repository of hardened container images. Its pipeline builds each image from an approved base and scans it with Anchore, Twistlock (Prisma Cloud) and OpenSCAP before it is accepted.

| Iron Bank step | Here | Status |
|---|---|---|
| Vulnerability scan (Anchore) | grype, Anchore's open-source scanner, on the image's SBOM, plus trivy | Run by `scripts/security-scan.sh`; 0 findings in the latest results |
| Vulnerability scan (Twistlock / Prisma Cloud) | Not reproducible without a Prisma Cloud licence; trivy covers the same kind of check (OS and application packages) | Not run |
| Compliance scan (OpenSCAP) | Applies to a Red Hat UBI base | Not run: the image uses Chainguard bases |
| Approved base image | The bases are build arguments (`BUILD_REGISTRY`/`BUILD_IMAGE`/`BUILD_TAG`, `BASE_REGISTRY`/`BASE_IMAGE`/`BASE_TAG`), so the image can be rebuilt on approved Iron Bank images | Not done: the default bases are Chainguard images pinned by digest |
| `hardening_manifest.yaml` (sources, digests, maintainers) | Not in this repository | Missing |
| `LICENSE` file at the root | The README states the license, but there is no `LICENSE` file | Missing |

To check a rebuild on Iron Bank bases yourself, build with the base arguments set (see "Production image" in the [README](../README.md)), then run the same scans on that image:

```bash
docker build --build-arg BASE_REGISTRY=registry1.dso.mil/ironbank --build-arg BASE_IMAGE=<approved image> \
  --build-arg BASE_TAG=<tag> -t vocab-library:ironbank .
syft vocab-library:ironbank -o cyclonedx-json=sbom.cdx.json && grype sbom:sbom.cdx.json
trivy image vocab-library:ironbank
```

An Iron Bank submission would also need the two missing files above and a build on an approved base. Those have not been done.
