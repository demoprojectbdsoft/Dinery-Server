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
| **Scheduled jobs** | Two daily jobs: one restores demo-admin edits, one expires lapsed warranties. |

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
│   ├── error.middleware.ts    one JSON error shape for the whole API
│   └── notFound.middleware.ts 404 for unknown routes
├── modules/
│   ├── address/               saved shipping addresses (one row per address)
│   ├── cart/                  cart items
│   ├── category/              top-level categories
│   ├── contact/               contact-page messages, saved then emailed to the store inbox
│   ├── demo/                  demo-admin write tracking + restore endpoint
│   ├── message/               stored contact messages, read in the admin dashboard
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
    ├── emailTemplates.ts      every email body, drawn with the brand from Site Settings
    ├── mailer.ts              Resend over HTTPS, or your own SMTP mailbox; never throws
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
| `PATCH` | `/orders/:id/customer-response` | Bearer | Customer reports `received`, `not_received` or `cancelled` after shipping |
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
| `POST` | `/warranties/claim/:id` | Bearer | Files a claim, or answers when the store asked for info. Body: `reason`, `description`, up to 5 `images`; `problem` is optional and legacy |
| `GET` | `/warranties` | Admin | All warranties, filterable |
| `PATCH` | `/warranties/claim/:id` | Admin | `mark_under_review`, `request_info` (note required), `resolve` / `reject` (resolution or note required) |
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
| `GET` | `/messages` | Admin | Paginated, newest first. Query: `status` (`all`, `sent`, `failed`), `search` (name, email or subject), `page`, `limit` |
| `DELETE` | `/messages/:id` | Admin | |

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
| `claim_submitted` · `under_review` · `info_requested` | admin | `mark_under_review` | `under_review` |
| `claim_submitted` · `under_review` · `info_requested` | admin | `request_info` — a note is required | `info_requested` |
| `info_requested` | customer | sends a reply | `claim_submitted` |
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
- The customer is emailed the old date, the new date and the reason (best effort, like every warranty email).

#### 4. What the customer sees

1. After delivery, each covered line on the order page shows its warranty with the type, duration and expiry date.
2. On an `active` warranty the **Claim** form asks for a reason, a description and up to 5 photos. (The old `problem` dropdown was removed from the form; the API still accepts the legacy codes.)
3. Sending it turns the record into `claim_submitted` and emails the store inbox.
4. When the store asks for more information the badge reads *Info Requested* and the same form becomes **Your Reply**: the reason is pre-filled, the box starts empty, and the reply is appended to `claimReplies` while the first description and photos stay untouched.
5. `resolved` shows the outcome the admin wrote; `expired` explains that the warranty or the claim is closed.

#### 5. What the admin does

1. *Dashboard → Warranties* lists every record. Clicking a row opens one dialog with the coverage, the terms, the claim text, the photos and the customer's replies.
2. The admin fills an **Internal Admin Note** and **Resolution Details**, then picks one of four actions: mark under review, ask for more info, resolve, or reject.
3. **Extend** adds months to the coverage with a required reason, up to three times, and the dialog lists every extension already granted with an `n of 3 used` counter.
4. The buttons lock while a request is in flight, and the API enforces the same rules a second time, so two decisions can never race each other.
5. **Email Customer** opens a composer that is already filled in from the claim — name, product, order number, reason, description, latest reply and coverage — and sends it to the address stored on the record.

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

There are three transports, and whichever credential exists wins in this order: Brevo, then SMTP, then Resend.

| When | Transport | Why |
|---|---|---|
| `BREVO_API_KEY` is set | Brevo's HTTPS API | Only a **sender address** has to be confirmed, never a domain, and Brevo keeps a delivery log per message. Free plan: 300/day |
| otherwise `SMTP_USER` + `SMTP_PASS` | SMTP through your own mailbox (Nodemailer) | Mail leaves as a real address, so it reaches customers with no domain to verify. Keep the timeouts short: a serverless host may cut the handshake off |
| otherwise `RESEND_API_KEY` | Resend's HTTPS API | The safe serverless path, but Resend only sends from a verified domain — or from `onboarding@resend.dev`, which reaches nobody except the account owner |

Contact messages are the one exception to the "send after the write" rule: `POST /contact` stores the message **before** it tries to send, so a mail failure can never lose it. The record keeps the reason (`status: failed`, `error: ...`), and the visitor is told the message was received.

```
Sending domain check
--------------------
sparq.bdsoft.org is a CNAME to Vercel, and DNS allows no record
under a CNAME, so send.sparq / rsend.sparq / resend._domainkey.sparq
can never be created. Verify the bare domain (bdsoft.org) instead,
and give Resend records named send, rsend and resend._domainkey.
```

| Trigger | Recipient | Reply-to |
|---|---|---|
| Customer files a claim | the store inbox — `supportEmail` in Site Settings | the customer |
| Customer replies to `info_requested` | the store inbox — `supportEmail` in Site Settings | the customer |
| Admin moves a claim | the customer | — |
| Order delivered and coverage issued | the customer, one email per item | — |
| Admin extends the warranty | the customer, with the old and new expiry date | — |
| Admin uses **Email Customer** | the customer | — |

