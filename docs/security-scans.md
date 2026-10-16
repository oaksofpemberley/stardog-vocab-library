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
- **Iron Bank.** The image uses Chainguard bases pinned by digest. The bases are build arguments, so you can rebuild on approved Iron Bank images (see "Production image" in the [README](../README.md)) and scan that build with the same script. This repository has no `hardening_manifest.yaml`, so it is not packaged for an Iron Bank submission.
- **Dynamic testing.** No penetration test or DAST scan has been run. The README's "Security notes" section describes the controls in the code (SPARQL value escaping, the dev proxy's same-origin check, the image's Content-Security-Policy and non-root, read-only filesystem).
