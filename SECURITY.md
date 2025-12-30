# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **Email**: Open a private security advisory on GitHub
2. **GitHub**: Use the "Security" tab → "Report a vulnerability"

**Please do NOT open a public issue for security vulnerabilities.**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix release**: As soon as possible, typically within 14 days

## Security Best Practices

This library:
- Has **zero dependencies** (reduced supply chain risk)
- Uses **npm provenance** for verified builds
- Runs **CI on every PR** with multiple Node.js versions
- Never executes input as code (pure string processing)
