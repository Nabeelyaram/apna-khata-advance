# Apna Khata Advance - Project Hand-Off Document
**Standalone Personal & Family Financial Ledger (PWA)**  
*Deployment URL:* [apna-khata-advance.vercel.app](https://apna-khata-advance.vercel.app/)  
*GitHub Repository:* [github.com/Nabeelyaram/apna-khata-advance](https://github.com/Nabeelyaram/apna-khata-advance)  
*Supabase Project:* `https://yzhrhgcbpbhpotropcbg.supabase.co`  
*Version:* 2.0.0 (Production Ready)

---

## 1. Executive Summary & Architecture
**Apna Khata Advance** is a modern, standalone, installable Progressive Web Application (PWA) built specifically for personal and family financial tracking. It is completely isolated from any previous projects (including Maqsood Karyana Store) with its own dedicated Supabase database, GitHub repository, and Vercel hosting.

### Key Capabilities:
1. **Zaati Private Khata (Other Khata):**
   - Confidential, single-user ledger completely hidden from family members.
   - Matches the high-contrast People Ledger UI with 3 Grand Total Stat Cards:
     - `Kul lene hain` (Sab logon se)
     - `Kul dene hain` (Sab logon ko)
     - `Net total` (Solid dark green card indicating overall balance)
   - Matches the **Person Wise Balance** card grid showing each individual contact (e.g. *Ghulfam*, *Rabia sis*), current balance, and net status.
2. **Family Tree & Shared Khata Directory:**
   - Real-time directory of all family members who joined via the 6-character Invite Code.
   - Displays Name, Family Role, Phone Number, and Join Date.
   - **Audit Trail:** Every shared entry and household expense displays who entered it: `👤 Entry darj ki: [Name] ([Role])`.
3. **Household Budget & Auto-Sync:**
   - Month-wise income and expense tracking with animated comparison bars.
   - Monthly rollover feature to carry unspent savings forward into the next month.
   - Auto-sync prompt when adding a family transaction asking whether giving or receiving money should adjust the household budget.
4. **Committee / Kameti Tracker:**
   - Total pool calculation, monthly installment, total duration, and payout turn tracking.
5. **Complete Offline Mobile Backups:**
   - **Excel Workbook (.xls):** 1-Click download of a clean XML spreadsheet readable by Microsoft Excel and Google Sheets.
   - **PDF Report:** Clean printable document formatted for standard A4 mobile viewing and printing.
   - **JSON Backup:** Offline data copy to restore or archive records.
6. **Privacy & Anonymity:**
   - Strictly zero hardcoded creator or personal names (no "Nabeel" anywhere in the app interface).

---

## 2. Infrastructure & Credentials Overview

| Service | Identifier / URL | Purpose |
| :--- | :--- | :--- |
| **Hosting** | `https://apna-khata-advance.vercel.app/` | Production Web & PWA Host |
| **Git Repository** | `https://github.com/Nabeelyaram/apna-khata-advance.git` | Source code version control |
| **Supabase Database** | `https://yzhrhgcbpbhpotropcbg.supabase.co` | Cloud PostgreSQL database & REST API |
| **Anon Public API Key** | Defined in `config.js` | Client-side Supabase REST authentication |

---

## 3. Database Schema & Data Safety Guarantee

### ⚠️ Permanent Protection Against Data Loss
In earlier iterations, running the database script wiped tables because it contained `DROP TABLE IF EXISTS ... CASCADE`.
**This has been permanently fixed:**
- All tables now use `CREATE TABLE IF NOT EXISTS`.
- All columns use non-destructive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Functions use `CREATE OR REPLACE FUNCTION`.
- **Result:** You can run `supabase_setup.sql` in Supabase SQL Editor any number of times in the future to apply patches, and **not a single row of data, user account, or transaction will ever be erased**.

### Data Tables Overview:
1. `families`: Family group name and unique 6-digit invite code.
2. `app_users`: User credentials (hashed with bcrypt via pgcrypto), assigned role, phone, and soft-delete status (`is_active = true/false`).
3. `app_sessions`: 90-day cryptographically secure session tokens.
4. `khata_entries`: Ledger transactions containing `is_private` flag, `person_name`, `entry_type`, `amount`, and `user_name` / `user_role` audit snapshots.
5. `committees`: Committee pools, monthly installments, durations, and payout turns.
6. `committee_records`: Monthly installment payments and payout recordings.
7. `household_finance`: Income and expense categorization for the family budget.
8. `month_rollovers`: Monthly carried-forward positive savings.

---

## 4. Fix for Profile Switching & Service Worker Cache
### Issue Root Cause:
The service worker (`sw.js`) previously cached `index.html` and `app.js` using a cache-first strategy. When new versions were deployed or another user visited the site on the same browser, the browser served the stale cached HTML/JS until a hard refresh (`Ctrl + F5`) was executed.

### Resolution:
1. **Network-First Service Worker Strategy (`sw.js` v2):**
   - The service worker now always tries to fetch fresh HTML and JS from the network first. Cache is only used as an offline fallback.
2. **HTTP Cache-Control Headers:**
   - Added `Cache-Control: no-cache, no-store, must-revalidate` in `index.html`.
3. **Session Purge on Logout:**
   - Clicking **Logout** completely purges `localStorage`, `sessionStorage`, all state memory arrays, and form input values, preventing any cross-profile data leakage on shared devices.

---

## 5. UI Elements Matched to Requirements

```
+-------------------------------------------------------------------------+
| PEOPLE LEDGER                                                           |
| Other Khata                              [ Har person ka separate balance ] |
| Baaki logon se lene aur un ko dene wale paison ka alag hisaab.          |
+-------------------------------------------------------------------------+
| [ Kul lene hain ]       [ Kul dene hain ]       [ Kul dene / lene hain ]|
|   Rs 0 (Green)            Rs 9,070 (Blue)         Rs 9,070 (Solid Green)|
|   Sab logon se            Sab logon ko            Net total             |
+-------------------------------------------------------------------------+
| PERSON WISE BALANCE                                                     |
| Har person ka total                                                     |
|                                                                         |
| +---------------------+   +---------------------+   +-----------------+ |
| | Ghulfam             |   | Rabia sis           |   | Usman           | |
| | Is person ko dene   |   | Is person ko dene   |   | Is person se le | |
| | Current balance     |   | Current balance     |   | Current balance | |
| | ------------------- |   | ------------------- |   | --------------- | |
| | Rs 2,870 (Green)    |   | Rs 6,200 (Green)    |   | Rs 1,500        | |
| +---------------------+   +---------------------+   +-----------------+ |
+-------------------------------------------------------------------------+
```

---

## 6. How to Run & Maintain the Application

### A. Deploy Updates to GitHub & Vercel
In the project directory (`Apna-Khata-Advance`):
```bash
git add .
git commit -m "Final production hand-off: matching people ledger UI, network-first SW, non-destructive SQL"
git push origin main
```
Vercel automatically builds and updates the live site at `https://apna-khata-advance.vercel.app/` within 30 seconds.

### B. Applying Database Patches in Supabase
1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/yzhrhgcbpbhpotropcbg).
2. Go to **SQL Editor** on the left menu.
3. Paste the contents of `supabase_setup.sql` and click **Run**.
4. Since all statements are non-destructive, all your existing family data remains 100% intact.

---

## 7. Sign-Off & Verification Checklist
- [x] **Zati Khata (Other Khata):** Matches Image 1 (3 Grand Total Cards) and Image 2 (Person Wise Balance Grid).
- [x] **Family Tree:** Lists all active members with name, phone, role, and joined date.
- [x] **Shared Entries Audit:** Every entry displays who made it (`👤 Entry darj ki: [Name] ([Role])`).
- [x] **No Ctrl+F5 Requirement:** Network-First service worker ensures fresh load across sessions.
- [x] **Clean Profile Switching:** Logging out wipes state and forms so new users never see another profile.
- [x] **Zero Data Loss Guarantee:** Non-destructive SQL scripts preserve tables and rows permanently.
- [x] **Offline Mobile Backups:** Excel (.xls), PDF, and JSON downloads verified.
- [x] **Complete Anonymity:** Zero developer/personal names hardcoded in UI.
- [x] **PWA Install Ready:** Luxury financial growth icon configured for mobile home screen installation.
