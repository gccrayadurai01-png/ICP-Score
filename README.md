# ICP Score — HubSpot Lead Scoring Tool

Automatically scores every HubSpot contact against your Ideal Customer Profile and writes `icp_score`, `icp_category`, and `icp_priority` back to each record.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure your HubSpot token
```bash
cp .env.example .env
# Edit .env and add your HUBSPOT_ACCESS_TOKEN
```

Create a **Private App** in HubSpot with these scopes:
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`
- `crm.objects.companies.read`
- `crm.schemas.contacts.read`
- `crm.schemas.contacts.write`

### 3. Create the custom HubSpot properties (run once)
```bash
npm run setup
```
This creates `icp_score`, `icp_category`, and `icp_priority` on your Contact object.

### 4. Start the app
```bash
npm start          # production
npm run dev        # development (auto-reload)
```

Open **http://localhost:3000** in your browser.

---

## Scoring Model

| Dimension | Max | Criteria |
|---|---|---|
| Company Size | 35 | >500 → 35 · 250-500 → 25 · 50-249 → 15 · <50 → 5 |
| Geography | 35 | US/CA/UK → 35 · EU/AU/India → 25 · Other → 10 |
| Industry | 10 | Software/IT → 10 · Finance/Health/Marketing → 8 · Education → 6 · Other → 4 |
| Technology | 10 | M365/Google WS → 10 · Dropbox/Box/Slack → 8 · Other cloud → 5 · None → 0 |
| Buyer Fit | 10 | CIO/CTO/CEO/IT Dir → 10 · IT Mgr/Admin → 7 · Consultant → 5 · Other → 0 |
| **Total** | **100** | |

| Score | Category | Priority |
|---|---|---|
| 80–100 | Core ICP | Highest Priority |
| 65–79 | Strong ICP | High Priority |
| 50–64 | Moderate ICP | Nurture |
| 0–49 | Non ICP | Low Priority |

---

## HubSpot Fields Used

| HubSpot Property | Object | Used For |
|---|---|---|
| `numberofemployees` | Company | Company Size score |
| `country` | Company (fallback: Contact) | Geography score |
| `industry` | Company | Industry score |
| `technologies` (configurable) | Company | Technology score |
| `jobtitle` | Contact | Buyer Fit score |

> To use a different tech stack field, set `TECH_STACK_FIELD=your_field_name` in `.env`.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Test HubSpot connection |
| `POST` | `/api/setup` | Create custom properties |
| `POST` | `/api/score/all` | Score all contacts (writes back to HubSpot) |
| `POST` | `/api/score/:contactId` | Score a single contact |
| `GET` | `/api/contacts` | List all contacts with ICP fields |
| `GET` | `/api/dashboard` | Aggregated stats for the dashboard |

---

## HubSpot Automation Workflow

To trigger scoring automatically when a record is updated:

1. In HubSpot, create a **Workflow** (Contact-based, trigger: Contact created or property updated)
2. Add a **Webhook** action pointing to `https://your-server.com/api/score/{{contact.id}}`
3. Method: `POST`

The app will score the contact and write results back immediately.
