# FlowBoard — Production Readiness Checklist

Everything a collaborative whiteboard needs to be a real product rather than a demo.
Items marked **[BUILT]** already exist in FlowBoard. Everything else is a gap.

---

## 1. Identity & Accounts

- Email/password signup and login
- Email verification
- Password reset via emailed token
- OAuth: Google, GitHub, Microsoft
- SSO / SAML for organisation accounts
- Two-factor authentication (TOTP + recovery codes)
- Session management — list active sessions, revoke individually
- JWT access tokens with refresh token rotation
- Account settings: display name, avatar, email change, password change
- Account deletion with data export first
- Soft delete + grace period before hard deletion
- Rate limiting on auth endpoints, lockout after repeated failures
- Bot protection on signup (CAPTCHA or equivalent)

## 2. Workspaces, Teams & Organisations

- Personal workspace created automatically on signup
- Team workspaces with multiple members
- Invite by email, invite by link, bulk invite
- Pending invitation management, resend, revoke
- Organisation roles: owner, admin, member, guest
- Transfer ownership
- Remove member, with reassignment of their boards
- Domain-based auto-join (anyone with @university.edu joins automatically)
- Workspace-level settings: default board permissions, allowed sharing scope
- Seat counting and limits

## 3. Board Management & Organisation

- Board dashboard: grid and list views
- Create board — blank, from template, or by duplicating
- Rename, duplicate, delete, restore from trash
- Trash with 30-day retention
- Folders / projects / nested organisation
- Starred and pinned boards
- Recently viewed
- Board thumbnails, auto-regenerated on change
- Board metadata: description, tags, cover colour
- Sort by name / created / modified / last opened
- Search boards by title, tag, and content
- Archive boards without deleting
- Board-level activity feed
- Bulk operations — move, delete, archive multiple boards

## 4. Canvas Engine

- **[BUILT]** Infinite canvas with pan and zoom
- **[BUILT]** Element selection and manipulation
- Multi-select: marquee, shift-click, select-all
- Grouping and ungrouping, nested groups
- Layers and explicit z-order control (bring forward/back, to front/back)
- Lock and unlock elements
- Hide/show elements
- Alignment tools: align left/centre/right/top/middle/bottom, distribute evenly
- Smart guides and snapping (to grid, to other objects, to centre lines)
- Grid overlay: dot grid, line grid, toggleable, configurable spacing
- Rulers and canvas coordinates
- Snap-to-grid toggle
- Copy / cut / paste, including paste from system clipboard
- Duplicate in place and duplicate with offset
- Rotate elements, with angle snapping
- Flip horizontal / vertical
- Proportional resize (shift-drag), resize from centre (alt-drag)
- Frames / sections — bounded regions that move their contents
- Infinite canvas boundaries or soft limits to prevent runaway coordinates
- Zoom to fit, zoom to selection, zoom presets, reset zoom
- Minimap for large boards
- Canvas background colour and pattern
- Keyboard shortcuts for every tool, with a discoverable shortcut sheet
- Right-click context menus, context-sensitive to selection
- Floating contextual toolbar near the selection

## 5. Drawing Tools & Styling

- **[BUILT]** Select, rectangle, circle, diamond, line, arrow
- **[BUILT]** Freehand pen, laser pen, eraser, text tool
- **[BUILT]** Stroke colour, stroke width, fill colour, opacity
- **[BUILT]** Rounded/sharp corners, solid/dashed/dotted strokes
- **[BUILT]** Rough and clean rendering styles
- Additional primitives: triangle, star, polygon (n-sided), cylinder, cloud, callout, speech bubble
- Freeform polygon and bezier path tool with editable control points
- Sticky notes as a first-class element with auto-sizing text
- Highlighter tool (multiply blend)
- Shape fill patterns: hachure, cross-hatch, solid, gradient
- Custom colour picker with hex/RGB/HSL input
- Colour palettes: recent colours, saved palettes, workspace brand palette
- Eyedropper tool
- Style copy/paste (copy formatting from one element to another)
- Default style memory per tool
- Line endpoint styles: arrow, circle, diamond, bar, none — independently per end
- Line routing: straight, elbow/orthogonal, curved
- Shadow and blur effects
- Element-level border radius control

