# Architecture Tradeoffs — Neon, Vercel, Railway

## Why Neon for Postgres

This Eid app is seasonal — heavy around Eid, quiet the rest of the year. Neon fits that pattern:

- **Serverless Postgres that scales to zero when idle** — you aren’t paying full-time for a always-on DB during off-season.
- **Database branching** — instant, git-like copy-on-write branches for safe experiments / previews without cloning prod data the hard way.
- **Separation of concerns** — Neon hosts *only* the relational database. Compute (Express) and vectors (Qdrant) stay elsewhere. That keeps failure domains and billing clearer.

Neon is **not referenced by name in code**. The app uses Sequelize + `dialect: 'postgres'` and `DB_*` env vars. Neon is just the cloud host those vars point at.

Docs: [Neon introduction](https://neon.tech/docs/introduction) · [branching](https://neon.tech/docs/introduction/branching)

## Neon vs “put everything on Railway”

| Approach | Pros | Cons |
|---|---|---|
| **Neon (DB) + Vercel (API/UI) + Qdrant Cloud** | Scale-to-zero DB; clear SOC; managed branching; matches seasonal traffic | More platforms to configure; wire env vars carefully |
| **Railway hosts “everything”** | One vendor for Node + maybe Postgres + volumes | Easier to blur concerns; always-on habits; you still need a vector store story |

Even if Railway *can* host Postgres + Node together, keeping Neon for the DB still helps **separation of concerns**: app compute ≠ durable relational data ≠ vector index.

## Related choices (short)

- **Vercel for Express** — Function/Fluid compute; no long-lived `listen` in prod path; watch cold starts, `maxDuration`, and dynamic `require` bundling (see `pg` bug in troubleshooting journal).
- **Qdrant Cloud** — vectors for RAG; not Neon’s job. Don’t overload Postgres as a vector DB for this pipeline.
- **Local Docker Qdrant / local Postgres** — fine for dev; production needs cloud hosts.

## One-liner for resume / standup

Chose Neon serverless Postgres (scale-to-zero + branching) for a seasonal Eid app, keeping DB separate from Vercel compute and Qdrant retrieval.
