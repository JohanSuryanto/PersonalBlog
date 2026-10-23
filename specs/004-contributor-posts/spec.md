# Feature Specification: Contributor Posts with Owner Approval

**Feature Branch**: `004-contributor-posts`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "as you know for login and access the dashboard and post a content, we will use mrjoansy email right. I want other user can login as well, and post a content, but the content will posted after i as mrjoansy approved it. it will max 2 content act as draft until i approved it. if 2/2 and i approve 1 then 1/2 available. Do you get it?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor signs in and submits a post (Priority: P1)

Someone other than the owner (mrjoansy) signs in with Google. Instead of being refused as today,
they get a contributor account and a limited dashboard showing only their own posts and a counter
"Pending: 0/2". They write a post and submit it. It is not visible to readers; it waits for the
owner's approval and the counter shows "Pending: 1/2".

**Why this priority**: Without contributors being able to sign in and submit, there is nothing to
approve.

**Independent Test**: Sign in with a non-owner Google account, write and submit a post, confirm it
appears in the contributor's dashboard as "Waiting for approval", the counter reads 1/2, and the
post is not visible on the public blog.

**Acceptance Scenarios**:

1. **Given** a person with a Google account that is not the owner's, **When** they sign in with
   Google for the first time, **Then** a contributor account is created and they land on their
   contributor dashboard.
2. **Given** a contributor with 0 or 1 pending posts, **When** they submit a new post, **Then** it
   is saved as pending, the counter increases by one, and readers cannot see it.
3. **Given** a contributor, **When** they open the dashboard, **Then** they see only their own
   posts, each with its status (pending, published, rejected), and never the owner's or other
   contributors' unpublished posts.
4. **Given** a contributor with a pending post, **When** they edit it, **Then** the changes are
   saved and it stays pending.
5. **Given** a contributor with a pending post, **When** they delete it, **Then** it is removed and
   the slot is freed.

---

### User Story 2 - Pending limit of 2 per contributor (Priority: P1)

Each contributor can have at most 2 posts waiting for approval at the same time. At 2/2 they cannot
submit another until the owner approves or rejects one (or they delete one), which frees a slot
(1/2).

**Why this priority**: This is the explicit rule from the owner; it keeps the review queue small
and stops spam.

**Independent Test**: As a contributor, submit 2 posts, confirm a third is blocked with a clear
message; have the owner approve one, confirm the counter reads 1/2 and a new submission succeeds.

**Acceptance Scenarios**:

1. **Given** a contributor with 2 pending posts, **When** they try to submit a third, **Then** the
   submission is refused with a message like "You have 2 of 2 posts waiting for approval. Wait for
   one to be reviewed or delete one." and nothing is saved.
2. **Given** a contributor at 2/2, **When** the owner approves one, **Then** the counter shows 1/2
   and the contributor can submit one more.
3. **Given** a contributor at 2/2, **When** the owner rejects one, **Then** the counter shows 1/2.
4. **Given** a contributor, **When** they view the dashboard or editor, **Then** they see how many
   of their 2 slots are used before they start writing.
5. **Given** a contributor at 2/2, **When** they submit from two browser tabs at the same moment,
   **Then** at most 2 posts end up pending.

---

### User Story 3 - Owner reviews and approves or rejects (Priority: P1)

