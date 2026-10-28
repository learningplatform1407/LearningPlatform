# Password reset

Email-based password recovery for people who cannot log in, plus the
change-password form for people who can. Both are one Supabase Auth call each
(`resetPasswordForEmail`, `updateUser`), so the interesting part of this
document is not the calls — it is the two places where a recovery session
collides with the route guards we already have, and the one piece of the UI
that must deliberately stay uninformative.

Nothing here touches `services/api`. Web and mobile both authenticate against
Supabase directly (see the request-flow diagram in the root `README.md`), and
recovery is entirely inside that relationship. No new table, no migration, no
endpoint.

## 1. The eight decisions

1. **The UI never reveals whether an email is registered.** One neutral
   confirmation for every submission. §2.
2. **Web recovery lands on a route handler, not a page.** `/auth/confirm`
   exchanges the token for a cookie session with
   `verifyOtp({ type: "recovery", token_hash })`. §4.
3. **`/reset-password` requires the recovery marker, not just a session.** A
   recovery link mints an ordinary session, so a session-only gate would make
   that page a takeover from any logged-in browser. §4.
4. **Mobile gets a third navigator branch.** A recovery session satisfies
   `guard={!!session}`, which would drop the user into `(app)` before they have
   set a password. §5.
5. **Recovery state is set explicitly by the deep-link handler**, not inferred
   from an `onAuthStateChange` event name. §5.
6. **The mobile URL scheme changes from `mobile` to `learningplatform`** before
   any email carries it. §5.
7. **Change-password reuses the same `updateUser` call**, so `settings/account`
   gets it for the cost of a form. §6.
8. **Any password change signs the user out everywhere, this session
   included**, whether it came from a reset link or from Settings. Both end at
   `/login?changed=1`. §6.

## 2. Why the form cannot tell you whether the email exists

The obvious shape for this feature is "look up the address, and if we have it,
send a mail." Supabase does not expose that, and the omission is the point.

`resetPasswordForEmail` resolves to `{ data: {}, error: null }` whether or not
the address belongs to an account. There is no field to inspect and no
companion "does this user exist" API. An endpoint that answered truthfully
would be an account-enumeration oracle: anybody could test an arbitrary email
and learn whether that person studies here. For a platform holding student
accounts tied to one institution, that is a disclosure about real people, not
a cosmetic concern.

So the server decides whether a mail goes out, and the client learns nothing:

```ts
await supabase.auth.resetPasswordForEmail(email, { redirectTo });
// → { data: {}, error: null }, both for a known and an unknown address
```

The screen therefore always says the same thing — _"If that address has an
account, we've sent a reset link."_ — and the submit handler branches only on
transport failure, never on whether a user was found.

Two consequences worth stating so they are not later mistaken for bugs:

- **A typo produces a success message.** That is correct. The alternative
  leaks.
- **Rate limiting is the one honest signal.** Supabase throttles recovery
  mails per address and per IP; a `429` surfaces as a real error, because
  refusing to explain a rate limit is worse than admitting one exists. A `429`
  still does not disclose whether the address was registered.

Do not "improve" this later by adding an existence check. If a future
requirement genuinely needs one — say an admin inviting a known cohort — it
belongs behind an admin-only, `require_admin`-gated backend endpoint, not on
an anonymous form.

## 3. The flow, end to end

```
unauthenticated                             Supabase                  app
───────────────                             ────────                  ───
/forgot-password
  submit email ──── resetPasswordForEmail ──▶ decides whether
                                              to send
  neutral confirmation ◀──────────────────── { error: null }

  (mail arrives, if the account exists)
  click link ─────────────────────────────▶ verify endpoint
                                              │
                      web:    redirects to /auth/confirm?token_hash=…&type=recovery
                      mobile: redirects to learningplatform://reset-password?token_hash=…

  /auth/confirm (web)        ─── verifyOtp({ type: "recovery", token_hash }) ──▶ session
  deep-link handler (mobile) ─── same call ────────────────────────────────────▶ session

/reset-password
  submit new password ──── updateUser({ password }) ──▶ password changed
                      ──── signOut({ scope: "global" }) ──▶ every session dies
  ────────────────────────────────────────────────────▶ /login?changed=1
```

The session minted by step 3 is a **real, full session**. Supabase does not
issue a restricted "may only change password" token. That single fact is the
source of both complications below.

## 4. Web: the proxy interaction

