# Contributing to ProtectedText API

Thank you for your interest in contributing! 🎉

## Getting started

1. **Fork** the repository and clone your fork locally.
2. Make sure you have **Node.js ≥ 20** installed (no `npm install` needed — zero dependencies).
3. For the Python export tool, use **Python ≥ 3.10**.

## Running locally

```bash
npm start       # start the API server on http://127.0.0.1:3000
npm test        # run the test suite
npm run dev     # start with --watch for auto-reload
```

## Workflow

1. Check [open issues](https://github.com/laikhtman/ProtectedText_API/issues) or open a new one to discuss your idea.
2. Create a feature branch off `master`:  
   `git checkout -b feature/my-feature`
3. Make your changes. Keep commits focused and descriptive.
4. Ensure all tests still pass: `npm test`
5. Push your branch and open a Pull Request against `master`.

## Guidelines

- **Keep it dependency-free** for the API server. Any new Node.js code should use only built-ins.
- **Write tests** for new behaviour in the `test/` directory using Node's built-in test runner.
- **Document changes** — update `README.md` and the relevant file in `docs/` if your change affects the public interface or security model.
- **Security issues** — please do not file a public issue for security vulnerabilities. Email the maintainer directly instead.

## Code style

- ES modules (`import`/`export`), Node.js 20+ syntax.
- `camelCase` for variables and functions.
- No trailing whitespace; single blank line at end of file.

## Questions?

Open a [GitHub Discussion](https://github.com/laikhtman/ProtectedText_API/discussions) or file an [issue](https://github.com/laikhtman/ProtectedText_API/issues).
