<div align="center">

# ⚡ Sparq — Server

### *The REST API behind the Sparq electronics store.*

**Express 5 + MongoDB backend for catalog, cart, orders, payments, loyalty points, warranties, reviews and store settings.**

[![Server Repo](https://img.shields.io/badge/Server-Repository-2ea44f?style=for-the-badge)](https://github.com/demoprojectbdsoft/Sparq-Server)
[![Client Repo](https://img.shields.io/badge/Client-Repository-blue?style=for-the-badge)](https://github.com/demoprojectbdsoft/Sparq-Electronics-Store)

</div>

---

## 📑 Table of Contents

1. [Overview](#-overview)
2. [Architecture](#️-architecture)
3. [API Reference](#-api-reference)
4. [Business Rules](#-business-rules)
   - [Order lifecycle](#order-lifecycle)
   - [Loyalty points & membership](#loyalty-points--membership)
   - [Payments & transactions](#payments--transactions)
   - [Warranty coverage & claims](#warranty-coverage--claims)
   - [Reviews & ratings](#reviews--ratings)
   - [Catalog & cart](#catalog--cart)
   - [Store settings](#store-settings)
5. [Security](#-security)
6. [Demo Admin Mode](#-demo-admin-mode)
7. [Tech Stack](#-tech-stack)
8. [Setup](#-setup)
9. [Project Status](#-project-status)
10. [Roadmap](#️-roadmap)
11. [About This Project](#ℹ️-about-this-project)

---

## 📖 Overview

Sparq-Server is the backend of the [Sparq](https://github.com/demoprojectbdsoft/Sparq-Electronics-Store) electronics e-commerce platform. It owns every piece of business data — catalog, cart, wishlist, orders, payments, loyalty points, warranties, reviews and store-wide settings.

**What this server owns**

| Responsibility | Detail |
|---|---|
| **Data & business rules** | All prices, discounts, shipping fees, points and totals are computed here, never accepted from the client. |
| **Authorization** | Every private endpoint verifies the caller and decides what they may read or change. |
| **Integrity** | Order placement, cancellation and delivery run in a database transaction, so stock, money and points can never partially apply. |
| **Scheduled jobs** | One daily job restores demo-admin edits and expires lapsed warranties. |

**What this server does not own**

Authentication itself. Sign-up, sign-in, Google login, sessions and JWTs belong to the Next.js frontend (better-auth). This server only **verifies** the token on each request against the frontend's JWKS endpoint — no shared secret and no duplicated user table.

---

## 🏗️ Architecture

Every module follows the same five layers, so a new feature is always added the same way.

```
HTTP request
   │
   ├─ route.ts        maps URL → controller, attaches requireAuth / requireRole
   ├─ validator.ts    Zod schema — rejects a bad payload before any logic runs
   ├─ controller.ts   reads the request, calls a service, replies through apiResponse
   ├─ service.ts      business rules + database access
   └─ model.ts        Mongoose schema
```

```
src/
├── app.ts                     express app: middleware, route mounting, error handling
├── index.ts                   server bootstrap + daily cron jobs
├── config/
│   ├── db.ts                  MongoDB connection
│   └── env.ts                 environment variables (fails fast when one is missing)
├── middlewares/
│   ├── auth.middleware.ts     requireAuth — JWT (JWKS) with a session-token fallback
│   ├── role.middleware.ts     requireRole("admin") — role gate
│   ├── error.middleware.ts    one JSON error shape for the whole API
│   └── notFound.middleware.ts 404 for unknown routes
├── modules/
│   ├── cart/                  cart items
│   ├── category/              top-level categories
│   ├── demo/                  demo-admin write tracking + restore endpoint
│   ├── order/                 order placement, status flow, cancellation, delivery
│   ├── order-status/          status history log
│   ├── product/               product catalog
│   ├── review/                product reviews and rating recalculation
│   ├── site-settings/         store-wide branding, shipping and maintenance flag
│   ├── slide/                 homepage hero slider
│   ├── subcategory/           subcategories under a category
│   ├── transaction/           payment records tied to an order
│   ├── user/                  accounts, self-service profile, data export
│   ├── warranty/              coverage records and claims
│   └── wishlist/              saved products
└── utils/
    ├── apiError.ts            ApiError(status, message)
    ├── apiResponse.ts         { success, message, data } — every reply
    ├── catchAsync.ts          async error forwarding
    ├── validate.ts            Zod validation middleware
    ├── authz.ts               identity / ownership helpers
    ├── transactions.ts        withTransaction() with standalone fallback
    ├── ids.ts                 ObjectId helpers
    └── roles.ts               role normalisation
```

**Shared building blocks**

| Utility | Why it exists |
|---|---|
| `ApiError` + `errorMiddleware` | One error contract: `{ success: false, message }` with the right status code. |
| `apiResponse` | One success contract: `{ success: true, message, data }`. |
| `catchAsync` | A rejected promise becomes a normal Express error instead of an unhandled rejection. |
| `withTransaction` | Runs work in a transaction when the database is a replica set or sharded cluster, and falls back to plain execution on a standalone `mongod`. Services simply pass the optional `session` down. |
| `authz` (`currentUserId`, `scopedUserId`, `assertOwnerOrAdmin`) | Identity always comes from the token; a client-supplied id can narrow a query but never reach another user's records. |

---

## 🧩 API Reference

Base URL: `/api`. All replies use the same envelope: `{ success, message, data }`.

**Access legend**

| Label | Meaning |
|---|---|
| **Public** | No token needed. |
| **Bearer** | A valid token is required; the caller sees only their own data. |
| **Admin** | `requireAuth` + `requireRole("admin")` (the demo admin counts as admin). |
| **Cron** | `Authorization: Bearer <CRON_SECRET>` or Vercel's `x-vercel-cron: 1`, or an admin token. |

### Health

| Method | Path | Access |
|---|---|---|
| `GET` | `/api` | Public |
| `GET` | `/` | Public |

### Categories & subcategories

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/categories` | Public | Full list |
| `POST` | `/categories` | Admin | |
| `PATCH` | `/categories/:id` | Admin | |
| `DELETE` | `/categories/:id` | Admin | Cascade-deletes subcategories; blocked while products exist |
| `GET` | `/subcategories` | Public | |
| `POST` | `/subcategories` | Admin | |
| `PATCH` | `/subcategories/:id` | Admin | |
| `DELETE` | `/subcategories/:id` | Admin | Blocked while products exist |

### Products & slides

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/products` | Public | Search, filter, sort, paginate |
| `GET` | `/products/:slug` | Public | Single product |
| `POST` | `/products` | Admin | |
| `PATCH` | `/products/:id` | Admin | |
| `DELETE` | `/products/:id` | Admin | |
| `GET` | `/slides` | Public | Homepage hero slides |
| `POST` | `/slides` | Admin | |
| `PATCH` | `/slides/:id` | Admin | |
| `DELETE` | `/slides/:id` | Admin | |

### Cart & wishlist

Both routers apply `requireAuth` to every route. The `:userId` path variants are kept for older callers and **ignore the id in favour of the token**.

| Method | Path | Access |
|---|---|---|
| `GET` | `/cart` | Bearer |
| `GET` | `/cart/is-carted?productId=` | Bearer |
| `GET` | `/cart/user/:userId` | Bearer |
| `POST` | `/cart` | Bearer |
| `PATCH` | `/cart/:productId` | Bearer |
| `DELETE` | `/cart` | Bearer |
| `DELETE` | `/cart/:productId` | Bearer |
| `GET` | `/wishlist` | Bearer |
| `GET` | `/wishlist/is-wishlisted?productId=` | Bearer |
| `GET` | `/wishlist/user/:userId` | Bearer |
| `POST` | `/wishlist` | Bearer |
| `DELETE` | `/wishlist/:productId` | Bearer |

### Orders, status history & transactions

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/orders` | Bearer | Customers get their own orders; admins can query everyone |
| `GET` | `/orders/:id` | Bearer | Owner or admin only |
| `POST` | `/orders` | Bearer | Places an order (see [Order lifecycle](#order-lifecycle)) |
| `PATCH` | `/orders/:id/status` | Admin | Moves an order along the status flow |
| `PATCH` | `/orders/:id/customer-response` | Bearer | Customer reports what happened after shipping |
| `GET` | `/order-status?orderId=` | Bearer | Status history of an order |
| `GET` | `/transactions` | Public | Filterable payment records — see the [known gap](#-security) |

### Reviews

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/reviews` | Public | Filter by product, user or rating |
| `POST` | `/reviews` | Bearer | Requires a delivered purchase |
| `PATCH` | `/reviews/:id` | Bearer | Reviewer only |
| `DELETE` | `/reviews/:id` | Bearer | Reviewer or admin |

### Users

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/users` | Admin | Paginated account list |
| `GET` | `/users/me/export` | Bearer | The caller's own data package (JSON download) |
| `GET` | `/users/:id` | Bearer | Owner or admin only |
| `PATCH` | `/users/:id` | Bearer | Admin: any account, any field. Customer: own profile, safe fields only |
| `DELETE` | `/users/:id` | Admin | |

### Warranties

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/warranties/mine` | Bearer | The caller's coverage records |
| `GET` | `/warranties/order/:orderId/product/:productId` | Bearer | Coverage for one order line |
| `POST` | `/warranties/claim/:id` | Bearer | Customer files a claim (`problem`, `reason`, `description`, up to 5 images) |
| `GET` | `/warranties` | Admin | All warranties, filterable |
| `PATCH` | `/warranties/claim/:id` | Admin | `mark_under_review`, `request_info`, `resolve`, `reject` |

### Store settings & demo jobs

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/site-settings` | Public | Read by the storefront and its maintenance guard |
| `PATCH` | `/site-settings` | Admin | Public branding, About page copy, opening hours, shipping, currency, `maintenanceMode` |
| `GET` / `POST` | `/demo/restore` | Cron | Reverts demo-admin changes. `GET` exists because Vercel Cron only sends `GET` |

---

## 📋 Business Rules

### Order lifecycle

An order only moves forward, one step at a time.

```
confirmed ──▶ processing ──▶ shipped ──▶ delivered
    │             │            │             │
    └─────────────┴────────────┴─────────────┴──▶ cancelled
```

| From | Allowed next stages |
|---|---|
| `confirmed` | `processing`, `cancelled` |
| `processing` | `shipped`, `cancelled` |
| `shipped` | `delivered`, `cancelled` — both need the customer's response first |
| `delivered` | `cancelled` (a return — everything the delivery credited is reversed) |
| `cancelled` | none — a closed order can never be revived |

Re-selecting the current stage is a no-op rather than an error, and every real transition writes a row to the status history (`order-status`) so the customer's timeline has a permanent record.

**Placing an order** — one `POST /orders` does all of this inside a single transaction:

```
validate stock ─► redeem points (optional) ─► compute totals ─► create order + transaction
             ─► log status ─► decrement stock ─► create warranties later, on delivery ─► clear cart
```

| Step | Detail |
|---|---|
| Stock check | Rejects the order when any product has less stock than the requested quantity. |
| Totals | `subtotal + shipping fee − points discount`. Prices come from the database. |
| Shipping | Free above the configured threshold (or when the buyer picks it), standard, or express. An explicit choice from checkout wins. |
| Points earned | `1 point per currency unit` of the discounted subtotal — stored at creation, credited only on delivery. |
| Cart | Cleared after the order is created. |

**On delivery** (`applyDelivery`)

1. Linked transactions switch to `success`.
2. Each product's `sellCount` increases by the quantity sold.
3. Loyalty points are credited and the membership tier re-checked.
4. One warranty record per item is issued, dated from the delivery.

**On cancellation** (`applyCancellation`)

1. Linked transactions switch to `failed`, whatever the payment method.
2. Any warranty coverage raised from that order is voided.
3. Stock goes back to the products, and `sellCount` is reversed when the order had already been delivered.
4. Points **spent** at checkout are always returned.
5. Points **earned** from a delivered order are taken back (a return), and the tier is re-checked.

### Loyalty points & membership

```
Earning    1 point per currency unit of the discounted subtotal, credited on delivery
Redeeming  100 points = 1 currency unit, minimum 100 points
Limit      Points may cover the product total only — the delivery fee is always paid in cash
Tiers      silver < 1,000 · gold 1,000 · platinum 4,000 · diamond 10,000
```

- A redemption is a **guarded atomic update**: `findOneAndUpdate({ _id, points: { $gte: n } }, { $inc: { points: -n } })`. Two tabs checking out at the same time can never spend the same points twice, because the balance check and the debit happen in one database operation.
- The whole order — stock, points, order document, transaction — shares one session, so a failure anywhere rolls back all of it.
- The tier is never stored blind: it is recalculated from the balance whenever points change (delivery, cancellation, admin edit).

### Payments & transactions

- Every order gets one linked transaction record.
- Wallet payments (bKash / Rocket / Nagad) arrive with a transaction id; COD does not.
- A COD transaction stays `pending` until delivery, then flips to `success`.
- Cancellation marks the transaction `failed` regardless of method.

### Warranty coverage & claims

- A warranty is created **only on delivery**, one per order line, using the product's `warrantyPeriodMonths`, `warrantyType` and `warrantyTerms`.
- Those three values are **copied onto the record** at creation. The claim screens read the live product when it still exists and fall back to the copy otherwise, so coverage survives a product edit or delete.
- Statuses: `active` → `claim_submitted` → `under_review` / `info_requested` → `resolved`, plus `expired`.
- A customer can file one claim per warranty with a `problem` code, a reason, a description and up to 5 images. `problem` must be one of `not_working`, `stopped_working`, `damaged_on_arrival`, `battery_issue`, `display_issue`, `missing_parts`, `other`, so an unknown value is rejected by the validator.
- An admin then moves the claim forward with a note or a resolution. `reject` closes the warranty as `expired`.
- A daily job (`expireStaleWarranties`) marks every warranty whose expiry date has passed as `expired`.
- Cancelling an order voids the coverage it created.

### Reviews & ratings

A review has to be earned. All of these are checked server-side:

1. The caller is signed in and is not an admin.
2. They are not the product's own owner.
3. They have a **delivered** order containing that product.
4. They have not reviewed it before — one review per user per product.

`recalculateProductRating()` re-aggregates the product's rating and review count on every create, update and delete, so a stored rating is never stale. Editing is limited to the reviewer; deletion is allowed for the reviewer or an admin.

### Catalog & cart

- **Cascade delete** — deleting a category also deletes its subcategories.
- **Delete guard** — the whole delete is cancelled if the category or any of its subcategories still has products.
- **Cart rows** — one row per item behind a compound unique index on `{ userId, productId }`, with the subtotal computed live.
- **Slider** — a slide references a real product; price, image and discount are read live. When a slide's countdown ends, the product's discount returns to 0 and its price to the original.

### Store settings

One document drives the whole storefront: branding, fonts, palettes, logos, contact details, **opening hours** (multi-line, one day per line), the **About page copy** (`about.headline`, `intro`, `headquartersNote`, `openingHoursNote`, `ctaTitle`, `ctaDescription`), shipping fees, free-shipping threshold, currency, default browse mode and the `maintenanceMode` flag. It is readable without a token so the storefront can render, and only an admin can change it. Empty About fields fall back to the store's built-in wording on the frontend.

---

## 🔒 Security

| Protection | How it works |
|---|---|
| **Authentication** | `requireAuth` verifies the bearer JWT against the frontend's JWKS endpoint, including the issuer. A better-auth session token is accepted as a fallback by looking the session up in the shared database. |
| **Authorization** | `requireRole("admin")` guards every admin route. Dashboards, orders and profiles are additionally ownership-checked. |
| **Identity from the token** | `currentUserId`, `scopedUserId` and `assertOwnerOrAdmin` mean a client-supplied id can never point at another user's cart, wishlist, orders, profile or warranty. The legacy `/cart/user/:userId` style routes ignore the id entirely. |
| **Field-level lockdown** | `PATCH /users/:id` lets a customer edit only their own presentation fields. `role`, `status`, `points`, `member` and the like are admin-only, so nobody can promote themselves or lift their own suspension. |
| **Review eligibility** | Enforced on the server — delivered purchase required, one review per product, no self-review, admins excluded. |
| **Where the money comes from** | Prices, discounts, shipping fees, totals and points are always read from the database. A manipulated client payload cannot change what an order costs. |
| **Atomic money & stock** | Order placement, cancellation and delivery run inside one transaction, and the points debit is a guarded conditional update, so no partial or double-spent state is possible. |
| **Validation** | Every write endpoint passes its body through a Zod schema before a service sees it. |
| **Error hygiene** | Handlers throw `ApiError`; the error middleware returns a status and a message, never a stack trace or a database error. |
| **Cron endpoint** | `/demo/restore` accepts only `Authorization: Bearer <CRON_SECRET>`, Vercel's cron header, or a real admin token. With no secret configured, only an admin can call it. |
| **Demo admin limits** | Catalog routes only. Users, orders, transactions, cart, wishlist, account changes and password/email updates stay blocked. |

> ℹ️ **Known gaps**
>
> - **Account suspension** is enforced in the storefront UI only. The API stores the `status` field but does not reject cart or checkout writes from a suspended account.
> - **`GET /transactions` is unauthenticated.** It returns any matching payment records — including the buyer's name and email — so it should sit behind `requireAuth` and be scoped to the caller.
>
> Both are tracked in the [roadmap](#️-roadmap).

---

## 🧪 Demo Admin Mode

The shared demo admin can explore the admin dashboard safely: whatever it changes is undone automatically every day, and real admin changes are never touched.

```
Demo admin writes ─► original document saved to demo_undo ─► change goes live
Real admin writes ─► nothing logged                        ─► change is permanent
                                  │
             Daily cron: GET /api/demo/restore
                                  ▼
    Added ─► deleted    Edited ─► original restored    Deleted ─► brought back
```

| File (`src/modules/demo/`) | Role |
|---|---|
| `demo.context.ts` | Flags a request as coming from the demo admin (matched by JWT email) using `AsyncLocalStorage`. |
| `demo.plugin.ts` | Mongoose plugin. Before a demo-admin write, it snapshots the document's original state. The first write wins, so the true original is always kept. |
| `demo.service.ts` | Reads `demo_undo` and reverts everything. Safe to run twice. |
| `demo.route.ts` / `demo.controller.ts` | The restore endpoint, behind cron-or-admin. |

**Not restored:** users, orders, transactions, cart, wishlist and auth collections — the demo admin is blocked from changing them in the first place.

### Test it

```bash
curl https://<your-api>/api/demo/restore -H "Authorization: Bearer <CRON_SECRET>"
```

| Response | Meaning |
|---|---|
| `200` — "Demo changes reverted" | Working. |
| `401` | The secret is missing, wrong, or the app was not redeployed. |

To check end to end: sign in as the demo admin, add a category and edit a product, then run the command. Both changes should disappear.

### Limitations

- A demo-admin edit to a product is reverted whole, so a customer order placed in between can have its stock change rolled back too.
- Writes that bypass Mongoose documents (`insertMany`, `bulkWrite`) are not tracked.

---

## 🧰 Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js, Express.js 5, TypeScript |
| Database | MongoDB Atlas via Mongoose |
| Validation | Zod |
| Auth | JWT verification via the frontend's better-auth JWKS endpoint (`jose-cjs`) |
| Scheduling | `node-cron` (daily restore + warranty expiry) |
| Hosting | Vercel Serverless Functions (with `api/index.ts` as the entry point) |

<details>
<summary><b>npm packages used</b></summary>

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `mongoose` / `mongodb` | MongoDB ODM and driver |
| `zod` | Request payload validation |
| `jose-cjs` | JWKS fetching and JWT verification |
| `node-cron` | Daily maintenance jobs |
| `cors` | Cross-origin requests from the frontend |
| `dotenv` | Environment variable loading |
| `typescript` / `tsx` | Type safety and dev-time execution |
| `tsconfig-paths` | `@/` path alias resolution |

</details>

---

## 🚀 Setup

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No | Port the server listens on. Default `5000`. |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string. The server refuses to boot without it. |
| `NEXT_PUBLIC_CLIENT_URL` | **Yes** | Frontend URL — its `/api/auth/jwks` endpoint verifies every JWT, and it is the expected token issuer. |
| `CRON_SECRET` | For cron | Long random string guarding `/api/demo/restore`. Generate with `openssl rand -hex 24`. |
| `DEMO_ADMIN_EMAIL` | No | Email of the shared demo admin. Default `admin@gmail.com`. |
| `CRON_TIMEZONE` | No | Timezone for the daily job. Default `Asia/Dhaka`. |

```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
NEXT_PUBLIC_CLIENT_URL=your_frontend_app_url
CRON_SECRET=your_long_random_string
DEMO_ADMIN_EMAIL=admin@gmail.com
CRON_TIMEZONE=Asia/Dhaka
```

> ⚠️ Never commit `.env` or `.env.local`. A `CRON_SECRET` leak lets whoever holds it trigger a demo restore.

### Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/demoprojectbdsoft/Sparq-Server.git
cd Sparq-Server

# 2. Install dependencies
npm install

# 3. Create .env with the variables above

# 4. Start in watch mode
npm run dev
```

The API is then available at [http://localhost:5000](http://localhost:5000).

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch` — reloads on save |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled server from `dist/` |

> 💡 The [Sparq frontend](https://github.com/demoprojectbdsoft/Sparq-Electronics-Store) must be running at `NEXT_PUBLIC_CLIENT_URL`, otherwise no token can be verified and every private route returns `401`.

**Deploying to Vercel** — set the same variables in the project settings and add the daily cron:

```json
"crons": [{ "path": "/api/demo/restore", "schedule": "0 20 * * *" }]
```

The schedule is UTC (about 2 AM Asia/Dhaka). On Vercel's Hobby plan a cron runs once a day with up to ±1 hour of drift; when the server runs elsewhere, the built-in `node-cron` job covers it.

---

## 📈 Project Status

| Area | State |
|---|---|
| Catalog (categories, subcategories, products, slides) | ✅ Complete |
| Cart & wishlist | ✅ Complete |
| Orders, status flow, status history | ✅ Complete |
| Payments & transactions | ✅ Complete (simulated gateway) |
| Loyalty points — earning, redemption, refunds, tiers | ✅ Complete |
| Warranties — issuance with copied terms, problem-coded claims, admin review, expiry | ✅ Complete |
| Reviews & rating recalculation | ✅ Complete |
| Store settings, branding, About page copy & opening hours | ✅ Complete |
| Demo admin sandbox with daily restore | ✅ Complete |
| Account data export | ✅ Complete |
| Rate limiting, CORS allow-list, database indexes | ⏳ Planned |
| Automated tests | ⏳ Planned |

---

## 🗺️ Roadmap

- [ ] **Rate limiting & request logging** — per-IP and per-token limits before public exposure.
- [ ] **Server-side account suspension** — reject cart and checkout writes from a suspended account instead of relying on the storefront.
- [ ] **Scope the transactions list** — require a token and return only the caller's payments to customers.
- [ ] **CORS allow-list** — restrict origins to the storefront instead of allowing every origin.
- [ ] **Database indexes** — compound indexes for the order, product and review query patterns.
- [ ] **Automated tests** — unit and integration coverage per module.
- [ ] **Real payment gateway** — Stripe / SSLCommerz / bKash, replacing the simulated wallet flow.
- [ ] **Coupons & promo codes** — server-validated discount codes.
- [ ] **Rider role & delivery module** — assigned deliveries, status updates, live location.
- [ ] **"Lucky Box" rewards** — a gamified way to spend loyalty points.
- [ ] **Multi-tenant architecture** — a `tenantId` on every collection with per-store subdomains.
- [ ] **Store onboarding & subscription plans** — self-serve store creation and billing.
- [ ] **Real-time store settings** — push changes to clients instead of polling.
- [ ] **Chat module** — real-time messaging between customers and support.

---

## ℹ️ About This Project

Not distributed under an open-source license. Feel free to explore the code, but please reach out before reusing or redistributing it.
