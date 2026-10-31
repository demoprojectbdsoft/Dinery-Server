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
   - [Vendor application lifecycle](#vendor-application-lifecycle)
   - [Seller workspace & multi-vendor orders](#seller-workspace--multi-vendor-orders)
   - [Order lifecycle](#order-lifecycle)
   - [Loyalty points & membership](#loyalty-points--membership)
   - [Discount coupons](#discount-coupons)
   - [Featured promotions](#featured-promotions)
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
| **Scheduled jobs** | Daily sweeps: demo-admin edits are restored, lapsed warranties close, unanswered delivery offers are cancelled, expired subscription periods close, and featured placements whose date has passed come off the shelves. |

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
│   ├── cron.middleware.ts     requireCronOrAdmin — CRON_SECRET or Vercel's cron header
│   ├── internal.middleware.ts requireInternalKey — the key the storefront sends
│   ├── error.middleware.ts    one JSON error shape for the whole API
│   └── notFound.middleware.ts 404 for unknown routes
├── modules/
│   ├── address/               saved shipping addresses (one row per address)
│   ├── cart/                  cart items
│   ├── category/              top-level categories
│   ├── contact/               contact-page messages, saved then emailed to the store inbox
│   ├── coupon/                discount codes — one engine for store-wide and per-seller codes
│   ├── demo/                  demo-admin write tracking + restore endpoint
│   ├── mail/                  emails the storefront asks for (the password reset link)
│   ├── message/               stored contact messages, read in the admin dashboard
│   ├── order/                 order placement, status flow, cancellation, delivery
│   ├── order-status/          status history log
│   ├── product/               product catalog
│   ├── promo/                 homepage promo banners (tiles and the wide strip)
│   ├── review/                product reviews and rating recalculation
│   ├── site-settings/         store-wide branding, shipping and maintenance flag
│   ├── slide/                 homepage hero slider
│   ├── subcategory/           subcategories under a category
│   ├── transaction/           payment records tied to an order
│   ├── user/                  accounts, self-service profile, data export
│   ├── vendor/                seller workspace: applications, plans, storefront, catalogue, subscription, own orders, sales report, coupons, featured placements
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
    ├── emailTemplates.ts      every email body, drawn with the brand from Site Settings
    ├── mailer.ts              every email over SMTP, from your own mailbox; never throws
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
| **Internal** | `x-internal-key: <INTERNAL_API_KEY>`. The storefront calls it; people cannot. |

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
| `GET` | `/promos` | Public | Promo banners, filtered by `isActive` and `placement` (`tile` or `strip`) |
| `POST` | `/promos` | Admin | `name` is required; `placement` defaults to `tile` and `isActive` to `false` |
| `PATCH` | `/promos/:id` | Admin | Any field, so a single switch can be flipped without resending the banner |
| `DELETE` | `/promos/:id` | Admin | |

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

### Discount coupons

One collection serves both writers: the store team's global codes and a seller's own codes are the same document with a different `ownerType`, so the checkout has a single validator instead of two rule sets that could drift. Only this module decides what a code is worth.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/coupons` | Admin | Every code, filterable by `owner` (`all` / `admin` / `vendor`), `status` (`live` / `upcoming` / `expired` / `stopped` / `all`) and `search` over code, title and description; paginated, with a count per state |
| `POST` | `/coupons` | Admin | `code` is stored upper-cased and must be free; `discountType` is `percentage` (1–100) or `fixed`; `endDate` must follow `startDate` |
| `GET` | `/coupons/:id` | Admin | One code with its usage, remaining allowance and redemption count |
| `PATCH` | `/coupons/:id` | Admin | Any field, so one switch can be flipped without resending the code |
| `DELETE` | `/coupons/:id` | Admin | Deletes an unused code. A code that has already been redeemed is deactivated instead, so the ledger and the orders that quote it survive |
| `POST` | `/coupons/validate` | Bearer | `code` plus `items[{productId, quantity}]` → the discount, or the reason there is none. Prices, sellers and categories are read back from the database, so nothing about the money comes from the browser |

### Featured promotions

A placement is a dated row, not a checkbox. `FeaturedPromotion` records who bought it (the seller's plan or the store team), what it lifts (one product, or the whole shop) and until when — and it is the only writer of `Product.isFeatured` and `VendorStore.isFeatured`.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/promotions` | Admin | Every placement or one seller's (`vendorId`), filterable by `kind` (`product` / `store` / `all`) and `status` (`live` / `ended` / `cancelled` / `all`); paginated, with a count per state. Each row carries the product, the shop and the seller's name, so a board of everyone's placements reads without a second call |
| `POST` | `/promotions` | Admin | Grant a placement: `kind` plus `productId` or `vendorId`, `days` (1–365, default 30) and an optional `reason` the seller reads. The shop it belongs to is read from the row being lifted, never sent. A listing a buyer cannot reach, or stock the store owns itself, is refused with the reason |
| `DELETE` | `/promotions/:id` | Admin | End a placement early with the reason. Nothing is deleted — the row stays so the desk can say what ran and why it stopped |
| `GET` | `/promotions/expire` | Cron / Admin | The daily sweep: closes every placement past `endsAt` and dims what it lifted |
| `GET` | `/vendor-promotions` | Vendor | The seller's own placements, same filters and per-state counts |
| `POST` | `/vendor-promotions` | Vendor | `{ productId }` only. The plan decides the length, the allowance decides whether there is a slot, and the account decides whose product it is |
| `DELETE` | `/vendor-promotions/:id` | Vendor | Free the slot early. Only the seller's own row, and a foreign id answers `404` |
| `GET` | `/vendor-subscription/expire` | Cron / Admin | Closes periods that ran out while nobody read them, and ends the placements the expired plan had bought |

### Orders, status history & transactions

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/orders` | Bearer | Customers get their own orders; admins can query everyone |
| `GET` | `/orders/:id` | Bearer | Owner or admin only |
| `POST` | `/orders` | Bearer | Places an order (see [Order lifecycle](#order-lifecycle)) |
| `PATCH` | `/orders/:id/status` | Admin | Moves an order along the status flow |
| `PATCH` | `/orders/:id/customer-response` | Bearer | Customer reports `received`, `not_received` or `cancelled` after shipping |
| `GET` | `/order-status?orderId=` | Bearer | Status history of an order |
| `GET` | `/transactions` | Public | Filterable payment records — see the [known gap](#-security) |

### Reviews

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/reviews` | Public | Filter by product, user or rating, or search the comment, reviewer name and product title; a 24-character review id finds exactly one review (the bell's review line links that way) |
| `POST` | `/reviews` | Bearer | Requires a delivered purchase |
| `PATCH` | `/reviews/:id` | Bearer | Reviewer only |
| `DELETE` | `/reviews/:id` | Bearer | Reviewer or admin |

### Users

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/users` | Admin | Paginated account list, searchable by name, email or a 24-character account id (the bell's new-user line links by id, so it opens exactly that account) |
| `GET` | `/users/me/export` | Bearer | The caller's own data package (JSON download) |
| `GET` | `/users/:id` | Bearer | Owner or admin only |
| `PATCH` | `/users/:id` | Bearer | Admin: any account, any field. Customer: own profile, safe fields only |
| `DELETE` | `/users/:id` | Admin | |

### Saved addresses

Every route requires a token; the owner is always taken from the token, never from the body or the URL.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/addresses` | Bearer | The caller's addresses, default first |
| `POST` | `/addresses` | Bearer | Body: `fullName`, `phone`, `address`, `city`, `postalCode`, optional `label` and `isDefault`. Returns `200` when that address was already saved, `201` when it is new |
| `PATCH` | `/addresses/:id/default` | Bearer | Makes this the only default address |
| `PATCH` | `/addresses/:id` | Bearer | Any field except `isDefault` |
| `DELETE` | `/addresses/:id` | Bearer | Removing the default promotes the newest remaining address |

### Warranties

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/warranties/mine` | Bearer | The caller's coverage records |
| `GET` | `/warranties/order/:orderId/product/:productId` | Bearer | Coverage for one order line |
| `POST` | `/warranties/claim/:id` | Bearer | Files a claim on an active record. Body: `reason`, `description`, up to 5 `images`; `problem` is optional and legacy |
| `GET` | `/warranties` | Admin | All warranties, filterable by `status`, by `warrantyType` and by `orderId` (the bell's warranty line links that way, so the list opens on the order that was delivered). Besides the five real statuses, `status=claimed` is a group that returns `claim_submitted`, `under_review` and `resolved` — every record a customer filed a claim on. Untouched (`active`) and closed-by-date (`expired`) records stay out of it. `warrantyType` matches the type copied onto the record when it was issued (`manufacturer-warranty`, `seller-warranty`, `extended-warranty`, `other`, `none`), so it narrows the list to one kind of cover and combines with `status` |
| `PATCH` | `/warranties/claim/:id` | Admin | `mark_under_review`, `resolve` / `reject` (resolution or note required) |
| `POST` | `/warranties/email/:id` | Admin | Emails the customer about this warranty. The address is read from the record, never from the body |
| `GET` | `/warranties/expire` | Cron | Closes lapsed warranties. Called by Vercel Cron once a day |

### Contact

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/contact` | Public | Contact-page message. Body: `name`, `email`, `message` (10–3000 characters), optional `subject` and `department` (`support` or `contact`). **Saved first**, then emailed to the address in Site Settings — `contactEmail` for General & Business, `supportEmail` otherwise. The reply's `delivered` says whether the email copy went out |

### Messages

The contact page writes here; the admin reads it. Creating is not a public endpoint — a message only ever appears through `POST /contact`.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/messages` | Admin | Paginated. Query: `status` (`all`, `sent`, `failed`), `search` (name, email or subject), `sort` (`newest`, `oldest`, `name`, `subject`), `page`, `limit` |
| `POST` | `/messages/:id/reply` | Admin | Emails the visitor. Body: `subject`, `message`. The address is read from the stored message, never from the body |
| `DELETE` | `/messages/:id` | Admin | |

### Notifications

One collection, one feed, every role. A line with no `userId` belongs to the store team's shared board; a line with a `userId` is addressed to one account and carries its own read state. Keeping both in one place — and behind one endpoint — means what a customer is told and what the store sees can never drift apart, and there is no second feed to keep in step.

Store lines are written by the API itself the moment something happens — never seeded, mocked or back-filled — one row per new order, recorded payment, delivered order's warranties, customer cancellation, new or deleted account, contact message, and a review being written or edited. A row stores what changed plus the value the matching screen searches by (an order id, an account id, a review id or an email); the app builds the route, so an old line still opens the right page after a rename.

Personal lines are written for the same events, from the customer's and rider's point of view: order placed, each order stage, a delivery request, and a delivery update. Each one is also emailed through the same SMTP mailer; a failed send is logged and swallowed, so a mail server problem can never undo an order or a delivery.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/activities/mine` | Signed in | **The one feed.** The role is read from the token, never from the query: an `admin` or `demo admin` gets the shared store board (the rows with no owner), everybody else the rows addressed to them. Query: `page`, `limit` 1–100 (default 20), `search` (matched against the title and the detail), `type` (comma-separated, for the chips), `sort` (`newest`, `oldest`, `unread` — the last one only means something to a personal list), `unread` (`true`). Answers `{ lines, total, unreadCount, typeCounts, shared, serverTime, pagination }`. `shared` says which read mark applies — a shared board is marked on the device, because one admin's read must not clear the whole team's — and `typeCounts` counts every chip under the current search. `serverTime` is the API clock at the moment of the answer, so the app can write "3m ago" without trusting the visitor's system clock. Rows delete themselves after 30 days |
| `GET` | `/activities/mine/unread-count` | Signed in | `{ unreadCount }`, for the bell |
| `PATCH` | `/activities/mine/read-all` | Signed in | Marks every unread line of the caller as read. `{ updated }` |
| `PATCH` | `/activities/mine/:id/read` | Signed in | Marks one line as read; `404` when the id is not the caller's |

A vendor reads this same feed — the model already accepts the role, so the seller workspace needed no second endpoint. A seller marking a group ready for pickup writes a `delivery` line onto the store's shared board, which is where the team assigns the rider.

### Mail (internal)

The storefront keeps no mailbox of its own. When a customer clicks **Forgot password**, better-auth builds the one-time link and the Next.js app asks this API to send it.

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/mail/reset-password` | Internal | Body: `email`, `name`, `url` (the finished link from better-auth). Sends the "Reset your password" email through the same SMTP mailer, drawn with the site's colours and logo |

- The whole route is closed without `x-internal-key`, so nobody can make the store email a link of their choosing to a stranger. A wrong key gets `401`; with no key configured on the server it answers `500` instead of letting everything through.
- The key lives in `INTERNAL_API_KEY` and must hold the **same value** in both projects.
- A send failure comes back as `502` with the mail server's own reason, so the customer is told the link did not go out instead of waiting for an inbox that stays empty.

### Store settings & demo jobs

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/site-settings` | Public | Read by the storefront and its maintenance guard |
| `PATCH` | `/site-settings` | Admin | Public branding, About page copy, opening hours, shipping, currency, `maintenanceMode` |
| `GET` / `POST` | `/demo/restore` | Cron | Reverts demo-admin changes. `GET` exists because Vercel Cron only sends `GET` |

### Vendor applications & plans

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/vendor-applications` | Bearer | Submit the six-step application. One open application per account; the account keeps the `customer` role |
| `GET` | `/vendor-applications/mine` | Bearer | The caller's own application, latest first |
| `POST` | `/vendor-applications/mine/cancel` | Bearer | Withdraw a `pending` or `under_review` application |
| `POST` | `/vendor-applications/status` | Internal | Status for an email whose password the auth layer already checked. No public lookup exists |
| `GET` | `/vendor-applications` | Admin | Search, status filter, pagination, per-status counts |
| `GET` | `/vendor-applications/:id` | Admin | Application, applicant summary, created store |
| `PATCH` | `/vendor-applications/:id/review` | Admin | `under_review`, `approve`, `reject` (reason required) |
| `GET` | `/vendor-store` | Admin | Every shop on one page — `search` over name/slug/category/email, `status`, `featured`, paginated. Each row carries the seller's account id, which is what a storefront placement is granted to |
| `GET` | `/vendor-plans` | Public | The three plans, merged with admin edits |
| `PATCH` | `/vendor-plans/:planId` | Admin | Prices, limits, benefits, billing cycles, commission, grace period |

- An application is linked to the account that submitted it, so an existing customer becomes a vendor without a second account and without losing orders, reviews, the wishlist, the wallet or addresses.
- `pending` and `under_review` accounts cannot create a session at all: the better-auth `session.create.before` hook refuses every provider, so neither a password login nor a Google login issues a token.
- Approval is one transaction: the store is created (or reused), the same user row becomes `vendor`, the application turns `approved`, and the Free period is recorded. A paid plan writes no subscription until the demo checkout succeeds.
- Rejection keeps the account a customer, stores the reason, and lets the applicant resubmit on the same row so the reference stays stable.
- Every plan number — price, product limit, featured limit, coupon limit, commission, grace days — is read through `vendor-plan.service`, never hard-coded in a controller or a screen.

### Seller workspace (`vendor`)

Once the account is a vendor, everything else is scoped by the token. There is no `/:vendorId` route anywhere in the workspace: a seller reads and writes their own shop, catalogue, plan, orders and report, and a foreign id in a path answers `404` — the row simply is not theirs to find.

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/vendor-store/mine` | Vendor | The seller's own storefront row |
| `PATCH` | `/vendor-store/mine` | Vendor | Name, description, logo, cover, contact, address, socials. `isVisible` and `status` are the store team's switches, and being a featured *shop* is a placement only the store team can grant — none of the three is editable here |
| `GET` | `/vendor-products` | Vendor | Own catalogue with per-status counts, the plan's `maxProducts` and its usage. Query: `status` (`draft`, `pending_review`, `published`, `rejected`, `archived`, `out_of_stock`, `all`), `search` over title/sku/brand, `page`, `limit` (max 100) |
| `POST` | `/vendor-products` | Vendor | Create a listing. `publish: true` takes it live and is the branch that checks the plan limit; asking to publish with no stock leaves it `out_of_stock` |
| `GET` | `/vendor-products/:id` | Vendor | One of the caller's own products |
| `PATCH` | `/vendor-products/:id` | Vendor | Any own field. Only a move *into* a live status re-checks the plan limit — an edit that keeps a live listing live does not |
| `DELETE` | `/vendor-products/:id` | Vendor | Archives the listing (`archived`, hidden). Nothing is deleted while orders, reviews and warranties still reference it |
| `GET` | `/vendor-subscription/mine` | Vendor | The live plan, its limits, current usage, every payment and the previous period |
| `POST` | `/vendor-subscription/checkout` | Vendor | Demo checkout for a paid plan: `planId`, `billingCycle` (`monthly`/`yearly`), `method`, optional `transactionId` and `idempotencyKey` |
| `POST` | `/vendor-subscription/cancel-renewal` | Vendor | Turns auto-renew off; the paid period still runs to its end date |
| `GET` | `/vendor-orders` | Vendor | The seller's fulfilment groups — see [multi-vendor orders](#seller-workspace--multi-vendor-orders). Query: `status` (one stage, or `active` / `completed` / `rejected` / `all`), `search`, `page`, `limit` (max 50) |
| `GET` | `/vendor-orders/summary` | Vendor | `{ pending, active, completed, total }` for the overview's counters |
| `GET` | `/vendor-orders/:id` | Vendor | One group, with the parent order's customer, payment and the live delivery/rider state |
| `PATCH` | `/vendor-orders/:id/status` | Vendor | `accepted`, `processing`, `ready_for_shipment`, or `rejected` with a reason. `shipped` / `delivered` / `cancelled` are refused — those come from the parent order |
| `GET` | `/vendor-analytics?range=` | Vendor | The seller's own sales report for `7`, `30`, `90` or `365` days, shortened to the window the plan allows |
| `GET` | `/vendor-coupons` | Vendor | The seller's own codes, with the same `status` / `search` / paging filters as the admin desk |
| `POST` | `/vendor-coupons` | Vendor | New code. The plan's `activeCoupons` allowance is checked first, and `productIds` may only name this seller's own products |
| `GET` | `/vendor-coupons/:id` | Vendor | One of the caller's own codes |
| `PATCH` | `/vendor-coupons/:id` | Vendor | Any own field. Waking a stopped code costs a slot, so it re-checks the allowance |
| `DELETE` | `/vendor-coupons/:id` | Vendor | Deletes a code nobody has used yet; one that has been redeemed is only stopped |
| `GET` | `/vendor-promotions` | Vendor | The seller's own featured placements with per-state counts and days remaining |
| `POST` | `/vendor-promotions` | Vendor | `{ productId }` — an own listing in a buyable status. The plan's `featuredDurationDays` sets the window and `featuredProducts` sets how many may run at once |
| `DELETE` | `/vendor-promotions/:id` | Vendor | Ends the placement early and frees the slot; the row stays on the desk |

- No seller read ever leaves the shop's own rows: products are filtered by `vendorId`, orders by the vendor's `vendorId`, and the analytics fold only that seller's groups. A shop can never see another shop's turnover.
- Plan limits are enforced on write, in the service, not in the screen: `assertWithinLimit` reads the live plan through `getVendorPlanState` and refuses with the headroom in the message.
- A suspended or closed store cannot trade: `requireTradingStore` blocks catalogue writes, new codes and fresh placements until the store team lifts the suspension, and the message names the action it refused.
- A seller's code never reaches across the marketplace: `evaluateCoupon` counts only that vendor's own lines, so other shops' goods and the platform's stock stay at full price even in a mixed basket.
- A seller can pin a product but never a shop: `POST /vendor-promotions` only takes `kind: "product"`, and the length comes from the plan, so no request can book a decade of shelf space or lift the whole storefront for free.

---

## 📋 Business Rules

### Vendor application lifecycle

```
registered customer ──submit──▶ pending ──admin──▶ under_review ──approve──▶ approved (role: vendor)
                                   │                     │
                                   └──────reject─────────┴──▶ rejected (role stays customer, can resubmit)
                                   │
                                   └──applicant withdraws──▶ cancelled
```

| Rule | How it is enforced |
|---|---|
| One open application per account | Partial unique index over `pending`, `under_review`, `approved` |
| One store per account | `vendorstores.userId` is unique; approval reuses an existing row |
| Unique store name and link | Checked against live applications and real stores before a submission is accepted |
| No access while waiting | `vendorStatus` is mirrored on the user row and the session hook refuses to create a session |
| Vendor role only on approval | The only write of `role: "vendor"` is inside the approval transaction |
| Customer data survives conversion | Approval updates the same user document; nothing is copied or deleted |
| A vendor may still shop | `canShop` only refuses staff and riders, so a vendor keeps its cart and wishlist |

### Seller workspace & multi-vendor orders

A checkout that contains something from two shops is **one payment and two fulfilments**. The parent `Order` keeps everything money-shaped — the customer, the address, the totals, the transaction, the delivery — and every seller gets one `VendorOrder` row that covers only their own lines:

```
POST /orders ──▶ Order (customer · money · delivery · one status flow)
                  ├─▶ VendorOrder  seller A · their items · their subtotal · their stage
                  └─▶ VendorOrder  seller B · ...
```

Items with no `vendorId` are the platform's own stock: they stay on the parent order only, so an order paid entirely for platform products creates no group at all.

**The seller's stages** — shorter than the parent's, and deliberately not the same list:

```
pending ──accept──▶ accepted ──▶ processing ──▶ ready_for_shipment ──▶ (the store ships it)
    │
    └──reject (reason required)──▶ rejected
```

| Rule | How it is enforced |
|---|---|
| One group per seller per order | `(orderId, vendorId)` is unique, so a replayed checkout writes no second group |
| The seller only ever moves their own row | The status write re-reads the row with `vendorId` from the token and checks `VENDOR_TRANSITIONS` before saving — a stale tab cannot skip a stage |
| Money stays on the parent | A group stores its own `subtotal` (a snapshot of the item titles, prices and quantities taken at checkout), never a payment state. Prices survive a later product edit |
| Shipping, delivery and cancel are the store's | `PATCH /vendor-orders/:id/status` refuses them; they are pushed down from `PATCH /orders/:id/status` |
| Riders are assigned per parent order | The seller marks the group ready and asks; the store team, who sees every shop's load, assigns the rider |
| A rejected line goes back on the shelf | Rejecting restocks those quantities, exactly like a cancellation, and the reason is stored in the group's history |
| A rejection is never silently reopened | Each parent stage carries a guard list, so a later `shipped`/`delivered` write skips a group already `rejected` |

**How the two stay in step** — the split and the two sync helpers live in `vendor-order.create.ts`, the only file `order.service` and `delivery.service` import from the vendor domain, which keeps the module graph acyclic:

| Parent event | Effect on the groups |
|---|---|
| `PATCH /orders/:id/status` → `shipped` / `delivered` / `cancelled` | Every group not already in a final or rejected stage takes that status and writes a history line saying it moved with the rest of the order — inside the same transaction |
| A rider is assigned or reassigned (`/deliveries`) | The group copies the parent's `deliveryId` and `riderId`, so the seller's detail page shows the same rider the customer sees |
| The seller marks `ready_for_shipment` | `pickupRequestedAt` is stamped and a `delivery` line lands on the store's shared board asking for a rider |

**The seller's report** is read from those same rows, so the numbers a shop sees can only ever be its own:

| Rule | How it is enforced |
|---|---|
| Revenue is earned on delivery | Only `delivered` groups count. `ready_for_shipment` and `shipped` are reported beside them as "on the way", never inside the total |
| The window is capped by the plan | `analytics` level `basic`/`detailed`/`advanced` reaches 30/90/365 days; the request is answered with the range actually used, so the screen cannot advertise a range the vendor does not own |
| Ranked products are capped too | Top 3 / 10 / 20 products by the same level |
| Exports follow the plan's `exports` level | `limited` gets the summary and the chart data; `full` adds the per-product and per-order tables |
| Commission is the plan's, not a guess | `vendorCommission` reads the live plan and the report shows the percentage taken, the amount and the net payout |

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

**Delivery response** — a shipped order waits for the customer before it can be closed:

| Response | Meaning | Can it change? |
|---|---|---|
| `received` | The parcel arrived — the order can only become `delivered` | Final |
| `cancelled` | The customer refused the parcel — the order can only become `cancelled` | Final |
| `not_received` | The parcel never arrived — the admin decides what happens next | Editable, because a late parcel can still be confirmed |

- A response is accepted only while the order is `shipped`.
- Moving a shipped order to `delivered` or `cancelled` is refused until the customer has answered.
- The two are cross-checked: `not_received` or `cancelled` blocks `delivered`, and `received` blocks `cancelled`, so the admin can never contradict the customer.
- Every response is written to the status history with its optional note.

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

**What each outcome settles** — same rules whether the customer responded or an admin moved the order:

| Item | On delivery | On cancellation |
|---|---|---|
| Payment record | every linked transaction switches to `success` | every linked transaction switches to `failed`, whatever the method |
| Quantity / stock | unchanged — checkout already took the quantity out of stock | the quantity is added back to `stockQuantity` |
| Sold count | each product's `sellCount` grows by the quantity | `sellCount` shrinks by the quantity **only** when the order had already been delivered |
| Points spent at checkout | stay spent — they were already turned into the discount | returned in full |
| Points earned | `pointsEarned`, worked out at checkout, is credited to the balance | taken back, but only on an order that had been delivered |
| Membership tier | re-checked after the credit | re-checked after every balance change |
| Warranty | one record per item, active from the delivery date | open records switch to `expired` — kept for history, never deleted |
| Cart | already cleared when the order was placed | not restored |

Two safety notes:

- Stock is taken at **checkout**, not at delivery, so a shipped order has already reduced what is on sale. Delivery only counts the sale.
- Delivery returns early when the order was already delivered, and `cancelled` is a terminal status, so points, sold counts, stock and warranties can never be settled twice.

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

### Discount coupons

Two owners, one engine. `ownerType` says who wrote the code, and that one field decides how far the discount may reach.

| Rule | Detail |
|---|---|
| **One code, one meaning** | `code` is stored upper-cased under a unique index, so `save10` and `SAVE10` cannot be two coupons. A clash on write answers `409`. |
| **Whose goods** | An admin code may name any product or category in the store. A vendor code only ever counts lines owned by that vendor; another shop's goods and the platform's stock are left at full price. |
| **Narrowing** | `productIds` and `categoryIds` are both optional. Empty means everything the owner may discount, and a line qualifies through either list. |
| **What it is worth** | A percentage takes its share of the *eligible* subtotal, capped by `maxDiscountAmount` when that is set. A fixed amount is capped by the eligible subtotal. Money is rounded to two decimals and recomputed on the server every single time. |
| **Refusals name themselves** | "not active yet", "expired", "used up", the per-customer limit, "does not apply to anything in your cart" and the `minOrderAmount` shortfall are separate messages — a shopper who typed a real code correctly must not be told it is invalid. |
| **State is derived** | `live` / `upcoming` / `expired` / `stopped` is read from `isActive`, the two dates and the usage counter. It is never a stored flag, so it cannot go stale. |
| **Order of the money** | The coupon comes off the subtotal first; loyalty points may then only cover what the code left to pay for; the shipping fee is added on top. Points are earned on the discounted product total only. |
| **Redemption ledger** | Each use pushes `{ orderId, customerId, amount, at }` onto the code and raises `usedCount` / `discountGiven`, inside the order's own transaction. |
| **Cancellation gives it back** | `releaseCouponForOrder` reverses the one entry whose `reversedAt` is still null and moves the counters once, so a replayed cancellation cannot refund a code twice. |
| **A spent code is never erased** | Deleting a coupon with `usedCount > 0` deactivates it instead. Orders keep quoting the code they were bought with. |
| **The seller's allowance** | `activeCoupons` counts this vendor's codes that are `isActive` and have not yet ended. Creating one, and waking a stopped one, both run `assertWithinLimit`. A code can only name products from the seller's own shelf. |
| **A dead plan stops new codes** | `assertWithinLimit` refuses when the subscription is not live, and a suspended or closed store cannot create one at all. |

### Featured promotions

Being featured is bought, not claimed. One collection holds both kinds of placement, and one service is the only hand that turns the display switches on or off.

| Rule | Detail |
|---|---|
| **One writer of "featured"** | `Product.isFeatured` and `VendorStore.isFeatured` are only switches this module flips. Nothing else lights them, so a placement that ends cannot leave a product shining on the shelves because nobody remembered to turn it off. |
| **Two kinds** | `kind: "product"` pins one listing; `kind: "store"` lifts the whole shop into the featured vendors row and writes `featuredUntil` on the store. A store placement takes no product, and a product placement reads its owner from the product. |
| **Who may buy what** | A seller may pin their own listings for the window their plan states. Being a featured *store* is the store team's grant alone — no seller route can lift its own shop. |
| **The length is never sent** | A seller's placement runs for `featuredDurationDays` from the live plan; an admin grant states `days` (1–365). A browser cannot book a decade of shelf space. |
| **One shelf, one booking** | A partial unique index keeps at most one active placement per product and per vendor, and a second press answers `409` with how many days are already left on it. |
| **State is read against the clock** | `live` / `ended` / `cancelled` comes from the row's status *and* `endsAt`, so a desk is truthful even before the sweep has run. |
| **The sweep dims what lapsed** | `/promotions/expire` closes every placement past its date and turns its switch off. Vercel Cron runs it daily; an admin can run the same route by hand. |
| **Unbuyable means unfeatured** | Archiving a listing, or moving it out of a buyable status or hiding it, ends the placement with the reason written on the row — the shelf is given back rather than left showing something nobody can reach. |
| **A grant obeys the same rule as a purchase** | The board cannot lift a draft, a rejected, an archived or a hidden listing either. "Buyers can reach this" is one pair of statuses — the same list the public catalogue serves, the seller's desk buys on and the store's product counter counts — held once in `vendor.types.ts` so those four readings cannot drift. |
| **The board cannot lift the store's own stock** | A product with no `vendorId` belongs to the platform, has no dated placement behind it and keeps the plain editorial switch on the products desk; a grant on it is refused with that pointer. |
| **A dead plan clears the board** | When a period expires — on read, or by `/vendor-subscription/expire` — every placement it paid for ends. The shop keeps its products, orders and coupons. |
| **A grant is not billed** | `featuredProducts` counts the placements the shop bought (`source: "subscription"`). A favour from the store team lifts a product without eating a slot somebody paid for. |
| **Only the store's own goods keep a hand switch** | Flipping `isFeatured` on the products desk is refused for a seller's product with a pointer to the promotions board, because that flag needs an end date. A product is told as a seller's by `vendorId` / `storeId`, so the store's own stock keeps the plain editorial switch. |
| **Rows are closed, never deleted** | Cancelling keeps the placement so the desk can say what ran, for how long and why it stopped — which is also how a seller learns that a grant was withdrawn. |

### Payments & transactions

- Every order gets one linked transaction record.
- Wallet payments (bKash / Rocket / Nagad) arrive with a transaction id; COD does not.
- A COD transaction stays `pending` until delivery, then flips to `success`.
- Cancellation marks the transaction `failed` regardless of method.

### Warranty coverage & claims

#### 1. Where coverage comes from

- Coverage is **never created at checkout**. It is issued when an order reaches `delivered` — one record per order line.
- A line is skipped unless the product promises coverage: the type must not be `none` **and** `warrantyPeriodMonths` must be at least 1. A "No warranty" product never leaves an empty record behind, and a leftover type with `0` months is ignored the same way.
- `expiryDate` = delivery date + `warrantyPeriodMonths`, clamped to the last valid day of the month (31 Jan + 1 month → 28/29 Feb).
- `warrantyType`, `warrantyPeriodMonths` and `warrantyTerms` are **copied onto the record**. The screens prefer the live product and fall back to the copy, so coverage survives a product edit or delete.
- Creation is idempotent for one `(user, product, order)`: delivering the same order twice cannot issue a second record.
- The product form cannot contradict itself. Saving `warrantyType: none` drops the period to `0`, and saving a covering type with `warrantyPeriodMonths: 0` stores the product as `none` — cover with no end date is not a promise anyone can honour.

#### 2. The five warranty types

`src/modules/warranty/warranty.types.ts` is the single source of truth: the label, who carries the repair, and what the customer should expect. The product validator, the claim rules and the emails all read it.

| `warrantyType` | Shown as | Covered by | Notes |
|---|---|---|---|
| `manufacturer-warranty` | Manufacturer warranty | The brand | The store records the claim and forwards it to the service centre |
| `seller-warranty` | Seller warranty | The store | The store repairs or replaces directly |
| `extended-warranty` | Extended warranty | The store, under the plan | Cover beyond the manufacturer's own period |
| `other` | Other warranty | Per the terms text | **Requires `warrantyTerms`** — otherwise the API refuses it, because the type would say nothing |
| `none` | No warranty | Nobody | No record is created, no claim form is offered, nothing can be extended |

The claim pipeline is identical for the four covering types; the type changes who is responsible and the wording the customer and admin read. An unknown code on an old record is displayed as "Other warranty" instead of an empty cell.

#### 3. Status lifecycle

| From | Who | Action | Becomes |
|---|---|---|---|
| `active` | customer | files a claim | `claim_submitted` |
| `claim_submitted` · `under_review` | admin | `mark_under_review` | `under_review` |
| any open claim | admin | `resolve` — resolution or note required | `resolved` |
| any open claim | admin | `reject` — resolution or note required | `expired` |
| `active` | system | expiry date has passed | `expired` (`closedReason: date`) |
| any open claim | system | the order is cancelled or returned | `expired` (`closedReason: void`) |

`active` means "no claim yet". `resolved` and `expired` are closed for good: no action can move them again, and the API refuses the attempt with a message that says why.

An `expired` record also stores **why** it closed, because the same status covers three different stories:

| `closedReason` | Meaning | Can be extended? |
|---|---|---|
| `date` | the coverage ran out | Yes — extending makes it `active` again |
| `rejected` | an admin rejected the claim | No revival: the decision was about the claim, not the calendar |
| `void` | the order was cancelled or returned | Never |

#### 3b. Extending coverage

`PATCH /api/warranties/:id/extend` (admin) takes `{ months: 1–60, reason }` and adds real time:

- A record can be extended **at most 3 times** (`MAX_WARRANTY_EXTENSIONS`). The service refuses the fourth and the model validator refuses to save it; both dashboards show `n of 3 used` so the limit is never a surprise.
- The months are counted from **whichever is later** — the stored expiry date or today — so extending a lapsed warranty gives it months ahead instead of months already in the past.
- The extension is appended to `extensions[]` with the previous date, the new date, the reason and the admin's email, so the extra months can always be explained.
- `warrantyPeriodMonths` keeps the **original** promise; only `expiryDate` moves. Screens show the real total (`18 months (+6 extended)`) so a longer date is never unexplained.
- A lapsed record (`closedReason: date`, no claim) becomes `active` again. A rejected or void record keeps its status.
- Records with no coverage cannot be extended, and neither can records on a cancelled order.
- **Only an `extended-warranty` record can be extended.** A manufacturer, seller or other warranty covers exactly the period it was sold with, so the service answers those with a `400` and the dashboard hides the extend section for them (`EXTENDABLE_WARRANTY_TYPE` in `warranty.types.ts`).
- The customer is emailed the old date, the new date and the reason (best effort, like every warranty email).

#### 4. What the customer sees

1. After delivery, each covered line on the order page shows its warranty with the type, duration and expiry date.
2. On an `active` warranty the **Claim** form asks for a reason, a description and up to 5 photos. (The old `problem` dropdown was removed from the form; the API still accepts the legacy codes.)
3. Sending it turns the record into `claim_submitted` and emails the store inbox. A record that already holds a claim accepts no second one.
4. `resolved` shows the outcome the admin wrote; `expired` explains that the warranty or the claim is closed.

#### 5. What the admin does

1. *Dashboard → Warranties* opens on the claimed records (`status=claimed`), because a warranty nobody claimed needs no admin work; the status select, the warranty-type filter and the All view are one click away. Clicking a row opens one dialog with the coverage, the claim text and the photos. The **Extend** section only appears on an Extended warranty that can still take another extension.
2. The admin fills an **Internal Admin Note** and **Resolution Details**, then picks one of three actions: mark under review, resolve, or reject.
3. **Extend** adds months to the coverage of an **Extended warranty** with a required reason, up to three times, and the dialog lists every extension already granted with an `n of 3 used` counter. Other warranty types show no extend section at all.
4. The buttons lock while a request is in flight, and the API enforces the same rules a second time, so two decisions can never race each other.
5. **Email Customer** opens a composer that is already filled in from the claim — name, product, order number, reason, description and coverage — and sends it to the address stored on the record.

#### 6. Emails

Every message is sent **after** the database write, with an 8 second timeout, and a failure never fails the request that triggered it. The sender comes from `MAIL_FROM`; the store name and both recipient addresses are read from **Site Settings** (`siteName`, `supportEmail`, `contactEmail`), so the owner changes them in the dashboard instead of in a deployment.

The **look** is read from the same place, so a rebrand needs no redeploy. `getMailIdentity()` builds a `MailBrand` and every template draws from it:

| Site Settings | Becomes |
|---|---|
| `colorPalette.primary` | the 4px rule at the top of the card, and every button |
| `colorPalette.primaryDark` (falls back to `primary`) | the heading text |
| `colorPalette.accent` | the 3px rule under the header |
| `colorPalette.surface` | the page background behind the white card |
| `navbarLogo.light` (falls back to `footerLogo`) | the logo above the heading |
| `typography.primaryFont` | the font stack, ending in `Helvetica, Arial` because web fonts do not load in mail |
| `supportPhone`, `supportEmail` | the footer contact line |
| `NEXT_PUBLIC_CLIENT_URL` | the "view your order" / "open warranties" button |

When Site Settings cannot be read, `DEFAULT_BRAND` takes over, so an email is styled even with an empty settings record. The body stays inside what mail clients really render: nested divs, inline styles and solid colours — no flexbox, no stylesheets, no background images, and buttons are link blocks because a real `<button>` does nothing in a mailbox.

Every message leaves over **SMTP**, logging in as the mailbox in `SMTP_USER` (Nodemailer). The message goes out as that real address, so it reaches any customer and needs no domain to verify — only an app password from that same mailbox:

| Step | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (TLS from the first byte) |
| `SMTP_USER` / `SMTP_PASS` | the mailbox, and its 16-character **app password** |
| `MAIL_FROM` | the same mailbox with a name: `Sparq <you@gmail.com>` |

`MAIL_FROM` is sent exactly as written, so the display name survives. The address inside `<>` must contain an `@`: a bare domain such as `Sparq <yourshop.org>` reads like a sender but holds no mailbox, so the mailer refuses it before anything leaves and says so in the log, instead of passing on a vague "invalid sender". The connection steps keep an 8 second budget, because a serverless host may cut the handshake off.

Contact messages are the one exception to the "send after the write" rule: `POST /contact` stores the message **before** it tries to send, so a mail failure can never lose it. The record keeps the reason (`status: failed`, `error: ...`), and the visitor is told the message was received.

| Trigger | Recipient | Reply-to |
|---|---|---|
| Customer files a claim | the store inbox — `supportEmail` in Site Settings | the customer |
| Admin moves a claim | the customer | — |
| Order delivered and coverage issued | the customer, one email per item | — |
| Admin extends the warranty | the customer, with the old and new expiry date | — |
| Admin uses **Email Customer** | the customer | — |
| Admin replies to a contact message | the visitor who wrote it | — |
| Customer asks to reset their password | the customer, with a one-time link that works for one hour | — |

Warranty emails are **best effort**: a missing key or a rejected send is logged and never fails the claim, the delivery or the admin action. The exception is `POST /warranties/email/:id` — the admin asked for that email, so a failure comes back as `502` instead of a silent success. `POST /messages/:id/reply` behaves the same way, for the same reason, and so does the password reset: the customer is waiting for that link, so a failure is reported instead of swallowed.

#### 7. Expiry on a serverless host

`GET /api/warranties/expire` closes every warranty whose `expiryDate` has passed. It is guarded by `requireCronOrAdmin`, which accepts `Authorization: Bearer <CRON_SECRET>` or Vercel's own `x-vercel-cron: 1` header.

- On Vercel the sweep has to be **called by the platform**: `vercel.json` lists it as a daily cron (`30 18 * * *`, 00:30 Asia/Dhaka), because a serverless function keeps no process alive to schedule anything.
- Anywhere else, `node-cron` runs the same sweep at 00:30 on its own schedule, separate from the demo restore, so one failing job can never skip the other.
- Reads stay honest even if the sweep has not run: `withEffectiveStatus` reports a lapsed `active` record as `expired`, and `submitClaim` refuses a claim whose expiry date has passed. The sweep is what makes the stored status agree with the date.

#### 8. Guards worth knowing

- A claim is refused when the record is not `active`, when it has expired, or when it belongs to somebody else.
- `reason` and `description` are trimmed, so a message made only of spaces is rejected instead of being stored blank.
- At most 5 images per claim.
- `resolve` / `reject` without any resolution or note is refused — the customer must never see an unexplained status.
- An empty admin note never overwrites the previous one.
- Cancelling or returning a delivered order moves every open record of that order to `expired` (`closedReason: void`). Claiming and extending also re-check the order itself, so even a record closed for another reason (a rejected claim, say) cannot be revived after the goods went back.

### Reviews & ratings

A review has to be earned. All of these are checked server-side:

1. The caller is signed in and is not an admin.
2. They are not the product's own owner.
3. They have a **delivered** order containing that product.
4. They have not reviewed it before — one review per user per product.

`recalculateProductRating()` re-aggregates the product's rating and review count on every create, update and delete, so a stored rating is never stale. Editing is limited to the reviewer; deletion is allowed for the reviewer or an admin.

The rule is also enforced by a unique index on `{ userId, productId }`. That index cannot be built while two reviews for the same customer and product already exist — the server then logs `[REVIEW] Could not build the unique review index` and keeps running **without** the index, so a double submit is no longer caught. Clean up the old duplicates once with:

```bash
npm run dedupe:reviews               # report only, deletes nothing
npx tsx src/scripts/dedupe-reviews.ts --apply
```

The newest copy of each pair is kept (a second submit is usually a corrected rating), the older copies are deleted, and the index is rebuilt in the same run. Point `.env` at the database you want to clean.

### Catalog & cart

- **Cascade delete** — deleting a category also deletes its subcategories.
- **Delete guard** — the whole delete is cancelled if the category or any of its subcategories still has products.
- **Cart rows** — one row per item behind a compound unique index on `{ userId, productId }`, with the subtotal computed live.
- **Slider** — a slide references a real product; price, image and discount are read live. When a slide's countdown ends, the product's discount returns to 0 and its price to the original.
- **Promo banners are their own collection.** Each row carries a `name` (for the dashboard), a `placement` of `tile` or `strip`, an `order` and an `isActive` flag, plus the copy, image, link and badge the homepage shows. A banner reaches the storefront only when `isActive` is true **and** `image` is set, so a half-filled banner never leaves a gap; an empty `href` falls back to `/shop`. The copy is free text typed by the owner — nothing on the server names a product type — and the collection is in the demo-restore `TRACKED` list, so the nightly reset undoes a demo admin's banners too.
- **Stock tracking is optional.** A product saved with **no `stockQuantity`** is not stock-tracked: nothing checks it, nothing limits how many can be bought, checkout does not decrement it and a cancellation does not add anything back. Only a saved number turns stock rules on, and `formatProduct` reports such a product as available whatever an old flag says. The order and cancellation updates filter on `stockQuantity: { $ne: null }`, because `$inc` on a missing field would write `NaN`. Sending `stockQuantity: null` on an update clears a stored number, which puts the product back into the untracked state.
- **Brand for a manufacturer warranty.** When `warrantyType` is `manufacturer-warranty` (the default), the product must carry a `Brand` entry in `specifications` — the claim is filed with the brand, so the name is not optional. A supporting type — seller warranty, extended or other — does not need it.

### Store settings

One document drives the whole storefront: branding, fonts, palettes, logos, contact details, **opening hours** (multi-line, one day per line), the **About page copy** (`about.headline`, `intro`, `headquartersNote`, `openingHoursNote`, `ctaTitle`, `ctaDescription`), the **homepage brand marquee** (`brandLogos` — one row per partner logo with a `name`, a `logo` URL and an optional `href`; the whole band hides when the list is empty), shipping fees, free-shipping threshold, currency, default browse mode and the `maintenanceMode` flag. It is readable without a token so the storefront can render, and only an admin can change it. Empty About fields fall back to the store's built-in wording on the frontend. The document's own defaults are written for any kind of catalog — *Sparq - Premium Online Store*, *We Provide High Quality Products* — so a fresh store is never described as an electronics shop before the admin edits the text.

Homepage promo banners are deliberately **not** part of this document: each banner is its own row in the `promos` collection, so they can be named, ordered, switched on one by one and kept in any number. See the business rules below.

The brand marquee is the opposite case and stays **inside** this document as `brandLogos`: a logo has no state of its own — no order, no on/off switch — so replacing the whole list when the admin presses Publish is exactly what the owner expects.

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
| **Internal mail route** | `POST /mail/reset-password` is closed without `x-internal-key: <INTERNAL_API_KEY>`, so the store cannot be used to email a link of someone else's choosing. |
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

**Tracked collections** (`TRACKED` in `demo.plugin.ts`): `categories`, `subcategories`, `products`, `slides`, `productreviews`, `orders`, `orderstatuslogs`, `transactions`, `warranties`, `messages`, `sitesettings` and `user`.

`user` is the Better-Auth collection (singular because the auth library owns it). It is tracked even though the demo admin is blocked from most account routes: a role change is the one mistake that would outlive the nightly restore, so it is never left to a route guard alone.

Adding a new admin screen means adding its collection to that list — an untracked collection is edited by the demo admin and stays edited.

The response and the cron log name every collection that changed, for example `products -1/+1, user -0/+1`, so a nightly run is easy to audit.

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
- `bulkWrite` is not tracked (nothing in the codebase uses it today). Writes made with the raw driver, such as `collection.insertOne`, bypass Mongoose entirely and are invisible to the plugin — the restore is the only code that does that.

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
| `CRON_SECRET` | For cron | Long random string guarding the scheduled sweeps (`/api/demo/restore`, `/api/warranties/expire`, `/api/deliveries/expire`, `/api/vendor-subscription/expire`, `/api/promotions/expire`). Generate with `openssl rand -hex 24`. |
| `INTERNAL_API_KEY` | For password reset | Shared secret the storefront sends as `x-internal-key` to reach `POST /api/mail/reset-password`. The Next.js app holds the same value in its `INTERNAL_API_KEY`. Generate one with `openssl rand -hex 24`. |
| `DEMO_ADMIN_EMAIL` | No | Email of the shared demo admin. Default `admin@gmail.com`. |
| `CRON_TIMEZONE` | No | Timezone for the local jobs. Default `Asia/Dhaka`. |
| `SMTP_HOST` | No | Default `smtp.gmail.com`. |
| `SMTP_PORT` | No | Default `587` (STARTTLS). Use `465` for TLS from the start. |
| `SMTP_USER` | For email | The mailbox address, e.g. `you@gmail.com`. Nothing is sent until this and `SMTP_PASS` are set: warranty emails are skipped and logged, and contact messages are stored with `status: failed`. |
| `SMTP_PASS` | For email | A Gmail **app password** (16 characters, needs 2-Step Verification on). The account password is rejected. |
| `MAIL_FROM` | For email | The sender, and the mailbox every message leaves as: `Sparq <you@gmail.com>`, the same address as `SMTP_USER`. The part inside `<>` must contain an `@` — a value such as `Sparq <yourshop.org>` is refused by the mailer before it leaves, with a message that names the problem. |
| `STORE_INBOX` | No | Optional override. Claim notifications go to `supportEmail` from Site Settings; this is used only when that field is empty. |
| `CONTACT_INBOX` | No | Optional override. The contact page writes to `contactEmail` from Site Settings, falling back to `supportEmail`. |
| `STORE_NAME` | No | Optional override. The name in email subjects and bodies comes from `siteName` in Site Settings. |

```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
NEXT_PUBLIC_CLIENT_URL=your_frontend_app_url
CRON_SECRET=your_long_random_string
INTERNAL_API_KEY=your_long_random_string
DEMO_ADMIN_EMAIL=admin@gmail.com
CRON_TIMEZONE=Asia/Dhaka

# Email: SMTP through your own mailbox, so there is no domain to verify.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_16_character_app_password
MAIL_FROM="Sparq <you@gmail.com>"

# Optional: used only when the matching Site Settings field is empty.
# STORE_INBOX=
# CONTACT_INBOX=
# STORE_NAME=
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

**Deploying to Vercel** — set the same variables in the project settings and keep every daily cron:

```json
"crons": [
  { "path": "/api/demo/restore", "schedule": "0 18 * * *" },
  { "path": "/api/warranties/expire", "schedule": "30 18 * * *" },
  { "path": "/api/deliveries/expire", "schedule": "0 18 * * *" },
  { "path": "/api/vendor-subscription/expire", "schedule": "15 19 * * *" },
  { "path": "/api/promotions/expire", "schedule": "30 19 * * *" }
]
```

Schedules are UTC, so `18:00` is midnight and `18:30` is 00:30 in Asia/Dhaka; the two vendor sweeps run at 01:15 and 01:30 local, a period closing before the shelves it paid for are dimmed. On Vercel's Hobby plan a cron runs once a day with up to ±1 hour of drift; when the server runs elsewhere, the built-in `node-cron` jobs cover it. Both are listed because a serverless function has no long-lived process to schedule anything itself.

---

## 🛵 Rider & Delivery System

The `rider` role and the delivery domain are being added in seven phases, without a second authentication system.

- **Roles** — `admin`, `customer`, `rider`, `vendor`. `PATCH /api/users/:id` accepts the new roles; `requireAuth` re-reads the role from the database after a JWT check so a promotion or demotion applies on the next request.
- **No shopping** — `assertShopper` refuses cart, wishlist and review writes for admin, demo admin, rider and vendor accounts.
- **Ownership** — every rider endpoint will scope the query to the caller's token, never a body-supplied rider id.
- **Notifications** — the same `activities` collection carries the store's shared board and each person's own lines, and the same `GET /activities/mine` serves both: the role in the token decides which list "mine" is. The order service writes the customer copy next to every stage change.
- **Tracking transport** — the API stores only the latest rider position per delivery; the customer page polls it every 8 seconds (Vercel serverless friendly), and optional Ably keys publish the same message for instant updates.
- **Delivery model** — one `deliveries` collection: `orderId`, `riderId`, `assignedBy`, `status`, a denormalised customer/address copy, `fee`, `distanceKm`, `declineReason`, `expiresAt` and an append-only `history`. A partial unique index on `orderId` covers the active statuses, so an order can never have two live assignments.
- **Statuses** — `assigned`, `accepted`, `picked_up`, `out_for_delivery`, `delivered`, `cancelled`, `declined`. The lists accept the shortcuts `active` (`accepted`, `picked_up`, `out_for_delivery`) and `finished` (`delivered`, `cancelled`, `declined`).

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/deliveries` | rider | The caller's jobs. `status` (any status plus `all`, `active`, `finished`), `search` over order/customer/phone, `sort` = `newest`, `oldest`, `fee_desc`, `page`, `limit` (max 100) |
| `GET` | `/api/deliveries/stats?days=` | rider | Totals, completed, active, pending requests, cancelled, earnings (all time, this month, in the window), success rate, average delivery minutes, a daily series, the status breakdown and the last eight jobs |

Every rider read starts from the `riderId` in the verified token — no endpoint takes a rider id from the request.

**Progress:** Phase 1 ✅ roles, RBAC and no-shopping rules. Notifications ✅ one feed for every role, in-app + email. Phase 2 ✅ delivery model, `GET /api/deliveries` and `GET /api/deliveries/stats`. Assignment, the lifecycle, tracking and OTP follow in Phases 3–7.

---

## 📈 Project Status

| Area | State |
|---|---|
| Catalog (categories, subcategories, products, slides) | ✅ Complete |
| Cart & wishlist | ✅ Complete |
| Orders, status flow, status history | ✅ Complete |
| Payments & transactions | ✅ Complete (simulated gateway) |
| Loyalty points — earning, redemption, refunds, tiers | ✅ Complete |
| Warranties — issuance with copied terms, claims and customer replies, admin review, expiry sweep | ✅ Complete |
| Transactional email — claims, coverage, admin messages and the contact page, over SMTP from your own mailbox | ✅ Complete |
| Contact page messages | ✅ Complete |
| Reviews & rating recalculation | ✅ Complete |
| Store settings, branding, About page copy & opening hours | ✅ Complete |
| Demo admin sandbox with daily restore | ✅ Complete |
| Rider role, immediate role refresh and no-shopping guards | ✅ Complete |
| Delivery model, rider job list and rider stats endpoints | ✅ Phase 2 of 7 |
| Vendor applications, review desk, plans and billing | ✅ Complete |
| Seller workspace — storefront, catalogue with plan limits, subscription, order board, sales report, coupons and placements | ✅ Complete |
| Multi-vendor checkout — one fulfilment group per seller, synced with the parent order | ✅ Complete |
| Discount coupons — one engine for store-wide and per-seller codes, spent at checkout with a reversible ledger | ✅ Complete |
| Featured placements — dated placements bought with a plan or granted by the store team, swept to expiry daily | ✅ Complete |
| Customer & rider notifications — in-app feed and transactional email | ✅ Complete |
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
- [x] **Coupons & promo codes** — one server-validated engine for the store team's global codes and a seller's own codes, applied at checkout with a redemption ledger that reverses on cancellation.
- [x] **Featured promotions** — dated placements that a seller buys with their plan or the store team grants, one writer of the featured flag, a daily sweep that dims what lapsed.
- [ ] **Rider assignment & lifecycle** — admin assignment at `Shipped`, accept/decline, pickup to delivery, live location (Phases 3–5).
- [ ] **Public vendor storefronts & discovery** — per-shop pages under `/shop/`, featured shops and search.
- [ ] **"Lucky Box" rewards** — a gamified way to spend loyalty points.
- [ ] **Multi-tenant architecture** — a `tenantId` on every collection with per-store subdomains.
- [x] **Store onboarding & subscription plans** — self-serve application, admin review desk, three plans with enforced limits, demo billing, and the seller's own storefront, catalogue, order board and sales report.
- [ ] **Real-time store settings** — push changes to clients instead of polling.
- [ ] **Chat module** — real-time messaging between customers and support.

---

## ℹ️ About This Project

Not distributed under an open-source license. Feel free to explore the code, but please reach out before reusing or redistributing it.
