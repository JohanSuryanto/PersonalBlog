# Feature Specification: Personal Blog MVP

**Feature Branch**: `001-blog-mvp`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "personal blog, readers browse posts, author login to publish, and it can contains images as well. so they post with images, and that images can be slide max to 10 pics, we will using cloudnary to import that images, and neon for the postgre db. This is for MVP. later on, we will add the comment section, but later. in the list section of post it will using the lazy load like instagram, not using pagination. and then we can also filter by date and search feature."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author publishes a post with images (Priority: P1)

The author logs in, writes a post with a title and body, attaches up to 10 images, orders
them, and publishes. The post immediately becomes visible to readers. The author can also
save a post as a draft, edit it later, and unpublish or delete it.

**Why this priority**: Without published content there is nothing for readers to see; this
is the core value of the blog and the flow the constitution requires to be fully tested.

**Independent Test**: Log in as the author, create a post with 3 images, publish it, then
open the post's public address while logged out and confirm the text and all 3 images appear
in the chosen order.

**Acceptance Scenarios**:

1. **Given** the author is logged in, **When** they create a post with a title, body, and
   images and choose Publish, **Then** the post is visible to anonymous readers with its images
   in the order the author set.
2. **Given** the author is logged in, **When** they save a post as a draft, **Then** the post
   is not visible to readers anywhere (list, search, or direct address).
3. **Given** a post already has 10 images, **When** the author tries to add another,
   **Then** the system blocks it and explains that 10 images is the maximum.
4. **Given** a published post, **When** the author edits its text or images and saves,
   **Then** readers see the updated version.
5. **Given** a published post, **When** the author unpublishes it, **Then** it disappears
   from the reader list, search, and its direct address shows "not found".
6. **Given** a visitor who is not logged in, **When** they try to reach any create, edit,
   or delete function, **Then** they are denied and asked to log in.

---

### User Story 2 - Reader browses the post feed and views a post (Priority: P1)

A reader opens the blog and sees a feed of published posts, newest first. As they scroll
down, more posts load automatically (no page numbers), similar to a social media feed. Opening
a post shows the full text and an image slider the reader can swipe or click through.

**Why this priority**: Reading is the purpose of the blog; together with Story 1 it forms
the minimal usable product.

**Independent Test**: With 30 published posts present, open the feed, scroll to the bottom
repeatedly, and confirm all 30 posts appear exactly once, newest first, without any page
navigation; open one post with 5 images and move through all 5 in the slider.

**Acceptance Scenarios**:

1. **Given** published posts exist, **When** a reader opens the blog, **Then** the first
   batch of posts is shown newest first, each with title, publish date, excerpt, and a cover
   image (the first image) if it has images.
2. **Given** the reader has scrolled near the end of the loaded posts, **When** more posts
   exist, **Then** the next batch loads automatically and is appended without duplicates.
3. **Given** all posts have been loaded, **When** the reader reaches the end, **Then** an
   "end of posts" indicator is shown and no further loading is attempted.
4. **Given** a post with several images, **When** the reader views it, **Then** they can
   move to the next and previous image by swipe, click/tap, or keyboard, and see the current
   position (e.g., "3 / 7").
5. **Given** no published posts exist, **When** a reader opens the blog, **Then** a friendly
   empty-state message is shown.

---

### User Story 3 - Reader searches and filters posts by date (Priority: P2)

A reader types keywords to find posts whose title or body match, and/or narrows the feed to
posts published within a chosen date range. Results use the same scrolling feed.

**Why this priority**: Valuable once there is a meaningful amount of content, but the blog
works without it.

**Independent Test**: With posts published across several months, search for a word that
appears in only 2 posts and confirm only those 2 appear; then set a date range covering one
month and confirm only that month's posts appear.

**Acceptance Scenarios**:

1. **Given** published posts, **When** a reader searches for a keyword, **Then** only
   published posts whose title or body contain that keyword (case-insensitive) are shown,
   newest first.
2. **Given** published posts, **When** a reader sets a "from" and/or "to" date, **Then**
   only posts published within that inclusive range are shown.
3. **Given** both a keyword and a date range, **When** the reader applies them, **Then**
   results satisfy both conditions.
4. **Given** a search or filter with no matches, **When** applied, **Then** a "no posts
   found" message is shown with a way to clear the filters.
5. **Given** a search or filter is applied, **When** the reader shares or reloads the page,
   **Then** the same search and filter are restored.
6. **Given** draft posts that match a keyword, **When** a reader searches, **Then** drafts
   never appear in results.

---

### Edge Cases

- An image upload fails or is interrupted: the author sees which image failed and can retry
  or remove it; the post can still be saved with the images that succeeded.
- The author uploads a file that is not an image or exceeds the size limit: it is rejected with
  a clear message before saving.
- An author selects more than 10 images at once: only the first allowed number up to 10 total
  are accepted and the author is told the rest were skipped.
- New posts are published while a reader is scrolling: the reader's feed does not show
  duplicates or skip posts.
- "From" date is after "to" date: the filter is rejected with a message asking to correct it.
- Search terms with only spaces or special characters: treated as no search term or matched
  literally, never causing an error.
