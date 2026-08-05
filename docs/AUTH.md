# Authentication

Two token types, three revocation mechanisms, and one deliberately boring rule: **anything that
must be revocable is not self-validating.**

---

## The two tokens

| | Access token | Refresh token |
|---|---|---|
| Format | JWT, HS256 | 32 bytes of CSPRNG output, base64url |
| Lifetime | `JWT_ACCESS_TTL_S` (default 15 min) | `JWT_REFRESH_TTL_S` (default 30 days) |
| Stored server-side | no | yes — SHA-256 of the token, in `refresh_tokens` |
| Sent on | every request | only `/auth/refresh` and `/auth/logout` |
| Verified by | signature + `iss`/`aud`/`exp`, then two revocation checks | database lookup by hash |
| Revocable | via `tokenVersion` or the Redis denylist | by revoking its row or its family |

**Why the refresh token is not a JWT.** A JWT is self-validating — you cannot un-issue a
signature. That is precisely wrong for the credential whose entire job is to be revocable. An
opaque token is meaningless without its database row, so revocation is one `UPDATE` and rotation is
enforceable.

**Why the refresh token is hashed with SHA-256 rather than Argon2.** The input is already 256 bits
of uniform randomness: there is no dictionary to run and nothing to brute-force. A slow KDF would
add ~50ms to every refresh and buy nothing. What matters is that the plaintext is never stored, so
a database dump cannot be replayed.

### Access token claims

Short keys, because this rides on every request.

