# SpreddPay Landing Page

Production-ready Next.js landing page prepared for GitHub and Railway.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Railway

1. Create a GitHub repository and upload this project.
2. In Railway, choose **New Project → Deploy from GitHub repo**.
3. Select the repository.
4. Optionally add:

```env
NEXT_PUBLIC_CONTACT_EMAIL=hello@spreddpay.com
```

5. Generate a Railway domain or connect a custom domain.

The start command automatically uses Railway's `$PORT`.

## Customize

- Content: `app/page.tsx`
- Styling: `app/globals.css`
- SEO metadata: `app/layout.tsx`

The page intentionally avoids claiming SpreddPay is a bank or that live card issuance is already available.
