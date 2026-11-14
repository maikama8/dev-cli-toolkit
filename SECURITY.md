# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

Report a vulnerability through [GitHub private vulnerability reporting](https://github.com/maikama8/dev-cli-toolkit/security/advisories/new).

Include the version (`zt --version`), the command you ran, and what you expected. Please do not open a public issue for a security report.

`zt jwt decode` does not verify signatures. That is the command's documented behavior.

`zt port kill` and `zt git cleanup` change the local machine. They ask for confirmation unless you pass `--yes`.
