# Security scan results

- Commit: `77629a3e7aee51d935fa67a389f72d8cadc339f9`
- Run: 2026-10-16T21:40Z
- Tools: gitleaks 8.30.1, trivy 0.75.0, syft 1.54.1, grype 0.120.1, hadolint 2.15.1, npm 10.9.2
- Vulnerability databases are updated by each tool on every run, so a later run can report issues published after this date.

| Check | Tool | Findings |
|---|---|---|
| Secrets in every commit of the git history | gitleaks | 0 |
| Source tree: dependency vulnerabilities, secrets, misconfiguration | trivy fs | 0 |
| All npm dependencies (262 packages, including dev) | npm audit | 0 |
| Dockerfile | hadolint | 0 |
| Image amd64 (132 SBOM components) | syft + grype | 0 |
| Image amd64: OS and app packages, secrets | trivy image | 0 |
| Image arm64 (132 SBOM components) | syft + grype | 0 |
| Image arm64: OS and app packages, secrets | trivy image | 0 |

Total findings: 0. Raw output for every check is in this folder.
