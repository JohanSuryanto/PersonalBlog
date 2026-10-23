# Feature Specification: Sign in with Google

**Feature Branch**: `003-google-login`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "you know in this folder we have 0auth2.0learn, and we can connect and login using google right? now i want this login to be implemented at project personal blog. just add the google login in there, do not add the register for now. add any db changes needed as well. Do you got my idea?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author signs in with Google (Priority: P1)

The author opens the login page and, next to the existing email and password form, sees a
"Continue with Google" button. They choose it, pick their Google account on Google's screen,
and land back on the blog already signed in, with the same access as a password login:
dashboard, editor, comment deletion, "Author" badge on their comments.

**Why this priority**: This is the whole feature. Without it there is nothing to ship.

**Independent Test**: Signed out, open the login page, choose "Continue with Google", sign in
with the Google account whose email matches the author account, and confirm the dashboard opens
and author-only actions work.

**Acceptance Scenarios**:

1. **Given** the author is signed out, **When** they open the login page, **Then** they see a
   "Continue with Google" option alongside the existing email and password form.
2. **Given** the author chooses "Continue with Google", **When** they sign in on Google with the
   account whose verified email matches the author account, **Then** they return to the blog
   signed in and land where a password login would take them.
3. **Given** the author signed in with Google, **When** they use any author-only action, **Then**
   it behaves exactly as after a password login.
4. **Given** the author signed in with Google, **When** they log out, **Then** they are signed out
   of the blog (their Google session elsewhere is not affected).
5. **Given** the author has signed in with Google once, **When** they sign in with Google again
   later, **Then** they are recognised as the same account, even if they changed the email on
   their Google account in between.

---

### User Story 2 - Unknown Google accounts are refused, no account is created (Priority: P1)

Anyone else who tries "Continue with Google" is turned away with a clear message. No new account
is ever created by signing in with Google; registration does not exist in this version.

**Why this priority**: Without this, any Google user could gain author rights or create accounts.
It is a security requirement, not an extra.

**Independent Test**: Sign in with a Google account whose email does not match the author account
and confirm the blog stays signed out, shows a "this Google account can't sign in here" message,
and no new account exists afterwards.

**Acceptance Scenarios**:

1. **Given** a Google account whose email matches no blog account, **When** its owner completes
   Google sign-in, **Then** they return to the login page, still signed out, with a message saying
   this Google account is not allowed to sign in, and no account is created.
2. **Given** a Google account whose email is not verified by Google, **When** its owner completes
   Google sign-in, **Then** it is refused the same way, even if the email matches the author.
3. **Given** the author account is already linked to one Google account, **When** a different
   Google account with the same email address tries to sign in, **Then** it is refused.
4. **Given** the author account is temporarily locked after too many failed password attempts,
   **When** the author signs in with Google, **Then** they are refused with the same "locked,
   try again later" message as the password form.

---

### User Story 3 - Password login keeps working (Priority: P2)

Adding Google does not remove or change the existing email and password login. The author can use
either method at any time.

**Why this priority**: A fallback if Google is unavailable or the Google account is lost.

**Independent Test**: After linking Google, log out and sign in with email and password; confirm
it still works.

**Acceptance Scenarios**:

1. **Given** the author has linked Google, **When** they sign in with email and password, **Then**
   it works as before.

---

### Edge Cases

- The author cancels on Google's screen or Google returns an error: they return to the login page,
  signed out, with a short "Google sign-in was cancelled or failed, please try again" message.
- The Google sign-in round trip is tampered with, replayed or takes too long: the attempt is
  refused and the author must start again.
- Google sign-in is not configured on the server (no Google credentials provided): the "Continue
  with Google" option is hidden and the password login works as usual.
- Email matching ignores letter case.
- The author is already signed in and opens the login page: same behaviour as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The login page MUST offer a "Continue with Google" option in addition to the
  existing email and password form.
- **FR-002**: Google sign-in MUST only succeed for an existing blog account: either one already
  linked to that Google account, or, on first use, one whose email equals the Google account's
  verified email (case-insensitive).
- **FR-003**: On the first successful match by email, the system MUST link the Google account to
  the blog account and from then on recognise it by the Google account's permanent identifier,
  not by email.
- **FR-004**: The system MUST NOT create any new account through Google sign-in; registration is
  out of scope.
- **FR-005**: A blog account MUST be linked to at most one Google account; other Google accounts
  are refused even if their email matches.
- **FR-006**: A Google sign-in MUST produce the same signed-in session, permissions and lifetime as
  a password login, and logout MUST end it the same way.
- **FR-007**: Refused or failed Google sign-ins MUST leave the visitor signed out and show a clear,
  non-technical message on the login page, without revealing which accounts exist.
- **FR-008**: The sign-in round trip MUST be protected against forgery and replay, and Google
  credentials and secrets MUST NOT be exposed to the browser or committed to source control.
- **FR-009**: Account lockout MUST apply to Google sign-in the same way it applies to password login.
- **FR-010**: When Google sign-in is not configured, the option MUST be hidden and the rest of the
  login MUST work unchanged.
- **FR-011**: The existing email and password login MUST keep working unchanged.
- **FR-012**: The "Continue with Google" option and any messages MUST meet the project's
  accessibility standard (keyboard operable, visible focus, announced errors).
- **FR-013**: Storing the link between a blog account and a Google account MUST preserve all existing
  data; any schema change it needs MUST go through a versioned database change.

### Key Entities

- **Author account**: The existing single blog account (email, display name, password). Unchanged,
  except it can now have a linked Google account.
- **Google link**: Connects one author account to one Google account. Holds the Google account's
  permanent identifier. An account has zero or one link; a Google
  account links to at most one blog account.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The author can go from the login page to the dashboard via Google in under
  15 seconds when already signed in to Google in the browser.
- **SC-002**: 100% of Google sign-in attempts with an unknown or unverified email are refused, and
  zero new accounts are created by Google sign-in.
- **SC-003**: After linking, password login still succeeds on the first try with correct credentials.
- **SC-004**: The login page passes automated accessibility checks with zero violations and the
  Google option can be used with only a keyboard.

## Assumptions

- Superseded in part by [spec 004](../004-contributor-posts/spec.md): verified unknown emails now create
  contributor accounts.
- The blog keeps a single author account; Google sign-in is for that author only. Readers still
  comment without accounts.
- Matching to the existing account is by the Google account's verified email on first use, then by
  the Google identifier. No manual "link Google" screen in settings in this version.
- Only the basic Google profile (identifier, email, name) is requested; no other Google data.
- Same approach as the OAuth2.0Learn project (full redirect to Google and back, server-side code
  exchange), adapted to the blog's existing session and login page. A popup window is not required.
- The author creates the Google client credentials and registers the blog's return address(es) for
  local and production use; they are supplied as secrets like the existing ones.
- No unlinking UI in this version; unlinking, if ever needed, is done by the maintainer.