## 6. Connectors & Diagramming

- **Bound connectors** — arrows attach to shapes by ID, not coordinates, and follow when the shape moves
- Anchor points on shape edges, plus automatic nearest-edge selection
- Automatic rerouting to avoid overlapping other elements
- Connector labels (text attached to the midpoint of a line)
- Connector-aware dragging: move a shape, its connections stay valid
- Auto-layout algorithms — hierarchical (Sugiyama), force-directed, tree, grid
- "Tidy up" command to normalise spacing and alignment of a selection
- Swimlanes and containers
- Mermaid / PlantUML / Graphviz text-to-diagram import
- Diagram validation (e.g. detect orphan nodes, cycles in a flowchart)

## 7. Text & Rich Content

- **[BUILT]** Inline text editing
- Rich text: bold, italic, underline, strikethrough, inline code
- Font family selection, font size, line height, letter spacing
- Text alignment: left/centre/right/justify, vertical alignment
- Bulleted and numbered lists inside text elements
- Hyperlinks within text
- Text on a path / curved text
- Auto-sizing vs fixed-width text boxes with wrapping
- Markdown shortcuts while typing
- Code blocks with syntax highlighting
- Math/LaTeX rendering
- Tables as canvas elements, with editable cells
- Spell check

## 8. Media & Embeds

- **[BUILT]** Image upload
- Cloud image storage (S3/R2/Cloudinary) — not base64 in the board document
- Image optimisation: resize, compress, WebP conversion, thumbnail generation
- Drag-and-drop and paste-from-clipboard image insert
- Image cropping, masking to shape
- SVG import as editable vector elements
- File attachments (PDF, DOCX, etc.) with inline preview
- PDF import — each page placed as a canvas image or as an embedded viewer
- Video embeds (YouTube, Vimeo, Loom) with inline playback
- Live embeds: Figma, Google Docs/Sheets/Slides, CodeSandbox, Miro
- Link unfurling — paste a URL, get a rich preview card
- GIF support with animation
- Audio notes recorded directly onto the canvas
- Icon and sticker library, searchable
- Stock image search integrated (Unsplash or similar)

## 9. Real-Time Collaboration & Sync

- **[BUILT]** Collaborative rooms, invite collaborators
- **[BUILT]** Live cursors, real-time canvas sync over Socket.IO
- **[BUILT]** Multiple concurrent editors
- **CRDT-based state** (Yjs, Automerge, or custom) replacing naive event broadcast
- Deterministic conflict resolution — concurrent edits to the same element converge
- Offline editing with an IndexedDB operation queue
- Sync-on-reconnect with reconciliation, no lost work
- Optimistic local updates with server confirmation and rollback
- Awareness protocol: cursor, selection, current tool, viewport, per user
- Named cursors with user colour assignment and avatar
- Presence list — who is in the board right now
- Join/leave lifecycle events and notifications
- Connection state UI: connected, reconnecting, offline, syncing
- Redis pub/sub adapter so multiple server instances serve one room
- Horizontal scaling with sticky sessions or a stateless socket layer
- Delta compression and message batching on the wire
- Server-side authoritative persistence — periodic snapshot + op log
- Room capacity limits and graceful degradation under load
- Conflict-free undo/redo in a multi-user context (undo only your own operations)

## 10. Presence, Voice & Video

- **[BUILT]** WebRTC voice chat
- TURN server for NAT traversal (production WebRTC fails without one)
- SFU for group calls beyond a handful of participants
- Video calling with tiled and speaker layouts
- Screen sharing onto the canvas
- Mute/unmute, camera toggle, device selection, audio level indicators
- Push-to-talk
- Follow mode — participants' viewports follow a presenter
- "Bring everyone here" — presenter forces viewport sync
- Spotlight a user
- Text chat panel with history and @mentions
- Emoji reactions that float over the canvas
- Raise hand
- Recording of sessions (canvas + audio)
- Live transcription of voice chat

## 11. Comments & Feedback

- Comment pins anchored to canvas coordinates
- Comments attached to specific elements, moving with them
- Threaded replies
- @mentions with notification
- Resolve / unresolve threads, filter to show unresolved only
- Comment sidebar listing all threads
- Reactions on comments
- Edit and delete own comments
- Rich text and image attachments in comments

