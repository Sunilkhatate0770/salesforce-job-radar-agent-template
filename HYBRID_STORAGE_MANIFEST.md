# 🛡️ Hybrid Storage Architecture Manifest (Hot-Cold Pattern)

## 🏗️ The Tiered Pattern
This project follows a **Strict Tiered Storage Pattern** to bypass the 512MB MongoDB Atlas limit while maintaining high-performance writes.

### 1. 🔥 Hot Tier (Primary Write: MongoDB)
- **Priority**: ALL new data MUST be saved to MongoDB first.
- **Role**: Handles active, recent, and high-frequency data.
- **Limit**: Strictly capped at ~1,500 records (Jobs) or ~500 records (Study Sessions).

### 2. 🧊 Cold Tier (Archival: Turso)
- **Role**: Permanent Archive / Overflow Storage.
- **Capacity**: 9.5GB (High-Capacity).
- **Flow**: Data only moves here via the `checkAndArchiveOverflow()` "Vacuum" engine.

---

## 🛠️ Developer Rules (Mandatory)

### ❌ DO NOT:
- Do not save new data directly to Turso via the API.
- Do not bypass the `checkAndArchiveOverflow` trigger in data-intensive routes.
- Do not use `INSERT` in MongoDB without checking the capacity count first.

### ✅ DO:
- **Write**: Use `JobRecord.findOneAndUpdate` or `UserProfile.save` in MongoDB.
- **Read**: Always use the `mergeUnique` logic to combine results from `TursoDB` and `MongoDB`.
- **Merge Logic**: Deduplicate items using a unique key (e.g., `job_hash` or `q` for bookmarks).

---

## 🚀 The Automated "Vacuum" Engine
Found in `api/router.js`:
The `checkAndArchiveOverflow(userId)` function is the guardian of your 512MB limit. It must be called at the end of data-fetching routes to ensure MongoDB remains lean by migrating old data to the Cold Tier (Turso).

---
**Last Updated**: 2026-04-26
**Architecture Status**: 🔒 LOCKED
