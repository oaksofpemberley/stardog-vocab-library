#!/usr/bin/env bash
# Security scans for this repository and its container image. See docs/security-scans.md.
#
# Writes raw results to security/results/ and a summary to security/results/SUMMARY.md.
# Exits non-zero if any scan finds something.
#
# Needs: gitleaks, trivy, syft, grype, hadolint, jq, npm and docker (with buildx for the
# platform that isn't native). Run from anywhere: scripts/security-scan.sh
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=security/results
PLATFORMS=(linux/amd64 linux/arm64)
rm -rf "$OUT" && mkdir -p "$OUT"

for tool in gitleaks trivy syft grype hadolint jq npm docker; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 2; }
done

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "warning: uncommitted changes; results won't match a commit exactly" >&2
fi

echo "== secrets in every commit (gitleaks)"
gitleaks git . --redact --no-banner --report-format json --report-path "$OUT/gitleaks.json" --exit-code 0

echo "== source: dependencies, secrets, misconfiguration (trivy fs)"
trivy fs . --quiet --scanners vuln,secret,misconfig --skip-dirs node_modules,dist,security \
  --format json --output "$OUT/trivy-fs.json"

echo "== source: npm audit (all dependencies, including dev)"
npm audit --json > "$OUT/npm-audit.json" || true

echo "== Dockerfile (hadolint)"
hadolint --format json Dockerfile > "$OUT/hadolint.json" || true

for platform in "${PLATFORMS[@]}"; do
  arch=${platform#linux/}
  tag=vocab-library:scan-$arch
  echo "== image $platform: build, SBOM (syft), grype, trivy"
  docker build --quiet --platform "$platform" -t "$tag" . >/dev/null
  syft "$tag" --quiet -o cyclonedx-json="$OUT/sbom-$arch.cdx.json"
  grype "sbom:$OUT/sbom-$arch.cdx.json" --quiet -o json --file "$OUT/grype-$arch.json"
  trivy image "$tag" --quiet --platform "$platform" --scanners vuln,secret \
    --format json --output "$OUT/trivy-image-$arch.json"
done

# Tools record their cache locations; don't publish the scanning machine's home directory
for f in "$OUT"/*.json; do sed -i.bak "s#$HOME#~#g" "$f" && rm "$f.bak"; done

# ---- summary
count_trivy() { jq '[.Results[]? | (.Vulnerabilities // []), (.Secrets // []), ((.Misconfigurations // []) | map(select(.Status == "FAIL")))] | flatten | length' "$1"; }
row() { printf '| %s | %s | %s |\n' "$1" "$2" "$3" >> "$OUT/SUMMARY.md"; }
total=0
add() { total=$((total + $1)); }

{
  echo "# Security scan results"
  echo
  echo "- Commit: \`$(git rev-parse HEAD)\`"
  echo "- Run: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "- Tools: gitleaks $(gitleaks version), trivy $(trivy --version | awk 'NR==1{print $2}'), syft $(syft version | awk '/^Version/{print $2}'), grype $(grype version | awk '/^Version/{print $2}'), hadolint $(hadolint --version | awk '{print $NF}'), npm $(npm --version)"
  echo "- Vulnerability databases are updated by each tool on every run, so a later run can report issues published after this date."
  echo
  echo "| Check | Tool | Findings |"
  echo "|---|---|---|"
} > "$OUT/SUMMARY.md"

n=$(jq length "$OUT/gitleaks.json"); add "$n"; row "Secrets in every commit of the git history" gitleaks "$n"
n=$(count_trivy "$OUT/trivy-fs.json"); add "$n"; row "Source tree: dependency vulnerabilities, secrets, misconfiguration" "trivy fs" "$n"
n=$(jq '.metadata.vulnerabilities.total' "$OUT/npm-audit.json"); add "$n"
row "All npm dependencies ($(jq '.metadata.dependencies.total' "$OUT/npm-audit.json") packages, including dev)" "npm audit" "$n"
n=$(jq length "$OUT/hadolint.json"); add "$n"; row Dockerfile hadolint "$n"
for platform in "${PLATFORMS[@]}"; do
  arch=${platform#linux/}
  comps=$(jq '.components | length' "$OUT/sbom-$arch.cdx.json")
  n=$(jq '.matches | length' "$OUT/grype-$arch.json"); add "$n"
  row "Image $arch (${comps} SBOM components)" "syft + grype" "$n"
  n=$(count_trivy "$OUT/trivy-image-$arch.json"); add "$n"
  row "Image $arch: OS and app packages, secrets" "trivy image" "$n"
done

{
  echo
  echo "Total findings: $total. Raw output for every check is in this folder."
} >> "$OUT/SUMMARY.md"

cat "$OUT/SUMMARY.md"
[ "$total" -eq 0 ]
