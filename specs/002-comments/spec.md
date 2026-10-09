# Feature Specification: Post Comments

**Feature Branch**: `002-comments`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "comment section for the personal blog. Any reader can comment on a published post with just a display name and the comment text, with no account or login. Comments appear instantly under the post, oldest first. Spam protection: a hidden honeypot field and a per-IP rate limit. The author (already logged in) can delete any comment, from the post page and from the dashboard. Feed cards and the post page show the comment count. Plain text only, no replies or threads, no editing by readers."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reader reads and leaves a comment (Priority: P1)

A reader opens a published post, scrolls to the comments below it, reads what others have
written (oldest first), types a display name and a comment, and sends it. The comment
appears under the post straight away, with no account and no waiting for approval.

**Why this priority**: This is the whole feature. Without it there is no comment section.

**Independent Test**: While logged out, open a published post, submit a comment with a
name and text, reload the page, and confirm the comment is shown with that name and a time.

**Acceptance Scenarios**:

1. **Given** a published post with no comments, **When** a reader opens it, **Then** they
   see an empty comment section that invites them to write the first comment.
2. **Given** a published post, **When** a reader submits a name and comment text, **Then**
   the comment appears at the end of the list immediately and is still there after a reload.
3. **Given** a post with several comments, **When** a reader opens it, **Then** comments are
   listed oldest first, each with the commenter's name and when it was posted.
4. **Given** a reader leaves the name or the text empty (or only spaces), **When** they
   submit, **Then** nothing is saved and they are told which field needs filling in.
5. **Given** a reader types HTML, Markdown or a script into a comment, **When** it is shown,
   **Then** it appears as literal plain text and nothing is formatted or executed.
6. **Given** a draft or unpublished post, **When** anyone tries to read or add comments on
   it, **Then** the system responds as if the post does not exist.
7. **Given** a reader has commented before on this device, **When** they write another
   comment, **Then** their display name is already filled in.

---

### User Story 2 - Spam is kept out without bothering real readers (Priority: P1)

Automated bots that fill in every form field are silently rejected, and anyone posting too
many comments in a short time is slowed down, while normal readers see no extra steps
(no puzzles, no captcha).

**Why this priority**: Open, unmoderated comments on a public site attract spam within
days; without this the author would spend time cleaning up instead of writing.

**Independent Test**: Submit a comment with the hidden field filled in and confirm it is
not stored; submit comments rapidly from one address and confirm the extra ones are refused
with a clear "slow down" message.

**Acceptance Scenarios**:

1. **Given** a submission where the hidden trap field is filled in, **When** it is received,
   **Then** it is not stored and is not shown, while the sender gets a response that looks
   successful (so bots do not learn they were caught).
2. **Given** one address has posted 5 comments within 10 minutes, **When** it posts again
   within that window, **Then** the comment is refused and the reader is told to wait and
   try again later; their typed text stays in the box.
3. **Given** a comment longer than 2,000 characters or a name longer than 50 characters,
   **When** it is submitted, **Then** it is refused with a message stating the limit, and
   the form shows how many characters remain while typing.

---

### User Story 3 - Author removes unwanted comments (Priority: P2)

The logged-in author can delete any comment, either directly under the post or from a
"Comments" view in the dashboard that lists the latest comments across all posts.

**Why this priority**: Comments go live instantly, so the author needs a fast way to remove
anything inappropriate. The feature is still useful without it for a short time, hence P2.

**Independent Test**: Log in as the author, delete a comment from the post page and another
from the dashboard list, and confirm both disappear for readers and the counts drop.

**Acceptance Scenarios**:

1. **Given** the author is logged in and viewing a post, **When** they choose delete on a
   comment and confirm, **Then** the comment is removed for everyone and the count drops by one.
2. **Given** the author is logged in, **When** they open the dashboard's comments view,
   **Then** they see the newest comments across all posts first, each showing the name,
   text, time and which post it belongs to, with a link to that post.
3. **Given** the author is in the dashboard's comments view, **When** they delete a comment
   and confirm, **Then** it disappears from the list and from the post.
4. **Given** a reader who is not logged in, **When** they view comments, **Then** no delete
   control is shown, and any direct attempt to delete is refused.
5. **Given** the author deletes a post, **When** that happens, **Then** all of its comments
   are deleted too.

---

### User Story 4 - Comment counts in the feed and on the post (Priority: P3)

Each card in the feed and the post page show how many comments the post has, so readers can
spot active discussions. On a feed card the count links to the post's comment section.

**Why this priority**: Nice signal for readers, but comments work fine without it.