- A post with no images: shown in the feed without a cover image and without a slider.
- Wrong login credentials repeated many times: further attempts are temporarily slowed or
  blocked.
- The author's login session expires while editing: unsaved work is not silently lost; the
  author is prompted to log in again.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & access**

- **FR-001**: System MUST allow the author to log in with email and password and log out.
- **FR-002**: System MUST restrict creating, editing, publishing, unpublishing, and deleting
  posts, and uploading images, to the logged-in author.
- **FR-003**: System MUST allow anyone, without logging in, to view published posts, the
  feed, search, and date filter.
- **FR-004**: System MUST NOT expose draft or unpublished posts to anyone except the author,
  in any list, search result, or direct address.
- **FR-005**: System MUST temporarily limit login attempts after repeated failures.

**Post management**

- **FR-006**: Author MUST be able to create a post with a title (required, max 200 characters)
  and a body (required) that supports basic formatting (headings, bold, italic, links, lists).
- **FR-007**: Author MUST be able to save a post as a draft or publish it; publishing records
  the publish date and time.
- **FR-008**: Author MUST be able to edit, unpublish, and delete their posts; deletion requires
  confirmation.
- **FR-009**: Author MUST be able to see a list of all their posts, including drafts, with
  each post's status.
- **FR-010**: Each published post MUST have a stable, human-readable address derived from its
  title.

**Images**

- **FR-011**: Author MUST be able to attach 0 to 10 images to a post; the system MUST reject
  any attempt to exceed 10.
- **FR-012**: System MUST accept JPEG, PNG, WebP, and GIF images up to 10 MB each and reject
  other files with a clear message.
- **FR-013**: Author MUST be able to reorder and remove a post's images; the first image is the
  post's cover image.
- **FR-014**: Author MUST be able to provide alternative text for each image; images without
  author-provided text MUST still be announced meaningfully to assistive technology (e.g.,
  "Image 2 of 5 for <post title>").
- **FR-015**: Images MUST be stored with an external image hosting service and delivered in
  sizes appropriate to the reader's screen.

**Reading experience**

- **FR-016**: The feed MUST show published posts newest first, each with title, publish date,
  a short excerpt, and cover image when present.
- **FR-017**: The feed MUST load further posts automatically as the reader scrolls (infinite
  scroll) in batches of 10, with no page numbers, no duplicates, and an end-of-feed indicator.
- **FR-018**: The feed MUST also provide a keyboard- and assistive-technology-accessible way to
  load more posts (e.g., a "Load more" control that appears when automatic loading is not
  triggered).
- **FR-019**: The post page MUST display images as a slider navigable by swipe, click/tap,
  and keyboard, showing the current position and total count.

**Search & filter**

- **FR-020**: Readers MUST be able to search published posts by keyword, matching title and
  body, case-insensitively.
- **FR-021**: Readers MUST be able to filter published posts by publish date range (from, to,
  or both, inclusive).
- **FR-022**: Search and date filter MUST combine, use the same infinite-scroll feed, and be
  reflected in the page address so they survive reload and sharing.

**Out of scope for this MVP**

- **FR-023**: Comments, reader accounts, multiple authors, categories/tags, and scheduled
  publishing are explicitly out of scope; comments are planned for a later release.

### Key Entities

- **Author**: The single person who can log in and manage content. Attributes: display name,
  email, credentials.
- **Post**: A blog entry. Attributes: title, address (slug), body, status (draft/published),
  created date, last updated date, publish date. Has 0–10 ordered images.
- **Post Image**: An image belonging to one post. Attributes: hosted image reference, position
  (1–10), alternative text, original dimensions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The author can write and publish a post with 5 images in under 5 minutes,
  excluding writing time.
- **SC-002**: A published post is visible to readers within 5 seconds of the author choosing
  Publish.
- **SC-003**: The first screen of the feed appears in under 2 seconds on a typical mobile
  connection.
- **SC-004**: When scrolling, the next batch of posts appears within 1 second of reaching the
  end of loaded posts in 95% of cases.
- **SC-005**: Search and date-filter results appear within 1 second for a blog with up to
  1,000 posts.
- **SC-006**: 0 draft posts are ever visible to non-authors (verified by automated tests).
- **SC-007**: All reader and author pages meet WCAG 2.2 AA, including full keyboard operation
  of the feed and image slider.

## Assumptions

- This is a personal blog with exactly one author account, created during setup; there is no
  public sign-up and no reader accounts in the MVP.
- Images are optional on a post; a text-only post is valid.
- Post bodies are written in Markdown-style formatting; rich embeds (video, etc.) are out of
  scope.
- "Filter by date" means filtering by the post's publish date.
- Password reset can be done by the site owner through an administrative step for the MVP; a
  self-service reset email is out of scope.
- **Dependencies (chosen by the project owner)**: images are hosted on Cloudinary; the
  database is a Neon-hosted PostgreSQL instance. Both accounts must exist before deployment.
- Readers use current versions of mainstream desktop and mobile browsers.
