<!--
Sync Impact Report
- Version change: (unversioned template) → 1.0.0
- Modified principles: placeholders → I. Simplicity First; II. API-First Separation;
  III. Tested Publishing Flow (NON-NEGOTIABLE); IV. Accessible by Default; V. Secure Authentication
- Added sections: Technology Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read the constitution at runtime)
- Follow-up TODOs: none
-->

# PersonalBlog Constitution

## Core Principles

### I. Simplicity First

- Every feature MUST serve a concrete reader or author need; speculative features are rejected (YAGNI).
- Built-in framework, platform, and database features MUST be preferred over new dependencies.
- Each new third-party package MUST be justified in the feature plan.
- No abstraction (interface, repository, factory) is introduced until it has at least two real uses.

**Rationale**: A personal blog is maintained by one person; every extra moving part is future maintenance.

### II. API-First Separation

- The system consists of exactly two deployables: a React frontend (FE) and a .NET Web API backend (BE).
- The FE MUST communicate with the BE only through the documented HTTP/JSON API; it MUST NOT access
  the database directly.
- The BE MUST expose an OpenAPI description, and breaking API changes MUST be called out in the plan.
- Business rules (publishing, permissions, validation) MUST be enforced in the BE; the FE may
  duplicate validation only for user experience.

**Rationale**: A clean FE/BE contract keeps each side independently testable and replaceable.

### III. Tested Publishing Flow (NON-NEGOTIABLE)

- Creating, editing, publishing, unpublishing, and rendering posts MUST have automated tests
  that run in CI before merge.
- Authentication and authorization for author-only actions MUST have automated tests.
- BE integration tests MUST run against a real PostgreSQL instance (e.g., container), not an
  in-memory substitute.
- Purely cosmetic UI changes do not require tests.

**Rationale**: Publishing is the blog's core value; a broken publish or a leaked draft is the worst failure.

### IV. Accessible by Default

- All pages MUST meet WCAG 2.2 AA: semantic HTML, keyboard navigation, visible focus, labelled
  form controls, sufficient contrast, and alt text for images.
- Published post content MUST be readable without client-side interactivity beyond loading the page.
- Accessibility regressions are treated as bugs, not enhancements.

**Rationale**: Readers must be able to read; accessibility is cheapest when built in from the start.

### V. Secure Authentication

- Users MUST log in to perform any write action; anonymous visitors may only read published content.
- Authentication MUST use ASP.NET Core Identity (or an equivalent standard provider); custom
  password hashing or token schemes are forbidden.
- Passwords MUST never be stored or logged in plain text; secrets MUST NOT be committed to source control.
- All input MUST be validated server-side, and user-supplied content MUST be encoded/sanitized
  before rendering.
- Drafts and unpublished posts MUST never be returned to unauthorized users by any API endpoint.

**Rationale**: Login introduces real user data and credentials; standard, proven mechanisms are the only safe default.

## Technology Constraints

- **Frontend**: React with TypeScript.
- **Backend**: ASP.NET Core Web API on the current .NET LTS release.
- **Database**: PostgreSQL; schema changes MUST go through versioned migrations (EF Core migrations).
- **Data access**: EF Core; raw SQL only where justified in the plan.
- **Deployment**: one FE build and one BE service plus a managed or containerized PostgreSQL;
  additional infrastructure (queues, caches, microservices) requires an amendment-level justification.

## Development Workflow & Quality Gates

- Every feature follows the Spec Kit flow: specify → plan → tasks → implement.
- A change MUST NOT merge unless: build passes, all tests pass, and the publishing-flow and auth tests
  in Principle III are green.
- Every plan MUST include a Constitution Check confirming compliance with Principles I–V or
  documenting a justified exception.
- Configuration and secrets are supplied via environment variables or user secrets, never hardcoded.

## Governance

- This constitution supersedes all other project practices and documents.
- Amendments are made via `/speckit-constitution`, MUST state the reason, and MUST bump the version:
  MAJOR for removed or redefined principles, MINOR for new principles or sections,
  PATCH for clarifications and wording.
- Each feature plan and code review MUST verify compliance; any added complexity MUST be justified
  in the plan's Complexity Tracking section.

**Version**: 1.0.0 | **Ratified**: 2026-10-09 | **Last Amended**: 2026-10-09