The owner sees all pending contributor posts in their dashboard, with the contributor's name. They
can read each one, approve it (it is published immediately under the contributor's name) or reject
it with an optional short note shown to the contributor.

**Why this priority**: Approval is what puts contributor content on the blog; without it posts
stay pending forever.

**Independent Test**: As owner, open the review list, approve one pending post and confirm it is
live on the public blog with the contributor's name; reject another and confirm the contributor
sees it as rejected with the note.

**Acceptance Scenarios**:

1. **Given** pending contributor posts exist, **When** the owner opens the dashboard, **Then** they
   see a "Waiting for approval" list with title, contributor name and submission date.
2. **Given** a pending post, **When** the owner approves it, **Then** it becomes published, appears
   on the public blog with the contributor's display name, and the contributor's slot is freed.
3. **Given** a pending post, **When** the owner rejects it with an optional note, **Then** it stays
   hidden from readers, shows as rejected with the note in the contributor's dashboard, and the
   slot is freed.
4. **Given** a published contributor post, **When** the owner unpublishes, edits or deletes it,
   **Then** it behaves like any of the owner's own posts.
5. **Given** the owner, **When** they write their own posts, **Then** they publish directly with
   no approval and no limit, exactly as today.

---

### User Story 4 - Owner keeps exclusive powers (Priority: P2)

Contributors cannot publish directly, approve anything, moderate comments, or touch other people's
posts. Only the owner account has those powers.

**Why this priority**: Opening sign-in to others must not leak owner rights; a security
requirement, ranked P2 only because P1 stories already assume it.

**Independent Test**: As a contributor, attempt to publish directly, approve a post, edit or delete
another user's post, and delete a comment; all are refused.

**Acceptance Scenarios**:

1. **Given** a contributor, **When** they try any owner-only action, **Then** it is refused and
   nothing changes.
2. **Given** a contributor, **When** they view any page, **Then** they never see other users'
   unpublished posts.
3. **Given** a contributor comments on a post, **Then** their comment does not get the "Author"
   badge.

---

### Edge Cases

- Contributor edits a post after it was approved: not allowed; once published, only the owner can
  change it (prevents changing content after review).
- Contributor edits a rejected post: they may revise it and resubmit; resubmitting counts as a new
  pending slot and obeys the 2-post limit.
- Owner approves a post the contributor is editing at the same time: the version the owner reviewed
  is the one published; the contributor's late save is refused because the post is no longer pending.
- Contributor deletes a post the owner is reviewing: the owner sees "this post no longer exists".
- Owner's Google account or email/password login: unchanged, still recognised as owner.
- A contributor's Google email is unverified: sign-in refused, as today.
- A contributor account is removed by the maintainer: their published posts remain unless the owner
  deletes them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let people other than the owner sign in with Google and MUST create a
  contributor account on their first sign-in. Any Google account with a verified email may sign in;
  unverified emails are refused. There is no invite list in this version.
- **FR-002**: The owner account (mrjoansy) MUST remain the only account with owner powers:
  publishing directly, approving/rejecting, editing or deleting any post, and moderating comments.
- **FR-003**: Contributors MUST be able to create, edit and delete their own pending posts, and
  MUST NOT be able to publish directly.
- **FR-004**: A post created by a contributor MUST start as pending and MUST NOT be visible to
  readers or other contributors until the owner approves it.
- **FR-005**: Each contributor MUST have at most 2 pending posts at any time; a submission that
  would exceed this MUST be refused with a clear message, and this MUST hold under simultaneous
  submissions.
- **FR-006**: Approving, rejecting, or deleting a pending post MUST free one slot immediately.
- **FR-007**: Contributors MUST see their slot usage (e.g., "1/2 waiting for approval") on their
  dashboard and when starting a new post.
- **FR-008**: The owner MUST see a list of all pending posts with title, contributor name and
  submission time, and MUST be able to open, approve, or reject each one with an optional note.
- **FR-009**: Approval MUST publish the post immediately under the contributor's display name.
- **FR-010**: Rejected posts MUST stay hidden from readers, show the rejection note to their
  contributor, and MAY be revised and resubmitted subject to the limit.
- **FR-011**: Contributors MUST NOT edit a post once it is published; the owner can.
- **FR-012**: Contributors MUST only ever see their own unpublished posts; every request for
  another user's unpublished post MUST be refused.
- **FR-013**: Published posts MUST show who wrote them (owner or contributor display name).
- **FR-014**: Existing posts MUST keep working and be attributed to the owner; any data change MUST
  preserve all existing data.
- **FR-015**: The owner's existing sign-in (Google and email/password) and publishing flow MUST
  keep working unchanged.
- **FR-016**: New screens and messages MUST meet the project's accessibility standard.

### Key Entities

- **User account**: Anyone who can sign in. Has a display name, email and a role: owner (exactly
  one, mrjoansy) or contributor.
- **Post**: Existing post, now with a writer (the user who created it) and a status that adds
  pending and rejected to draft and published. May hold a rejection note.
- **Pending slot**: Not stored separately; the count of a contributor's posts currently pending,
  capped at 2.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new contributor can go from first sign-in to a submitted post in under 5 minutes.
- **SC-002**: 100% of attempts to exceed 2 pending posts are refused, including simultaneous ones.
- **SC-003**: 0 contributor posts are visible to readers before owner approval.
- **SC-004**: The owner can approve or reject a pending post in under 3 clicks from the dashboard.
- **SC-005**: 100% of owner-only actions attempted by a contributor are refused.

## Assumptions

- "Draft" in the request means "submitted and waiting for approval"; contributors do not have a
  separate private draft stage. Every saved contributor post is pending and uses a slot.
- Contributors sign in only with Google; no email/password registration for them.
- The owner is identified as the existing author account (mrjoansy); no role-management screen in
  this version.
- No email notifications to owner or contributors; both see status in their dashboards.
- Contributors cannot upload images beyond what the existing editor already allows for posts.
- Rejected posts are kept (not deleted) so the contributor can read the note and revise.
- Banning/removing contributors is done by the maintainer directly; no UI in this version.
