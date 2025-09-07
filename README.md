Setup

1) Local (Docker Postgres)
- DATABASE_URL=postgresql://postgres:postgres@localhost:5433/halisaha?schema=public
- docker run --name halisaha-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=halisaha -p 5433:5432 -d postgres:16
- npm i
- npx prisma migrate deploy
- npm run dev

2) Production (Vercel + Neon)
- Vercel envs:
  - DATABASE_URL=postgresql://... (Neon pooled, sslmode=require)
  - NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
  - VAPID_PUBLIC_KEY=...
  - VAPID_PRIVATE_KEY=...
  - VAPID_EMAIL=mailto:you@example.com
- vercel.json includes daily cron /api/cron/cleanup

Web Push
- Generate VAPID keys (one-off):
  - node -e "const webpush=require('web-push');const v=webpush.generateVAPIDKeys();console.log(v)"
- Add keys to envs as above.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