**Independent Test**: Add 2 comments to a post and confirm its feed card and its post page
both show "2 comments"; delete one and confirm both show "1 comment".

**Acceptance Scenarios**:

1. **Given** a post with 3 comments, **When** a reader views the feed, **Then** that post's
   card shows the count 3, and selecting it opens the post scrolled to the comments.
2. **Given** a post with 1 comment, **When** the count is shown, **Then** it reads in the
   singular ("1 comment"); with 0 it reads "No comments yet" on the post page.

---

### Edge Cases

- Comment text with only spaces or line breaks counts as empty and is refused.
- Leading and trailing spaces are trimmed from names and text; line breaks inside the text
  are kept and shown as line breaks.
- A post with hundreds of comments still opens quickly: the first 50 load with the post and
  readers can load more on demand.
- The post is unpublished or deleted while a reader is writing: their submit is refused with
  a "this post is no longer available" message.
- Two readers comment at the same time: both comments are saved and shown in posting order.
- The network fails while sending: the reader sees an error and their text is not lost.
- A reader uses a name that matches the author's name: allowed (no identity checks), but the
  author's own comments while logged in are marked with an "Author" badge so readers can tell.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Readers MUST be able to view all comments on any published post without
  logging in, ordered oldest first, each showing display name, text and posted time.
- **FR-002**: Readers MUST be able to add a comment to a published post by providing a
  display name (1–50 characters) and comment text (1–2,000 characters), both trimmed.
- **FR-003**: New comments MUST be visible to all readers immediately, with no approval step.
- **FR-004**: Comment text and names MUST be stored and displayed as plain text; no markup is
  interpreted, and line breaks in the text are preserved.
- **FR-005**: Comments MUST NOT be readable or creatable for draft, unpublished or missing
  posts; such requests behave as "not found".
- **FR-006**: Readers MUST NOT be able to edit or delete comments, including their own.
- **FR-007**: The comment form MUST include a hidden trap field; submissions with it filled
  MUST be discarded silently while returning an apparently successful response.
- **FR-008**: The system MUST limit each sender address to 5 comments per 10 minutes and
  refuse extra submissions with a "try again later" message.
- **FR-009**: The logged-in author MUST be able to delete any comment, after confirming,
  from the post page and from a dashboard comments view.
- **FR-010**: The dashboard comments view MUST list comments across all posts newest first,
  showing name, text, time and a link to the post, loading more as the author scrolls.
- **FR-011**: Deleting a post MUST delete all its comments.
- **FR-012**: Feed cards and the post page MUST show the post's current comment count.
- **FR-013**: The post page MUST load the first 50 comments and offer a control to load
  more when there are more.
- **FR-014**: Comments the author writes while logged in MUST be marked with an "Author" badge.
- **FR-015**: The commenter's display name MUST be remembered on their own device for their
  next comment; nothing identifying is required beyond the name.
- **FR-016**: The comment form and list MUST meet the project's accessibility standard
  (labelled fields, announced errors and success, keyboard operable, sufficient contrast).
- **FR-017**: The comment form MUST show remaining characters as the reader approaches the
  limit and keep the reader's text when a submission fails.

### Key Entities

- **Comment**: A reader's plain-text message on one post. Has a display name, text, the time
  it was posted, whether it was written by the logged-in author, and the post it belongs to.
  A post has zero or more comments; a comment belongs to exactly one post and is removed when
  that post is removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can go from opening a post to seeing their own comment published in
  under 30 seconds, with no sign-up.
- **SC-002**: 100% of submissions with the trap field filled are kept out of the site.
- **SC-003**: No single address can publish more than 5 comments in any 10-minute window.
- **SC-004**: The author can find and delete a specific recent comment from the dashboard in
  under 15 seconds.
- **SC-005**: A post with 500 comments opens as fast as a post with none, from the reader's
  point of view.
- **SC-006**: The comment section passes automated accessibility checks with zero violations
  and can be fully used with only a keyboard.

## Assumptions

- Readers are anonymous; display names are not unique or verified (chosen by the user).
- Comments go live instantly; removal after the fact is the only moderation (chosen by the user).
- Spam protection is the trap field plus the per-address limit only; no captcha or third-party
  spam service in this version. The limit counts per sender address as seen by the server.
- No email notifications to the author about new comments in this version.
- No replies, threads, reactions, editing, or rich formatting in this version.
- Sender addresses are used only for rate limiting in memory and are not stored with comments.
- Existing author login and dashboard are reused; no new account types are introduced.
