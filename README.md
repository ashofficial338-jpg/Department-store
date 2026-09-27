# AURELIA Department Store

A premium, enterprise-grade Department Store Management / ERP / POS web application.

React (Vite) + Tailwind CSS frontend, Node.js/Express REST API, MongoDB/Mongoose backend. Covers authentication & role-based permissions, an executive dashboard, POS billing with GST, product/category/brand/batch management, inventory & DC (distribution center) workflows, vendors/suppliers/customers, purchasing, finance (accounts, GST, P&L), a reports center with CSV export, and an audit log.

> Branding ("AURELIA") is a placeholder — update `client/src/index.css`, `client/index.html`, `client/public/favicon.svg` and `server/seed/seed.js` company info to rebrand.

## 1. Requirements

- Node.js 18+
- MongoDB (local install, or a MongoDB Atlas cluster)

## 2. Project Structure

```
client/   React + Vite + Tailwind frontend
server/   Node.js + Express REST API + Mongoose models
```

## 3. Backend Setup

```bash
cd server
npm install
cp .env.example .env     # then edit .env as needed
```

Edit `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/department_store
JWT_SECRET=replace_with_a_long_random_string
```

For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string, e.g.:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/department_store?retryWrites=true&w=majority
```

**Seed demo data** (100+ products, categories, brands, vendors, suppliers, 60 customers, stores/DCs, ~60 days of sales & purchase history, expenses):

```bash
npm run seed
```

To wipe the database instead: `npm run seed -- --destroy`

**Run the API:**

```bash
npm run dev     # nodemon, http://localhost:5000
# or
npm start
```

## 4. Frontend Setup

```bash
cd client
npm install
npm run dev      # http://localhost:5173 (proxies /api to localhost:5000)
```

Production build: `npm run build` (outputs to `client/dist`), preview with `npm run preview`.

## 5. Demo Logins

The Super Admin logs in with **`AshwinLav@gmail.com`** / **`Admin@123`**. All other seeded users share the password **`Password@123`**.

To add/reset the Super Admin on an existing database without reseeding: `cd server && npm run seed:admin`.

| Role | Email |
|---|---|
| Super Admin | AshwinLav@gmail.com (password `Admin@123`) |
| Admin | admin@aurelia.test |
| Store Manager | storemanager@aurelia.test |
| DC Manager | dcmanager@aurelia.test |
| Cashier | cashier@aurelia.test |
| Accountant | accountant@aurelia.test |
| Purchase Manager | purchasemanager@aurelia.test |
| Inventory Manager | inventorymanager@aurelia.test |
| Sales Manager | salesmanager@aurelia.test |
| Auditor | auditor@aurelia.test |

Role → module access is defined in `server/config/permissions.js` (seeded into the `RolePermission` collection) and editable at **Settings → Roles & Permissions**.

## 6. API Overview

Base path: `/api`. JWT bearer auth (`Authorization: Bearer <token>`) required on everything except `/api/auth/login` and `/api/health`.

```
/api/auth            login, me, change-password
/api/users           user management (admin only)
/api/products         + /api/products/:id/images, /api/products/ai/extract-from-image
/api/categories /api/brands /api/stores /api/distribution-centers /api/suppliers /api/vendors /api/accounts
/api/batches
/api/inventory        overview, low-stock, expiry, ledger, adjust, transfers
/api/dc               inward, outward, stock
/api/customers
/api/sales             preview, create, resume, held, cancel, returns
/api/purchases          create, receive, pay, returns
/api/payments
/api/expenses
/api/gst               rates, summary, sales-report, purchase-report
/api/reports            sales, purchases, stock, batches, vendors, customers, products, dc, expenses, payments, outstanding, cash-bank, profit-loss (CSV via ?format=csv on the supported ones)
/api/dashboard          kpis, top-products, sales-trend, category-brand-sales
/api/audit-logs
/api/settings           company/system settings, roles
/api/notifications
/api/search             global search
```

Centralized error handling returns `{ success: false, message }`; validation/duplicate-key/cast errors are mapped to friendly messages automatically (`server/middleware/errorHandler.js`).

## 7. Core Business Flows (fully wired, not mocked)

- **POS sale** → `POST /api/sales` computes GST per line (`server/utils/gstCalculator.js`), deducts batch/inventory stock (FEFO batch selection), posts double-entry ledger entries, updates customer loyalty/outstanding, writes an `InventoryTransaction` audit trail, and generates a financial-year-scoped invoice number.
- **Sales return** → restocks or marks damaged, reverses ledger entries, updates the original sale's status.
- **Purchase order → Goods Receipt** → creates `Batch` records, increases inventory, and posts Accounts Payable on invoicing.
- **Stock Transfer / Inward DC / Outward DC** → every movement is traceable to a store/DC, user and timestamp via `InventoryTransaction`.
- **GST manual override** (POS line-level) requires a reason and is recorded to the audit log with old/new values (`server/controllers/salesController.js`).

## 8. AI Image → Product Creation

`Products → Create from Image` uploads an image and calls `POST /api/products/ai/extract-from-image`. No AI vision provider is configured out of the box — the endpoint honestly reports "not configured" rather than fabricating extracted fields (see `server/services/aiImageService.js`). To enable it, implement a provider call in that file and set `AI_IMAGE_PROVIDER` in `server/.env`.

## 9. Security Notes

- Passwords hashed with bcrypt; JWT auth; role-based route guards (`server/middleware/auth.js`).
- `express-mongo-sanitize`, `helmet`, rate limiting, and CORS restricted to `CLIENT_URL` are enabled in `server/server.js`.
- Database credentials only ever live in `server/.env` (gitignored) — never sent to the frontend.

## 10. What's Deep vs. Scaffolded

Fully wired end-to-end (real MongoDB-backed CRUD + business logic): auth & roles, dashboard, POS billing & GST, products/categories/brands/batches, inventory (overview/adjustment/transfer/ledger/low-stock/expiry), DC inward/outward, vendors/suppliers/customers, purchase orders/returns, sales/returns, payments, expenses, chart-of-accounts & ledger, GST reports, P&L, reports center with CSV export, audit log, settings, notifications, global search.

Present as clean extension points rather than fully built out: AI image-to-product extraction (abstraction only, no provider wired), thermal-printer integration (browser print is used for receipts), coupon/promotion engine, multi-step approval workflows beyond DC/PO status transitions, and multi-currency.
