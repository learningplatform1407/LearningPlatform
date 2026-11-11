# Social: following other learners

Learners can find each other by name, follow each other and open each other's
profiles. This page records the rules that decide who can see what, and why
they're shaped the way they are.

Code: `services/api/app/social/`; web `apps/web/src/app/(app)/profile/{people,[userId]}`;
mobile `apps/mobile/src/app/(app)/profile/`.

## The privacy rule

Everything hangs on one setting, `account_settings.profile_public`, which is
**off by default**.

|                                          | Private (default)    | Public                                                                                   |
| ---------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| Appears in search                        | No                   | Yes, by display name                                                                     |
| Can be followed                          | No                   | By any signed-in learner                                                                 |
| `GET /v1/users/{id}`                     | 404 to everyone else | Name, avatar, university, join date, counts and the same stats as their own Profile page |
| Listed as someone's follower or followee | No                   | Yes                                                                                      |
| Can follow public people                 | Yes                  | Yes                                                                                      |

- **Opt-in, not opt-out.** Turning on the feature for everyone at once would
  have made every existing learner searchable without asking them. The
  migration that adds the column leaves everyone private.
- **A public profile needs a display name** (422 `display_name_required`), both
  when switching it on and when clearing the name later. Search matches the
  name only, so a nameless public profile couldn't be found and would show up
  as "Unnamed" in other people's lists.
- **Private and unknown users get the same 404** (`user_not_found`). A
  different answer would confirm that a private account exists.
- **Going private doesn't delete follow rows.** Every read (search, lists,
  counts, profile) only counts users who are public _now_, so going private
  hides someone everywhere at once, and switching back restores their
  followers. Unfollowing and removing a follower still work against a private
  user, because they reveal nothing.
- **What is never shared:** email, lesson content, notes, highlights,
  flashcards and individual answers. A public profile shows aggregates only,
  computed by the same `build_profile_stats` (`app/users/stats.py`) that
  serves `/v1/me/stats`.

## Why one-way follow

There are no friend requests. Following is one-way and needs no approval;
the followee decides whether they can be followed at all through the setting
above. This keeps the model to one table (`follows`, PK
`(follower_id, followee_id)`) and one rule, instead of a request state machine.
`is_following` and `follows_you` on every row tell the client when a follow is
mutual, which features that need consent from both sides (challenges) build on.

You can remove a follower (`DELETE /v1/me/followers/{id}`). There is no block
yet: a removed follower can follow again while you are public.

## Endpoints

| Method        | Path                                   | Notes                                                                                                                                                                 |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET           | `/v1/users/search?q=`                  | Public users whose name contains `q` (2–50 characters, `%` and `_` matched literally), excluding the caller, sorted by name, at most 20. Shorter queries return `[]`. |
| GET           | `/v1/users/{id}`                       | `PublicProfileResponse`; 404 unless public or the caller.                                                                                                             |
| POST / DELETE | `/v1/users/{id}/follow`                | Idempotent; 204. Following yourself is a 400.                                                                                                                         |
| DELETE        | `/v1/me/followers/{id}`                | 204.                                                                                                                                                                  |
| GET           | `/v1/me/following`, `/v1/me/followers` | Public users only.                                                                                                                                                    |

Search uses `ILIKE '%q%'` with no index. That is fine for one institution's
learners; a `pg_trgm` index is the follow-up if the user count grows.

## Clients

Social lives under Profile on both platforms rather than in a new tab (the
phone tab bar already has six): your Profile shows follower and following
counts and a "Find people" button, which open `/profile/people` (Search,
Following and Followers). Each row opens `/profile/[userId]`, which renders the
shared `ProfileStats` block. Settings → Privacy holds the switch.

The query keys are shared by both apps: `["user-search", q]`, `["following"]`,
`["followers"]`, `["user", id]`. Following flips every cached copy of the
button at once and puts it back if the request fails
(`apps/web/src/lib/use-follow.ts`, `apps/mobile/src/lib/social.tsx`).