## 12. Permissions & Sharing

- Board roles: owner, editor, commenter, viewer
- Per-user permission assignment
- Share links with role attached (anyone-with-link can view/edit)
- Link expiry dates, password-protected links
- Guest access without an account
- Public boards with SEO-friendly read-only pages
- Embed board in an external page via iframe with a restricted token
- Domain-restricted sharing
- Copy protection for viewers (disable export/duplicate)
- Permission inheritance from workspace to board
- Audit log — who did what, when, from where
- Transfer board ownership

## 13. Version History

- Periodic automatic snapshots
- Named manual checkpoints
- Timeline scrubber to view any past state
- Restore to a previous version (non-destructive — creates a new version)
- Diff view highlighting what changed between versions
- Per-element edit history and attribution ("who drew this")
- Session replay — watch the board being built
- Retention policy by plan tier
- Duplicate-from-version

## 14. AI Layer

- **[BUILT]** AI assistant, natural language → diagram
- **[BUILT]** Flowcharts, system architectures, process diagrams
- **[BUILT]** Structured output with validation, auto-layout, preview before insert
- **[BUILT]** Native editable elements, non-destructive insert, undo/redo integration, sync via Socket.IO
- **Canvas comprehension** — send existing board state to the model
- "Explain this diagram" / "what's wrong with this architecture" / "what's missing"
- **AI editing of existing diagrams** — modify what's on canvas rather than generating anew
- Natural language element manipulation ("make all the database boxes blue")
- Shape beautification — freehand stroke → clean primitive ($1 recognizer or classifier)
- Handwriting recognition — ink strokes → text
- Sticky note clustering — embed notes, group semantically, auto-label clusters
- Brainstorm expansion — "give me 10 more ideas like these"
- Session summarisation — board + chat + transcript → meeting notes and action items
- Diagram → code (SQL DDL from an ER diagram, Terraform from an architecture diagram, Mermaid export)
- Code → diagram (paste a schema or repo structure, get a diagram)
- Image → editable diagram (photograph a physical whiteboard, get native elements)
- Semantic search across all boards using embeddings
- AI-suggested templates based on what the user starts drawing
- Streaming responses with partial rendering
- Token/cost tracking per workspace, usage limits by plan
- Prompt injection defence and output sanitisation
- Model fallback chain when the primary provider fails
- Caching of identical prompts
- User-visible AI action history, all AI changes reversible

## 15. Templates & Facilitation

