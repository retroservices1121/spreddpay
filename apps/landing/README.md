# Spredd Pay Landing Page

Dependency-free production landing page for Spredd Pay.

## Why this deployment is safe

Only Node.js built-in modules are used. There are no npm dependencies to install and no frontend
framework packages for Railway's vulnerability scanner to reject. `public/index.html` is fully
self-contained: markup, styles, scripts, fonts, and the logo mark are all inlined in that one file.

## Run locally

```bash
npm start
```

The server listens on `PORT` when Railway provides it and defaults to port `3000` locally.

## Deploy from GitHub to Railway

1. Push all files and folders in this repository to GitHub.
2. Connect the GitHub repository to Railway.
3. Railway detects the `npm start` script automatically.
4. Generate a Railway domain under **Settings → Networking**.

No build command or environment variable is required.

## Files

- `server.js` — dependency-free Node web server
- `package.json` — start script only, no dependencies
- `public/index.html` — the entire landing page, self-contained

## Contact email

The partner form and footer link point at `hello@spreddpay.com`. Search and replace that address
inside `public/index.html` when a different one is required.

## Partner form

Submitting the overlay form opens the visitor's mail client with a prefilled message. There is no
server-side handler, so no inbound data touches this deployment.

## Product disclaimer

The site states that Spredd Pay is a technology platform and that card and financial services remain
subject to infrastructure partner approval, eligibility, and applicable terms.
