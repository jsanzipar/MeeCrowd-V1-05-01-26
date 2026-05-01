# Skill: review-push

Run this skill before every GitHub push to review progress against MeeCrowd's core goals and propose work for the next push.

## Trigger

Call this with `/review-push` or invoke it manually before committing a push.

## What This Skill Does

1. **Audits the current changeset** against MeeCrowd's core product pillars
2. **Reports pass/fail** for each pillar
3. **Proposes 3–5 concrete tasks** for the next push, ranked by impact

---

## MeeCrowd Core Goals (always evaluate against these)

MeeCrowd is a social event-scheduling platform for content creators and their audiences. Every push should move at least one of these pillars forward:

| # | Pillar | What "done" looks like |
|---|--------|------------------------|
| 1 | **Event Discovery** | Users can find upcoming streams/events across platforms (YouTube, Twitch, Kick, IG, TikTok, X, Facebook, LinkedIn) from a unified feed |
| 2 | **Crowd Engagement** | Viewers can like, bookmark ("Schedule"), comment on, and share events |
| 3 | **Creator Tools** | Creators can post events with time, platform, recurrence, thumbnail, and description — and see their crowd stats |
| 4 | **Identity & Profiles** | Users have public profiles with follower/following counts, platform links, and post history |
| 5 | **Monetisation Hooks** | Features that create a path to revenue: paid promotions, boosted posts, tier badges, or creator analytics |
| 6 | **Performance & Polish** | App feels fast, consistent, and native — no janky scrolls, broken layouts, or unhandled errors |

---

## How to Run the Review

### Step 1 — Gather the diff
```bash
git diff main...HEAD --stat
git log main...HEAD --oneline
```

### Step 2 — Evaluate each pillar
For each pillar, answer: **Did this push move it forward? (Yes / Partial / No)**
Write one sentence of evidence.

### Step 3 — Flag any regressions
Note anything that may have broken existing functionality (e.g., removed a screen, changed a type, broke a query key).

### Step 4 — Propose next push tasks
Pick 3–5 high-impact tasks from the list below (or identify new ones from the diff). Rank by:
- Closes the biggest user-facing gap
- Low implementation risk
- Builds on what was just shipped

---

## Standing Backlog (pick from here or add new items)

### Event Discovery
- [ ] Add category/topic tags to posts (gaming, music, sports…)
- [ ] "Near Me" filter using device location
- [ ] Trending algorithm: surface posts with fastest-growing engagement
- [ ] Push notifications for followed creator events

### Crowd Engagement
- [ ] Share post (native share sheet)
- [ ] Reaction types beyond like (🔥 Hype, 📅 Remind Me, etc.)
- [ ] Comment replies / threads
- [ ] Event RSVP / "I'll be there" button

### Creator Tools
- [ ] Edit / delete own posts
- [ ] Post analytics (views over time, peak engagement hour)
- [ ] Recurring event management (skip / reschedule instance)
- [ ] Thumbnail upload from camera roll (replace URL input)

### Identity & Profiles
- [ ] Follow/unfollow button on profile screen
- [ ] Platform verification badges
- [ ] Bio + website link on profile
- [ ] Block / report user

### Monetisation Hooks
- [ ] "Boost post" CTA (UI only, no payment yet)
- [ ] Creator tier badge (free / pro / verified)
- [ ] Sponsored post label
- [ ] Analytics dashboard screen

### Performance & Polish
- [ ] Optimistic UI for like/bookmark (no spinner flash)
- [ ] Skeleton loaders instead of ActivityIndicator on feed
- [ ] Error boundary on feed and profile screens
- [ ] Haptic feedback on like/bookmark
- [ ] Deep link support (meecrowd://post/[id])

---

## Output Format

Reply with a markdown report using this structure:

```
## MeeCrowd Push Review — [date]

### Pillar Scorecard
| Pillar | Status | Evidence |
|--------|--------|----------|
| Event Discovery | ✅ Yes | Added getFeed() with platform + category filters |
| Crowd Engagement | ✅ Yes | Like, bookmark, comment implemented |
| Creator Tools | ✅ Yes | Create post screen with time/recurrence |
| Identity & Profiles | 🟡 Partial | Profile screen exists, follow not yet wired |
| Monetisation Hooks | ❌ No | Not touched |
| Performance & Polish | 🟡 Partial | Scrollable body preview, no skeleton loaders yet |

### Regressions / Risks
- None detected

### Proposed Next Push (ranked)
1. **Follow/unfollow button** — Profile screen exists but the button is missing; high-visibility gap
2. **Optimistic like/bookmark** — Current UX flickers on every tap; quick win
3. **Edit/delete own posts** — Creators need basic content management
4. **Share post** — Native share sheet is 1 API call; completes the action bar
5. **Skeleton loaders** — Feed feels slow on first load without them
```
