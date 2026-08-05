# SpreddPay Landing Page

Dependency-free production landing page for SpreddPay.

## Why this deployment is safer

This project uses only Node.js built-in modules. There are no npm dependencies to install and no frontend framework packages for Railway's vulnerability scanner to reject.

## Run locally

```bash
npm start
```

The server listens on `PORT` when Railway provides it and defaults to port `3000` locally.

## Deploy from GitHub to Railway

1. Upload all files and folders in this repository to GitHub.
2. Connect the GitHub repository to Railway.
3. Railway detects the `npm start` script automatically.
4. Generate a Railway domain under **Settings → Networking**.

No build command or environment variable is required.

## Files

- `server.js` — dependency-free Node web server
- `public/index.html` — landing page
- `public/styles.css` — responsive design
- `public/app.js` — lightweight interactions
- `public/logo.svg` — favicon and logo mark

## Contact email

Search and replace `hello@spreddpay.com` inside `public/index.html` when a different address is required.

## Product disclaimer

The current site deliberately states that SpreddPay is a technology platform and that financial services remain subject to infrastructure partner approval.