`src/proxy.ts` (Next 16's rename of `middleware.ts` — see `apps/web/AGENTS.md`)
runs on every matched request. Before this feature it enforced two rules over
one list:

```ts
const PUBLIC_PATHS = ["/login", "/signup"];
if (!user && !isPublicPath) redirect("/login");
if (user && isPublicPath) redirect("/");
```

That shape cannot express what these three
paths need, because "public" conflates two different questions: _may a
signed-out reader see this_, and _may a signed-in one_. So the list splits,
and `/reset-password` gets a rule of its own:

| Path               | Rule                                       | Why                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`           | `SIGNED_OUT_PATHS` — signed out only       | Unchanged.                                                                                                                                                                                                                    |
| `/signup`          | `SIGNED_OUT_PATHS` — signed out only       | Unchanged.                                                                                                                                                                                                                    |
| `/auth/confirm`    | `SESSION_AGNOSTIC_PATHS` — either state    | It redeems the token, so it must run regardless. Treating it as signed-out-only silently discards the link of anyone who happens to already be logged in on that browser.                                                     |
| `/forgot-password` | `SESSION_AGNOSTIC_PATHS` — either state    | Requesting a mail is harmless in either state, and somebody logged in who cannot remember their password is exactly who the "Reset it by email" link in `settings/account` is for. Signed-out-only would make that link dead. |
| `/reset-password`  | session **and** the recovery marker cookie | A session alone is the wrong gate — see below.                                                                                                                                                                                |

### Why a session is not enough for `/reset-password`

This is the trap. A recovery link produces an **ordinary full session**, so
"is signed in" cannot tell apart the person who just proved they own the
mailbox from anyone who walked up to an unlocked laptop. And that page sets a
new password **without asking for the current one**.

Gate it on a session and `/reset-password` becomes a one-click account
takeover from any logged-in browser — which also reduces the current-password
check in `settings/account` (§6) to decoration, since the attacker just uses
the other page.

So `/auth/confirm` sets a marker cookie (`lib/recovery-cookie.ts`) when it
redeems a `recovery` token, the proxy verifies it alongside the session, and
the reset action re-checks and deletes it. A signed-in reader without a valid
marker is sent to `/settings/account`, which is the page they actually wanted;
one without a session goes to `/login`, which is right for a stale bookmark.

**The marker is signed, and the first version of it was broken.** It began as
the literal string `"1"`, on the reasoning that `httpOnly` kept scripts away
from it. That is a misreading of what `httpOnly` buys: it stops page scripts
_reading_ a cookie, and does nothing about a person at the keyboard _writing_
one. The attacker in this threat model is sitting at the browser with devtools
open, and `document.cookie = "lp-recovery=1; path=/"` is two seconds of work.
The server cannot tell a forged flag from a real one when both are the same
three characters, so the gate was decorative.

The value is now `<userId>.<expiry>.<hmac>` signed with a server-only
`RECOVERY_MARKER_SECRET`. Forging it needs the secret; a genuine marker lifted
from another account fails because the signature covers the id and the proxy
checks it against the live session; and the expiry is inside the signature, so
editing the cookie's own `Max-Age` cannot revive a stale one. `httpOnly`
stays, as hygiene rather than as the security property. `proxy.test.ts` covers
each of those three forgeries.

Web Crypto, not `node:crypto`: verification happens in `proxy.ts`, which runs
on the Edge runtime.

`sameSite: "lax"`, not `strict`: the navigation that has to carry the cookie
is a top-level GET arriving from Supabase's verify endpoint, and `strict`
would drop it there — sending every genuine reset to `/settings/account`.

The gate matches `/reset-password` **and its sub-paths**. An exact-match check
would let a later `/reset-password/done` fall through to the allow-by-default
branch for signed-in readers, which is the same takeover by a different door.

A future alternative that needs no secret is the access token's `amr` claim —
server-signed, so equally unforgeable, reading `password` for a password login
and `otp` for a recovery. Not adopted yet because the exact method string
Supabase stamps for `type: "recovery"` cannot be verified from this repo, and
guessing wrong fails closed on every genuine reset.

This is deliberately the same shape as mobile's `isRecovering` flag (§5):
recovery state owned by the code that handled the link, never inferred from
the session. `proxy.test.ts` covers each row of the table above, because these
rules are now a security boundary rather than navigation convenience.

The route handler is a `route.ts` with a `GET` export, which Next 16 permits
anywhere in `app/` except alongside a `page.tsx` at the same segment — hence
`app/auth/confirm/route.ts` rather than hanging it off `/reset-password`
itself. On success it redirects to `/reset-password`; on a consumed or expired
token it redirects to `/forgot-password?error=expired` so the page can explain
what happened and offer to send another.

Its `next` parameter is validated down to a same-origin relative path before
it reaches `redirect`. The handler's whole job is to mint a session, so
reflecting an attacker-supplied destination would be an open redirect that
carries live credentials with it. `//elsewhere.test` is rejected alongside
absolute URLs, since browsers read a protocol-relative URL as another origin.

`/forgot-password` and `/reset-password` are server actions in the shape
`login/actions.ts` already uses — `useActionState`, a `{ error: string | null }`
state object, `AuthLayout` for chrome. There is no reason for this feature to
invent a second form idiom.

## 5. Mobile: the deep link and the third guard

`src/app/_layout.tsx` splits the navigator on session presence:

```tsx
<Stack.Protected guard={!session}>      {/* login, signup */}
<Stack.Protected guard={!!session}>     {/* (app) */}
```

A recovery session is a session, so the moment `verifyOtp` resolves, the
second branch wins and the user is inside `(app)`. A `reset-password` screen
placed next to `login` would unmount underneath them mid-flow.

The fix is a third branch, and a flag that the deep-link handler sets itself:

```tsx
<Stack.Protected guard={!session && !isRecovering}>   {/* login, signup */}
<Stack.Protected guard={isRecovering}>                {/* reset-password */}
<Stack.Protected guard={!!session && !isRecovering}>  {/* (app) */}
```

### A third link shape, because mobile is not PKCE

`supabase.ts` leaves `flowType` at its default, which auth-js sets to
`implicit` — unlike `@supabase/ssr`, which hardcodes `pkce`. So the same
default `{{ .ConfirmationURL }}` template that hands web a `?code=` hands
mobile the session itself, in the fragment:

```
learningplatform://reset-password?flow=recovery#access_token=…&refresh_token=…
```

`lib/recovery-link.ts` therefore accepts two shapes — fragment tokens, which
it redeems with `setSession`, and a `token_hash` from the custom template,
which it redeems with `verifyOtp`. Same reasoning as the web handler's two
arms: which one arrives is a dashboard setting and the app should not care.

It parses the URL by hand rather than with `Linking.parse`, which does not
surface the fragment at all, and rather than `URLSearchParams`, whose React
Native polyfill is incomplete. Keeping parsing separate from redeeming is
what makes it testable without a device — `recovery-link.test.ts` covers the
Expo Go `exp://` form, percent escapes and a malformed one.

The redirect comes from `Linking.createURL`, never a literal
`learningplatform://` string: in Expo Go the app has no custom scheme and is
reached over `exp://<lan-ip>:8081/--/…`, so a hardcoded scheme would never
open during development. Both forms need to be on the Supabase allow-list.

`isRecovering` lives in `auth-context.tsx` alongside `session`. It is set
**explicitly** by the code that handles the incoming link and cleared once
`updateUser` succeeds — deliberately not derived from an `onAuthStateChange`
event name. With `detectSessionInUrl: false` (see `lib/supabase.ts`, where it
is off because React Native has no URL for supabase-js to inspect) the
recovery token is redeemed by our own `verifyOtp` call, and which event that
emits is a supabase-js implementation detail navigation should not hang on.
Owning the flag keeps the state machine ours.

Because the flag gates the app stack, its lifetime matters: it is in-memory
only, so a user who kills the app mid-reset lands in `(app)` with their old
password still valid. That is an acceptable failure — nothing is
half-changed — and it is why the flag does not need to be persisted into
`LargeSecureStore`.

### The scheme rename

`app.json` still carries `"scheme": "mobile"`, the `create-expo-app`
placeholder. It becomes `"learningplatform"`.

This has to happen **before** the first recovery mail ships, not after. A
scheme is baked into every link Supabase sends, so changing it later breaks
every email already sitting in an inbox — and those links belong to exactly
the people who cannot get in. Right now the rename costs one line:
`expo-linking` is a declared dependency with no call sites, and the app has no
deep links at all, so nothing else in the tree depends on the old value.

`mobile://` is also the kind of generic scheme any other app may claim, which
on Android resolves to whichever app the OS feels like. `learningplatform://`
is verbose and unambiguous, and users never type it.

## 6. Change password, for people who are already in

`settings/account` currently offers only sign-out, on both platforms. The same
`updateUser({ password })` call that ends the recovery flow is the whole
feature here, so it ships alongside rather than as separate work.

One difference worth keeping: an authenticated change asks for the **current**
password as well, and verifies it with a throwaway `signInWithPassword` before
calling `updateUser`. Supabase does not require this — a valid session is
enough — but without it, anyone who picks up an unlocked phone can silently
take over the account. Recovery skips the check because possession of the
mailbox is the proof.

### Both paths revoke every session, including the current one

A successful change ends with `signOut({ scope: "global" })` — from the reset
link and from Settings alike — and then redirects to `/login?changed=1`.

By default Supabase leaves existing sessions alive across a password change,
which quietly defeats the most common reason for changing it: the user thinks
somebody else is in their account. Changing the password without evicting that
person fixes nothing they care about.

**One rule, not two.** An earlier draft revoked only on recovery, reasoning
that someone using Settings is demonstrably in control of the account. That
distinction is real but useless to the person making the choice: somebody who
suspects a housemate knows their password may well reach for Settings rather
than the emailed link, and would get the weaker behaviour for picking the more
obvious door. A security rule nobody can predict is not a feature.

**`global`, not `others`**, so the session that made the change dies with the
rest. On the recovery path this matters most: that session was minted by
whoever opened the mailbox, and treating it as proof of identity for the rest
of the day is exactly the assumption a stolen mailbox breaks. Settings follows
the same rule for consistency — "everything is logged out" should be literally
true, not true-except-here.

The cost is one extra login, and `redirect` targets reflect it: `/login`
rather than `/learn`, since there is no session left to carry anyone into the
app. A plain redirect would be hostile on its own, though — arriving back at
the login form straight after setting a password reads as a failed reset, and
the natural response is to request another link. So both flows pass
`?changed=1` and `login/password-changed-notice.tsx` explains the sign-out.
That component is split out and `Suspense`-wrapped because `useSearchParams()`
opts its caller into request-time rendering, and there is no reason for the
whole form to pay that.

Both forms also say what will happen before it happens. Being signed out on
your phone an hour later is indistinguishable from a bug.

## 7. What has to be configured outside the repo

`infra/supabase/` holds a README and no `config.toml`, so Auth is configured in
the hosted dashboard. Three things, none of which are code, and all of which
will silently half-work if skipped:

1. **Redirect allow-list.** `.../auth/confirm` for every web origin (local,
   preview, production) and `learningplatform://reset-password` for mobile.
   An unlisted `redirectTo` is ignored and the user is sent to the site root,
   where they will stare at the dashboard wondering why nothing happened.
2. **Custom SMTP** — before real users, not before testing. The built-in
   sender is rate-limited to a handful of mails per hour and is documented as
   unsuitable for production; it throttles without surfacing an error anyone
   can act on.
3. **The recovery email template**, which _depends_ on step 2: Supabase gates
   template editing behind custom SMTP. That dependency is why
   `/auth/confirm` accepts **both** link shapes rather than only the better
   one.

   - The **default** `{{ .ConfirmationURL }}` produces `?code=`, the PKCE arm.
     `@supabase/ssr` hardcodes `flowType: "pkce"`, so this works out of the
     box with the built-in sender and no template editing. Its limitation is
     that PKCE keeps the code verifier in the cookies of the browser that
     _requested_ the reset, so opening the link on a second device fails.
   - A **custom** template passing `{{ .TokenHash }}` produces the
     `verifyOtp` arm, which carries no browser-bound state and survives
     "request on my laptop, click on my phone". Prefer it in production, and
     note that a dashboard-initiated recovery mail passes no `redirectTo`, so
     it will not work against that template — admins should use
     `auth.admin.updateUserById` instead, which needs no email at all.

   Supporting both makes the switchover a dashboard change rather than a code
   change, and makes the feature testable on day one, which an SMTP-gated
   template would not have been.

These belong written down in `infra/supabase/README.md`, which already
promises to hold "Auth providers" configuration and so far covers only
Storage.

## 8. Out of scope

- **Magic-link / OTP sign-in.** Same `resetPasswordForEmail` machinery,
  different product decision.
- **Email change.** Also `updateUser`, but it needs confirmation on both the
  old and the new address and deserves its own treatment.
- **Password strength rules.** Supabase enforces a configurable minimum
  server-side. Inventing a second, stricter rule in the client would only
  produce errors the server disagrees with.
- **Showing the user their active sessions.** Both paths now revoke (§6), but
  neither tells anyone _what_ was revoked. A "signed in on 3 other devices"
  list, with individual revoke buttons, is the natural next step and a
  separate piece of work.
- **Admin-initiated resets.** Covered in §2: needs an admin-gated backend
  endpoint, not the anonymous form.