| Claim | Meaning |
|---|---|
| `sub` | User id |
| `tv` | `tokenVersion` at issue time — the bulk-revocation check |
| `adm` | Platform administrator |
| `tid` | Active tenant, when the token is workspace-scoped — **never populated in the current build**, see [below](#what-is-not-implemented) |
| `role` | The user's `MembershipRole` within `tid` — likewise |
| `jti` | Token id — the denylist key |
| `iat` `exp` `iss` `aud` | Standard |

`HS256` is pinned on both signing and verification, and `algorithms: ['HS256']` is passed
explicitly to the verifier. Without that, a token with `alg: none` — or one signed with a public key
used as an HMAC secret — can verify. Clock tolerance is zero: every host runs NTP, and accepting
expired tokens "a little" just extends the revocation window.

---

## Login

`POST /api/v1/auth/login`

1. Normalise the address through the `Email` value object.
2. Look the user up. **If there is no user, or the user has no password hash, run
   `simulateVerification()` anyway** and fail with `INVALID_CREDENTIALS`.
3. Verify the password with Argon2id.
4. *Then* check account status. A suspended account fails at this step, not earlier.
5. If the stored hash was produced with weaker parameters than current policy, re-hash it — the one
   moment the plaintext is available. This deliberately does **not** bump `tokenVersion`: the
   credential has not changed, and signing everyone out whenever the hashing cost is raised would
   be a self-inflicted outage.
6. Issue an access token and open a **new refresh-token family**.
7. Record `lastLoginAt` outside the optimistic lock.

Three properties are load-bearing here, and each is easy to break with an innocent-looking edit:

- **Uniform failure.** Unknown email, wrong password, and suspended account produce the same error
  code and the same message. Distinguishing them turns the login endpoint into an account
  enumeration oracle.
- **Uniform latency.** Argon2 verification dominates response time. Skipping it on the no-such-user
  path leaks account existence to anyone with a stopwatch — hence `simulateVerification`, whose
  only job is to burn the same CPU.
- **Status checked after the password.** Otherwise "this account is suspended" is available without
  knowing the password, which leaks the same thing more slowly.

A failed login logs the *masked* address (`o***@acme.local`). Enough to investigate a
credential-stuffing run; not enough to turn the log into a list of registered accounts.

---

## Refresh rotation and reuse detection

`POST /api/v1/auth/refresh`

Every refresh consumes the presented token and issues a successor **in the same family**. A token
works exactly once. If one is ever presented twice, a copy exists that should not, and the entire
family is destroyed.

```
login ──► [T1] ──refresh──► [T2] ──refresh──► [T3]          family F
             consumed          consumed         active

attacker steals T2 and refreshes after the legitimate client already did:
             T2 is already revoked ──► reuse detected ──► revoke(F) ──► 401
             both parties must sign in again
```

That detection is the whole reason rotation is worth its complexity. Without it, a stolen refresh
token grants indefinite access and nothing ever notices. With it, the theft surfaces the moment
either party refreshes after the other — at the cost of a forced re-login.

The flow:

1. Hash the presented token, look it up. No row ⇒ `TOKEN_INVALID` (fabricated, or swept).
2. Already revoked ⇒ **reuse**: revoke the family, log at `error`, throw `REFRESH_TOKEN_REUSED`.
3. Expired ⇒ `TOKEN_EXPIRED`.
4. `consume(id, 'rotated', now)` — a conditional `UPDATE … WHERE id = ? AND revoked_at IS NULL`.
   Losing this race ⇒ **reuse** (the same token was consumed concurrently).
5. Re-load the user and call `assertCanAuthenticate()` again. A user suspended five minutes ago
   must not be able to extend their session.
6. Issue the successor into the same family.

### Why this is not wrapped in a transaction

The obvious implementation reads, checks, revokes and issues inside one transaction. It is wrong
twice over:

1. The reuse path revokes the family and then **throws**, which rolls the revocation back. The
   attacker keeps their session and the log claims it was revoked. This is easy to miss, because
   the error response looks exactly right.
2. Two concurrent refreshes with the same token both read "not revoked" before either writes, so
   both succeed and detection never fires.

Instead, `consume` is a single conditional `UPDATE` acting as a compare-and-swap. Postgres
serialises the row update, so exactly one caller sees a row count of 1; the loser is treated as
reuse, which is the correct reading — the token was presented twice. Every revocation commits
independently of whatever is thrown afterwards.

---

## Revocation

Three mechanisms, because no single one covers every case at an acceptable cost.

| Mechanism | Scope | Cost | Latency |
|---|---|---|---|
| `tokenVersion` column | every access token for one user | one indexed 5-column read, already on the request path | immediate |
| Redis denylist (`jti`) | one specific access token | one `EXISTS` | immediate |
| Refresh-token revocation | one family, or all of a user's | one `UPDATE` | immediate for refresh; access tokens survive until expiry |

**`tokenVersion`** is the bulk hammer. Every access token carries the value it was minted with; the
JWT strategy compares it against the user row and rejects any mismatch. Bumping it invalidates
every token in existence for that user with no per-token bookkeeping. The entity decides when:
`setPasswordHash`, `changeEmail`, `suspend`, `grantPlatformAdmin`, `revokePlatformAdmin`,
`softDelete` and `invalidateSessions` all bump it — `upgradePasswordHash` and
`recordSuccessfulLogin` deliberately do not.

**The denylist** covers what `tokenVersion` cannot: revoking one token — one device, one leaked
session — without disturbing the user's others. Entries are TTL'd to the token's own expiry, so the
denylist can never hold more than one access-token lifetime of logouts.

It **fails closed**, unlike the cache. If Redis is unreachable we cannot tell whether a token was
revoked, and the only safe answer to "is this revoked?" is yes. A Redis outage therefore signs
everyone out rather than silently honouring revoked tokens. That is the correct trade for a
security control, and the reason the denylist does not go through the fail-open `CacheService` —
and the reason `/health/ready` checks Redis.

### Per-request checks

The JWT strategy runs both, in cost order:

1. Denylist `EXISTS` on `jti` — cheap, local.
2. `findAuthSnapshot(sub)` — five columns, not the aggregate. Rejects deleted users
   (as `TOKEN_INVALID`, so an unauthenticated caller learns nothing about which ids exist), stale
   `tv`, and non-`ACTIVE` status.

`isPlatformAdmin` is read from the **database**, not from the token: a privilege revoked a minute
ago must not survive in a token issued before it.

Two round trips per authenticated request is the price of revocable stateless tokens. The
alternative — trusting the signature alone — means a compromised token stays valid for its full
lifetime with nothing you can do about it.

---

## Logout

| Endpoint | Effect |
|---|---|
| `POST /auth/logout` | Revokes this session's refresh-token **family** and denylists the current access token. Other devices stay signed in. |
| `POST /auth/logout-all` | Revokes every refresh token for the user, bumps `tokenVersion`, denylists the current access token. |

Both halves matter and each alone is a bug. Revoking only the refresh token leaves the access token
valid for up to 15 minutes after the user pressed "sign out". Denylisting only the access token
leaves the refresh token able to mint a new one.

Logout revokes the *family*, not just the presented row: the client may be holding an older link in
the chain, and leaving its successors alive would leave the session usable.

Logout is **best effort by design** — a logout that fails leaves the user signed in, which is the
worse outcome, so errors are logged rather than propagated. If Redis is down and the denylist write
fails, the refresh token is already revoked and the blast radius is one access-token lifetime.

`POST /auth/change-password` requires the current password even though the caller is already
authenticated: without it, a stolen access token — or an unattended session — is enough to take the
account permanently. On success it bumps `tokenVersion` *and* revokes every refresh token, ending
every session including the one making the call. The revocation is ordered **after** the save;
revoking first and then failing the write would sign the user out while leaving the old password
working.

`GET /auth/sessions` lists active refresh tokens with their user agent, IP and creation time, and
flags the current one — the data an account-security screen needs.

---

## Cookies versus localStorage

Cookies are the default transport (`AUTH_COOKIE_ENABLED=true`), and the reasoning is a trade, not a
verdict:

- **`localStorage` is readable by any script on the page.** One XSS — including one in a
  third-party dependency you did not write — exfiltrates the token, and the attacker keeps it after
  the victim closes the tab. There is no mitigation.
- **An `HttpOnly` cookie is unreachable from JavaScript.** The same XSS can only *use* the session
  while the victim is on the page. That is a large reduction in blast radius, not immunity.
- **The cost is CSRF**, which cookies reintroduce and `localStorage` does not have.

CSRF is handled here by `SameSite=Lax` plus the shape of the API: it is JSON-only with no form
endpoints, so a cross-site `<form>` POST cannot produce a request this server will accept, and
`Lax` blocks cookie attachment on cross-site sub-requests anyway.

**If your frontend is on a different site** and you need `SameSite=None`, that argument no longer
holds — add a double-submit CSRF token (a random value in a readable cookie, echoed in a header,
compared server-side) before you switch.

Cookie layout:

| Cookie | Path | Lifetime |
|---|---|---|
| `tos_at` | `/` | access TTL |
| `tos_rt` | `/api/v1/auth` | refresh TTL |

The refresh cookie's narrow path means the browser never attaches it to anything but the auth
endpoints, so a leak in any other handler's logging cannot expose it. Clearing must use the same
path or the browser keeps the cookie and the user stays "logged in" from its point of view.

When cookies are enabled, the refresh token is **omitted from the response body** — returning it in
both places would hand a successful XSS the very token the `HttpOnly` cookie exists to protect.

Non-browser clients (mobile, service-to-service) set `AUTH_COOKIE_ENABLED=false` and read both
tokens from the body, where none of the above applies. Both transports are accepted on the way in:
the JWT strategy checks the cookie first, then the `Authorization: Bearer` header. `/auth/refresh`
likewise prefers the cookie over the body — preferring the body would let an attacker who can set a
body value override the cookie.

---

## Password storage

Argon2id, with parameters from `ARGON2_*` and floored at OWASP minimums by the env schema. Lower
values are rejected outright rather than silently accepted, because a weak KDF is invisible until a
breach.

- `verify` returns `false` rather than throwing on a malformed hash. A corrupt row should read as
  "wrong password", not as a 500 that tells an attacker something interesting.
- `needsRehash` drives transparent upgrades on login.
- The `Password` value object enforces policy and stringifies to `[REDACTED]`, so it cannot reach a
  log through an accidental interpolation.

Raising the parameters is safe at any time; existing hashes keep verifying and upgrade on next
sign-in.

---

## Rate limiting

Every `/auth/*` route opts out of the global bucket and into the tighter `auth` one
(`AUTH_THROTTLE_LIMIT`, default 10 per `THROTTLE_TTL_S`). Login performs an Argon2 verification per
call, so an unthrottled login endpoint is both a credential-stuffing target and a CPU amplification
vector.

All auth routes share one budget per client IP. Splitting it per endpoint would be marginally
friendlier, but it means four hardcoded numbers an operator cannot change during an incident.

Counters live in Redis so the limit is shared across replicas, and the client IP comes from
`TRUST_PROXY` hops of `X-Forwarded-For` — never from the whole chain, which a client can forge.

---

## WebSocket authentication

Sockets authenticate in **handshake middleware**, not in a guard.

A Nest WebSocket guard runs per *message*, which means an unauthenticated socket is already
connected and consuming a slot before anything checks it. `handleConnection` is no better: it is
async and Socket.IO does not await it, so the client's `connect` event fires while token
verification is still in flight, and a well-behaved client that emits immediately gets its first
messages rejected. That bug is timing-dependent, so it presents as "sometimes the first message is
lost".

Middleware runs before the connection is established: `next(error)` means the client sees
`connect_error` and no socket slot is ever allocated.

The handshake performs the same revocation checks as the HTTP strategy — denylist, `tokenVersion`,
status, soft delete. A socket can stay open for hours, so skipping them would leave a revoked
session live far longer than any HTTP request would.

**Rooms are the authorization boundary.** A socket joins exactly the rooms for the workspaces its
user belongs to, decided server-side at connection time. Clients cannot ask to join a room — that
request would be attacker-controlled input deciding what data they receive, which is how
cross-tenant leaks happen in every WebSocket implementation that gets it wrong.

---

## Error codes

Clients branch on `errorCode`, never on `message`.

| Code | Status | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email, wrong password, or inactive account — deliberately indistinguishable. |
| `ACCOUNT_NOT_ACTIVE` | 401 | Suspended or deleted, surfaced after successful password verification. |
| `PASSWORD_NOT_SET` | 401 | Invited account that has never completed its invitation. |
| `TOKEN_EXPIRED` | 401 | Refresh and retry. |
| `TOKEN_INVALID` | 401 | Malformed, unknown, or issued to a user who no longer exists. |
| `TOKEN_REVOKED` | 401 | Denylisted, or `tv` no longer matches. Sign in again. |
| `REFRESH_TOKEN_REUSED` | 401 | The family has been revoked. Sign in again — and treat it as a security event. |
| `CURRENT_PASSWORD_INCORRECT` | 401 | On `/auth/change-password`. |
| `PASSWORD_REUSED` | 422 | The new password matches the current one. |
| `RATE_LIMIT_EXCEEDED` | 429 | Honour `Retry-After`. |

---

## What is not implemented

- **Registration, password reset, and email verification.** The building blocks exist —
  `User.create` supports an `INVITED` state with no password, and `setPasswordHash` completes the
  invitation and bumps `tokenVersion` — but no endpoint issues or consumes the mailed token, and
  nothing sends mail.
- **Absolute session lifetime.** Each rotation extends the window, so an active session never
  forces re-authentication. Add a `familyExpiresAt` set at login and checked on refresh if your
  threat model needs a hard cap.
- **Breached-password checks.** `Password` enforces length and a small blocklist. A production
  deployment should add a k-anonymity check against Have I Been Pwned at the use-case layer.
- **Workspace scoping of tokens — the significant gap.** `buildAuthenticationResult` is the single
  place login, refresh and tenant-switch mint tokens, and its scope-resolution call is currently
  commented out. The consequences, all of which hold today:

  | | |
  |---|---|
  | `tid` and `role` | never set on any access token |
  | `tenantId` on `/auth/login` and `/auth/refresh` | accepted, validated, and ignored |
  | `SwitchTenantUseCase` | re-issues an identical unscoped token; its "throws if the user is not a member" comment describes intent, not behaviour — there is no membership check, because no membership repository exists |
  | WebSocket tenant rooms | never joined: the gateway builds its principal with `tenantIds: []` |
  | `@RequireRole` | the decorator and metadata key exist; no guard reads them |

  Closing this needs a `MembershipRepositoryPort` and its Prisma adapter — the `memberships` table
  and its indexes are already in the schema — then re-enabling the scope resolution and adding the
  `POST /auth/switch-tenant` route. Until then, treat every access token as user-scoped only, and
  do not rely on `tid` for isolation.