- Template gallery with categories and search
- Built-ins: flowchart, ER diagram, mind map, SWOT, retrospective, user journey, kanban, org chart, wireframe, business model canvas, fishbone, timeline, roadmap
- Save any board or selection as a custom template
- Workspace-shared template library
- Community template gallery
- Facilitation tools: session timer, dot voting, private mode (hide others' notes until reveal), anonymous mode
- Breakout areas within a board
- Presentation mode — defined frames as slides, with next/previous navigation

## 16. Search & Discovery

- Search within a board — text in elements, sticky notes, comments
- Global search across all accessible boards
- Filter by author, date, element type, tag
- Jump-to-result, highlighting the element on canvas
- Semantic/vector search over board content
- Recently edited and recently viewed surfaces

## 17. Import, Export & Interoperability

- **[BUILT]** Export canvas as image
- Export PNG at selectable scale (1x/2x/3x), with transparent background option
- Export SVG (vector, editable elsewhere)
- Export PDF, single page and multi-page by frame
- Export selection only vs whole board
- Export board as JSON (own format, documented and versioned)
- Import own JSON
- Import from Excalidraw, Miro, FigJam, Draw.io/diagrams.net, Lucidchart
- Mermaid and PlantUML import/export
- Copy selection as image to clipboard
- Copy as Mermaid/Markdown for pasting into docs
- Batch/bulk export of a workspace
- Watermarking on free-tier exports (if monetising)

## 18. Integrations & Public API

- REST API covering boards, elements, users, with API keys
- Webhooks on board events (created, updated, shared, commented)
- OAuth app platform so third parties can integrate
- Slack: share a board, unfurl links, notifications
- Microsoft Teams app
- Google Drive and Google Workspace integration
- Jira / Linear / Asana — turn sticky notes into tickets
- GitHub — link diagrams to repos, render in PRs
- Notion and Confluence embeds
- Zapier / Make connectors
- Figma import/export
- Calendar integration for scheduled sessions
- SDK / embeddable component for third-party products
- API rate limiting, quotas, and developer documentation

## 19. Notifications

- In-app notification centre
- Email notifications: invites, mentions, comments, shares
- Digest emails (daily/weekly), with frequency controls
- Web push notifications
- Mobile push (FCM/APNs)
- Per-board notification subscription, mute board
- Granular notification preferences per event type
- Unsubscribe links compliant with email regulations

## 20. Mobile, Tablet & Input

- Responsive web layout down to phone width
- Touch gestures: pinch-zoom, two-finger pan, tap-select, long-press menu
- Stylus support with pressure sensitivity and tilt
- Palm rejection
- Apple Pencil double-tap and hover support
- Native or PWA mobile app, installable, offline-capable
- Mobile-optimised toolbar and property panels
- Trackpad gestures on desktop
- Multi-monitor and high-DPI rendering correctness
- Browser zoom independence

## 21. Accessibility

- Full keyboard navigation — every action reachable without a mouse
- Focus indicators and logical tab order
- Screen reader support: ARIA labels, element descriptions, canvas alternative text
- Alt text on images, author-editable
- Colour contrast meeting WCAG 2.1 AA
- Colour-blind-safe default palettes
- Respect `prefers-reduced-motion`
- Adjustable UI scale and font size
- High-contrast theme
- Captions on recorded sessions

## 22. Internationalisation

- UI string externalisation and translation framework
- RTL layout support (Arabic, Urdu, Hebrew)
- Locale-aware date, time, and number formatting
- Unicode text rendering on canvas, including CJK and complex scripts
- Font fallback chain for non-Latin scripts
- Timezone handling for timestamps and scheduled sessions

## 23. Performance

- Spatial indexing (quadtree/R-tree) for hit-testing and culling
- Viewport culling — render only what's visible
- Dirty-rectangle redraw rather than full-canvas repaint
- Canvas layering: static content, active editing, overlay/cursors on separate layers
- WebGL renderer (PixiJS/regl) for boards with tens of thousands of elements
- Virtualised element list in panels
- Web Workers for serialisation, layout computation, and image processing
- Lazy loading of images and off-screen content
- Progressive board loading — render what's near the viewport first
- Code splitting and route-level lazy loading
- Bundle size budget and monitoring
- Debounced/throttled network emissions
- Memory leak prevention — element pooling, listener cleanup
- Target metrics: 60fps pan/zoom at 10k elements, <2s board open, <100ms sync latency
- Documented load testing with simulated concurrent users

## 24. Backend Architecture

- Database schema with proper indexing and migration tooling
- Connection pooling
- Read replicas for dashboard and search queries
- Redis for sessions, pub/sub, rate limiting, and hot board state
- Object storage for images and attachments, with CDN in front
- Background job queue (BullMQ/Celery) for exports, thumbnails, emails, AI jobs
- Scheduled jobs: snapshot compaction, trash purging, usage aggregation
- Caching strategy with explicit invalidation
- Graceful shutdown and connection draining on deploy
- Health check and readiness endpoints
- Database backups: automated, tested restores, point-in-time recovery
- Disaster recovery plan with documented RTO/RPO
- Multi-region consideration for latency

## 25. Security

- HTTPS everywhere, HSTS
- Input validation and sanitisation on every endpoint
- Output encoding, XSS prevention (SVG upload is a common vector)
- SQL injection prevention via parameterised queries
- CSRF protection
- Content Security Policy headers
- Secure cookie flags: HttpOnly, Secure, SameSite
- Rate limiting per IP, per user, per endpoint
- Authorisation checks on every socket event, not just HTTP routes
- Signed URLs for media access with expiry
- File upload validation: type, size, magic bytes, malware scan
- Secrets management — no credentials in source
- Dependency vulnerability scanning in CI
- Encryption at rest and in transit
- Penetration testing before launch
- Security incident response plan
- Responsible disclosure policy

## 26. Privacy & Compliance

- Privacy policy and terms of service
- Cookie consent where required
- GDPR: data export, right to erasure, processing records
- Data residency options
- Data retention policy, enforced automatically
- DPA templates for business customers
- Sub-processor list
- SOC 2 readiness (for enterprise sales)
- Anonymised analytics with opt-out
- Clear disclosure of what board content is sent to AI providers

## 27. Observability

- Structured logging with correlation IDs across HTTP and socket events
- Error tracking (Sentry) for frontend and backend
- APM with distributed tracing
- Real user monitoring: load time, FPS, sync latency, by device class
- Metrics dashboard: active rooms, concurrent users, message throughput, AI token spend
- Alerting on error rate, latency, queue depth, connection drops
- Uptime monitoring and public status page
- Product analytics: feature adoption, funnels, retention
- Session replay for debugging (privacy-scrubbed)
- Feature flags for staged rollout and kill switches

## 28. DevOps & Delivery

- Dockerised services, docker-compose for local development
- Infrastructure as code (Terraform/Pulumi)
- CI pipeline: lint, typecheck, unit tests, integration tests, build
- CD with staging → production promotion
- Blue-green or rolling deploys with automatic rollback
- Database migration strategy that tolerates rolling deploys
- Environment parity and configuration via environment variables
- Preview environments per pull request
- CDN for static assets with cache busting
- Autoscaling policies
- Cost monitoring and budget alerts

## 29. Testing & Quality

- Unit tests for geometry, CRDT operations, serialisation
- Integration tests for API and socket flows
- Multi-client sync tests — two simulated clients, assert convergence
- End-to-end tests (Playwright) covering core user journeys
- Visual regression testing for canvas rendering
- Load/stress testing of the realtime layer
- Chaos testing: dropped connections, server restarts mid-session
- Cross-browser matrix: Chrome, Firefox, Safari, Edge
- Device testing: iOS Safari, Android Chrome, iPad with Pencil
- Accessibility automated audits plus manual screen reader testing
- Type safety end to end (TypeScript with strict mode, shared types)
- Linting, formatting, pre-commit hooks
- Code review process and branch protection

## 30. Monetisation (if commercial)

- Plan tiers with enforced limits (boards, collaborators, AI credits, history retention)
- Stripe integration: subscriptions, upgrades, downgrades, proration
- Seat-based billing with automatic adjustment
- Free trial with conversion flow
- Usage metering for AI consumption
- Invoices, receipts, billing portal
- Tax handling (VAT/GST)
- Dunning for failed payments
- Coupons, discounts, education pricing
- Paywall and upgrade prompts at limit boundaries

## 31. Admin & Enterprise

- Admin console: user management, board oversight, usage stats
- Impersonation for support (logged and consented)
- Content moderation and abuse reporting
- Organisation-wide policy enforcement
- SCIM user provisioning
- Audit log export
- Self-hosted / on-premise deployment option
- SLA definition and monitoring

## 32. Onboarding, Docs & Support

- First-run onboarding tour
- Sample board pre-populated for new users
- Empty states with guidance rather than blank screens
- Contextual tooltips and a keyboard shortcut overlay
- Help centre with searchable articles
- Video tutorials
- In-app changelog and what's-new
- Support contact and ticketing
- Public roadmap and feedback board
- Developer documentation for the API
- Status page and incident communication

---

## Realistic Scope Note

This list describes a funded product with a team, not a final year project. Attempting it will
sink the FYP.

For the proposal, the defensible subset is:

**Must have** — sections 1, 2 (light), 3, 9 (CRDT + offline + scaling), 12, 13, 24, 25 (basics),
6 (bound connectors), 8 (cloud image storage)

**Differentiator** — section 14, picking three or four of the canvas-comprehension items

**Depth for marks** — section 23 (with measured benchmarks in the report), 29 (multi-client sync tests)

**Nice to have if time allows** — sections 11, 15, 17, 21

Everything else belongs in the "Future Work" chapter of the final report, which is itself a
section examiners expect to see and which demonstrates you understand the full problem space.