Warranty emails are **best effort**: a missing key or a rejected send is logged and never fails the claim, the delivery or the admin action. The exception is `POST /warranties/email/:id` — the admin asked for that email, so a failure comes back as `502` instead of a silent success.

#### 7. Expiry on a serverless host

`GET /api/warranties/expire` closes every warranty whose `expiryDate` has passed. It is guarded by `requireCronOrAdmin`, which accepts `Authorization: Bearer <CRON_SECRET>` or Vercel's own `x-vercel-cron: 1` header.

- On Vercel the sweep has to be **called by the platform**: `vercel.json` lists it as a daily cron (`30 18 * * *`, 00:30 Asia/Dhaka), because a serverless function keeps no process alive to schedule anything.
- Anywhere else, `node-cron` runs the same sweep at 00:30 on its own schedule, separate from the demo restore, so one failing job can never skip the other.
- Reads stay honest even if the sweep has not run: `withEffectiveStatus` reports a lapsed `active` record as `expired`, and `submitClaim` refuses a claim whose expiry date has passed. The sweep is what makes the stored status agree with the date.

#### 8. Guards worth knowing

- A claim is refused when the record is not `active` (or `info_requested` for a reply), when it has expired, or when it belongs to somebody else.
- `reason` and `description` are trimmed, so a message made only of spaces is rejected instead of being stored blank.
- At most 5 images per claim; a reply that adds photos to a full set keeps the newest five.
- `request_info` without a note, and `resolve` / `reject` without any resolution or note, are refused — the customer must never see an unexplained status.
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
- **Stock tracking is optional.** A product saved with **no `stockQuantity`** is not stock-tracked: nothing checks it, nothing limits how many can be bought, checkout does not decrement it and a cancellation does not add anything back. Only a saved number turns stock rules on, and `formatProduct` reports such a product as available whatever an old flag says. The order and cancellation updates filter on `stockQuantity: { $ne: null }`, because `$inc` on a missing field would write `NaN`.
- **Brand for a manufacturer warranty.** When `warrantyType` is `manufacturer-warranty` (the default), the product must carry a `Brand` entry in `specifications` — the claim is filed with the brand, so the name is not optional. A supporting type — seller warranty, extended or other — does not need it.

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
| `CRON_SECRET` | For cron | Long random string guarding `/api/demo/restore`. Generate with `openssl rand -hex 24`. |
| `DEMO_ADMIN_EMAIL` | No | Email of the shared demo admin. Default `admin@gmail.com`. |
| `CRON_TIMEZONE` | No | Timezone for the local jobs. Default `Asia/Dhaka`. |
| `BREVO_API_KEY` | For email | Brevo API key. Only a sender address needs confirming in Brevo (Senders & Domains), no DNS records. Wins over the two transports below. |
| `RESEND_API_KEY` | For email | Resend API key. Ignored when Brevo or SMTP is configured. Without any transport nothing is sent: warranty emails are skipped and logged, and contact messages are stored with `status: failed`. |
| `MAIL_FROM` | For email | The sender, e.g. `Sparq <orders@yourdomain.com>`. With SMTP it must be the same mailbox you log in with. |
| `SMTP_HOST` | No | Default `smtp.gmail.com`. |
| `SMTP_PORT` | No | Default `587` (STARTTLS). Use `465` for TLS from the start. |
| `SMTP_USER` | No | The mailbox address, e.g. `you@gmail.com`. Setting this switches email from Resend to SMTP. |
| `SMTP_PASS` | No | A Gmail **app password** (16 characters, needs 2-Step Verification on). The account password is rejected. |
| `STORE_INBOX` | No | Optional override. Claim notifications go to `supportEmail` from Site Settings; this is used only when that field is empty. |
| `CONTACT_INBOX` | No | Optional override. The contact page writes to `contactEmail` from Site Settings, falling back to `supportEmail`. |
| `STORE_NAME` | No | Optional override. The name in email subjects and bodies comes from `siteName` in Site Settings. |

```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
NEXT_PUBLIC_CLIENT_URL=your_frontend_app_url
CRON_SECRET=your_long_random_string
DEMO_ADMIN_EMAIL=admin@gmail.com
CRON_TIMEZONE=Asia/Dhaka
RESEND_API_KEY=re_your_key
MAIL_FROM="Sparq <orders@yourdomain.com>"

# Optional: Brevo needs only a confirmed sender address, and logs every send.
# BREVO_API_KEY=xkeysib_your_key

# Optional: send as your own mailbox (no domain to verify) instead of Resend.
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=you@gmail.com
# SMTP_PASS=your_16_character_app_password

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

**Deploying to Vercel** — set the same variables in the project settings and keep both daily crons:

```json
"crons": [
  { "path": "/api/demo/restore", "schedule": "0 18 * * *" },
  { "path": "/api/warranties/expire", "schedule": "30 18 * * *" }
]
```

Schedules are UTC, so `18:00` is midnight and `18:30` is 00:30 in Asia/Dhaka. On Vercel's Hobby plan a cron runs once a day with up to ±1 hour of drift; when the server runs elsewhere, the built-in `node-cron` jobs cover it. Both are listed because a serverless function has no long-lived process to schedule anything itself.

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
| Transactional email — claims, coverage, admin messages and the contact page, through Resend or your own SMTP mailbox | ✅ Complete |
| Contact page messages | ✅ Complete |
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
