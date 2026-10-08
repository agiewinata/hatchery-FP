# Studio: 2D image to 3D printable model

Date: 2026-10-07
Status: Implemented. Built in two passes on 2026-10-07 - the geometry core
and editor first, then persistence, sharing and moderation.

Deviations from this document, all deliberate:
  - `holePosition` offers five placements, not four corners (section 4.4).
  - `earcut` is a third dependency (section 11 explains why).
  - Admin reads only PUBLIC designs. There is no admin view of a private
    design: unlike an order, a private design is not something the platform
    has any business reading, and moderation only needs what was published.

## 1. Goal

A self-contained browser environment in the Keychain marketplace where a
signed-in user turns a 2D image into a 3D-printable model, adjusts it against a
catalog of pre-designed parametric templates, saves it, optionally shares it
publicly, and exports an STL.

It is a **standalone tool**. It does not sell anything.

## 2. Scope

### In scope

- Upload a 2D image; trace its silhouette; extrude it into a flat charm.
- A catalog of parametric templates (keychain tag, bag charm, pin back,
  standee base) whose named parameters the user edits.
- Save designs to the user's account; reopen and edit them.
- Publish a design at a public URL; unpublish it again.
- Export binary STL for slicing.
- Admin takedown of a published design.

### Explicitly NOT in scope

- **No commerce.** `Product`, `OrderItem`, `fulfilmentType`, cart, checkout,
  the production queue and the earnings ledger are untouched. CLAUDE.md warns
  against forking the hybrid fulfilment model; this feature does not go near it.
- **No AI reconstruction.** No photo-to-3D service, no GPU dependency, no API
  keys, no per-generation cost.
- **No mesh import.** No STL/OBJ/3MF parsing of user files.
- **No sculpting or vertex editing.**
- **No source-image retention.** See 3.

## 3. Decision record

Three approaches were considered. **Approach A was chosen.**

| | Approach | Outcome |
|---|---|---|
| **A** | Client generates geometry; server stores the traced outline + parameters | **Chosen** |
| B | Server traces and meshes; stores an STL blob | Rejected |
| C | As A, but the source image is also stored | Rejected |

**Why A.** The traced silhouette polygon, not the source photo, is the
meaningful artifact. It is 1-10 KB of JSON, renders identically for any viewer,
and requires no blob storage, no upload quota and no retention of user images -
which keeps the public sharing surface to user-authored text only.

**Why not B.** Every slider drag would need a server round trip, server CPU and
a server-side meshing library. Wrong shape for an interactive editor.

**Why not C.** Storing user images indefinitely adds a storage quota, a
retention obligation, and an image moderation surface on a project graded for
security. The only thing it buys is re-tuning the trace threshold after
reopening.

**Accepted cost of A:** the trace threshold cannot be re-tuned after reopening
a saved design without re-uploading the image, because the pixels are gone.

## 4. Architecture

### 4.1 Hard constraints taken from the existing codebase

These are not preferences; violating any of them breaks something.

- **CSP forbids WASM.** `proxy.ts` issues
  `script-src 'self' 'nonce-...' 'strict-dynamic'` with **no
  `wasm-unsafe-eval`**. Every WASM mesh library (`manifold-3d` and similar) is
  therefore unusable. The design avoids CSG entirely so that **no CSP change is
  required**.
- **`connect-src 'self'`.** No browser calls to third-party origins. Templates
  ship from our own origin.
- **The DAL owns authorization.** `proxy.ts` does not authorize. Guards live in
  `lib/data/*` and throw.
- **Every mutation guards, then Zod-parses.** A Server Action is its own POST
  endpoint, reachable without the page ever rendering.
- **Pure logic gets unit tests.** The geometry pipeline is pure by construction.

### 4.2 Module layout

```
lib/studio/
  types.ts      Vec2, Ring, Outline, Mesh; signedArea, pointInRing
  mask.ts       RGBA pixels    -> binary foreground mask
  contour.ts    mask           -> closed rings (outer + holes)
  simplify.ts   ring           -> fewer points (collinear collapse + Douglas-Peucker)
  geometry.ts   outline+params -> indexed triangle mesh
  stl.ts        mesh           -> ArrayBuffer (binary STL)
  templates.ts  parametric template catalog

lib/validation/studio.ts   Zod schemas (outline, params, design input)
lib/data/studio.ts         DAL: server-only, guards, DTOs
lib/actions/studio.ts      "use server": guard, parse, delegate
```

**`lib/studio/*` must not import Three.js.** The same discipline as
`lib/errors.ts` importing nothing: the maths returns plain typed arrays, and
only the viewer component converts them into a `BufferGeometry`. This keeps the
tests free of WebGL and keeps the core honest.

### 4.3 Pipeline

1. **`buildMask(rgba, width, height, options)`**
   Auto-detects transparency. If any pixel has alpha < 255, foreground is
   `alpha >= alphaThreshold`; otherwise foreground is
   `luminance <= luminanceThreshold` (dark ink on light paper), with an
   `invert` option. Luminance is `0.2126R + 0.7152G + 0.0722B`.

2. **`traceRings(mask)`**
   The contour is the boundary of the union of foreground unit squares. Every
   edge between a foreground and a background pixel is emitted as a *directed*
   unit edge with foreground on the left, then edges are stitched head-to-tail
   into closed rings. This is exact for a binary mask, and far easier to reason
   about and test than marching squares, which needs saddle-case tie-breaking.
   Outer rings and holes are separated by the sign of `signedArea`; holes are
   assigned to their containing outer ring with `pointInRing`.

   *Known limitation:* at a diagonal pinch a vertex has two outgoing edges; the
   first is taken deterministically. Documented rather than hidden.

3. **`simplifyRing(ring, tolerance)`**
   Collinear runs collapse first (a blocky traced edge is a straight run of unit
   steps), then Douglas-Peucker.

   **This stage is load-bearing, not polish:** raw tracing emits a vertex per
   pixel boundary, so a 1000px logo yields tens of thousands of points - an STL
   no slicer wants and a UI that stutters on every slider drag.

4. **`buildGeometry(outline, params)`**
   Triangulates the outline *with its holes* via earcut, emits a top cap at
   `+thickness/2`, a bottom cap at `-thickness/2` with reversed winding, and
   side walls for every ring.

   **The keyring hole is a polygon hole, not a boolean subtract.** Adding a ring
   to the polygon before triangulation is what removes any need for CSG, and
   therefore for WASM. This single decision is what keeps the feature inside the
   existing CSP.

   Output must be **watertight**: every edge shared by exactly two triangles.

5. **`toBinaryStl(mesh)`**
   `84 + 50n` bytes: an 80-byte header, a `uint32` triangle count, then 50 bytes
   per triangle (normal, three vertices, attribute word).

Units are **millimetres**. Image pixels map to mm through a `widthMm`
parameter. Printability is validated and reported as form errors rather than
letting someone export something unprintable. Starting limits, chosen for FDM
printing at a 0.4 mm nozzle:

| Rule | Limit |
|---|---|
| Minimum thickness | 1.2 mm (three 0.4 mm walls) |
| Maximum thickness | 20 mm |
| Minimum width | 10 mm |
| Maximum width | 200 mm (typical bed) |
| Minimum keyring hole diameter | 3 mm |
| Hole must clear the edge by | 1.5 mm |

### 4.4 Template contract

A template is a pure description, not a class: an id, a label, and the
parameters it exposes. `buildGeometry` switches on `templateId` and reads only
the parameters that template declares, so adding a template cannot change the
behaviour of an existing one.

| `templateId` | What it is | Parameters beyond `widthMm` + `thicknessMm` |
|---|---|---|
| `flat-charm` | The traced silhouette, extruded. No additions. | - |
| `keychain-tag` | Silhouette plus a punched keyring hole | `holeDiameterMm`, `holeInsetMm`, `holePosition` (four corners plus `top-center`, which is the usual placement for a charm) |
| `pin-back` | Silhouette with a flat rear face and a thicker rim | `rimWidthMm` |
| `standee-base` | Silhouette plus a slot-and-foot base so it stands up | `slotWidthMm`, `baseHeightMm` |

Parameters are validated by a Zod **discriminated union on `templateId`**, so a
request carrying `keychain-tag` parameters against `flat-charm` is rejected
rather than silently ignored. This mirrors how `fulfilmentType` discriminates
one `Product` table into two variants with their own required fields.

Only `flat-charm` and `keychain-tag` need to ship first; `pin-back` and
`standee-base` are additive and must not require touching the pipeline.

## 5. Data model

```prisma
model StudioDesign {
  id         String  @id @default(cuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  title      String
  slug       String  @unique        // server-generated, for the share URL
  templateId String

  outline    Json                   // traced rings: outer + holes
  params     Json                   // template parameter values

  visibility DesignVisibility @default(PRIVATE)

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId])
  @@index([visibility, createdAt])
  @@map("studio_design")
}

enum DesignVisibility {
  PRIVATE
  PUBLIC
}
```

Delivered as a `prisma migrate dev` migration. Never `db push`.

### 5.1 JSON columns are parsed on read

`outline` and `params` are schemaless at the database level, so a row written by
an older version of the code is untrusted input to today's renderer. The DAL
Zod-parses both before building a DTO; a malformed row becomes a handled error,
not a crash inside the viewer.

### 5.2 Size caps

Storing geometry is the one genuinely new abuse vector this feature introduces.
The schema caps rings per outline, points per ring and total points; a per-user
design count caps storage growth. Without this, a single request can store a
million-point polygon and degrade every viewer that opens it.

## 6. Access control

`lib/data/studio.ts`, `server-only`, following the existing DAL shape exactly:

| Function | Guard | Scoping |
|---|---|---|
| `listOwnDesigns()` | `requireUser` | `where: { userId }` |
| `getOwnDesign(id)` | `requireUser` | `findFirst({ id, userId })` |
| `createDesign(input)` | `requireUser` | `userId` from session |
| `updateDesign(id, input)` | `requireUser` | `updateMany({ id, userId })` |
| `setVisibility(id, v)` | `requireUser` | `updateMany({ id, userId })` |
| `deleteDesign(id)` | `requireUser` | `deleteMany({ id, userId })` |
| `getPublicDesign(slug)` | none | `where: { slug, visibility: PUBLIC }` |
| `adminUnpublish(id)` | `requireAdmin` | audited |

Writes go through `updateMany`/`deleteMany` so a mismatched owner yields
`count: 0` rather than touching another user's row. Ownership is never read from
a request body.

## 7. Public surface and moderation

- **Titles render as plain text.** No markdown, no `dangerouslySetInnerHTML` -
  the same rule the codebase already applies to seller bios.
- **No source images are stored**, so there is no user-supplied imagery to
  moderate. This falls out of Approach A.
- **No author real name.** A public design shows the seller `displayName` when
  the author has a seller profile, and otherwise no attribution. A plain buyer's
  `user.name` is a real person's name and must not appear on a page they merely
  shared a shape to - consistent with `PublicPortfolio` deliberately omitting
  the owner's email.
- **Slugs are server-generated** - `slugify(title)` plus a short random suffix,
  with the uniqueness retry loop `newOrderNumber()` already uses - so nobody can
  squat a name or impersonate another maker.
- **Admin takedown** sets `visibility` back to `PRIVATE` and writes to
  `AuditLog` beside the existing seller-approval entries. Publishing
  user-authored content with no takedown path is a gap on a security-graded
  project.

## 8. Routes

```
app/(shop)/studio/page.tsx                editor               PRIVATE
app/(shop)/studio/designs/page.tsx        your saved designs   PRIVATE
app/(shop)/studio/designs/[id]/page.tsx   edit one of yours    PRIVATE
app/(shop)/designs/[slug]/page.tsx        shared design        PUBLIC
```

`"/studio"` is added to `PRIVATE_PREFIXES` in `lib/route-access.ts`.

**The public share page lives at `/designs/[slug]`, deliberately outside
`/studio`.** Had sharing lived at `/studio/shared/...`, adding `/studio` to the
private prefixes would send every shared link to the login page - the same
failure that once sent every public artist portfolio to `/login`, and in the
same hard-to-notice direction, because a login page looks like it is working.
Splitting public from private at the path prefix removes the need for a
carve-out.

There is no escape-hatch page inside `/studio`, so unlike the seller area this
needs no `(dashboard)`-style route group: the gate has nothing it could
accidentally wrap.

New `route-access.test.ts` cases assert both directions, including that
`/studiolike` does **not** match `/studio`.

## 9. UI and bundle strategy

- Image drop zone and trace controls (threshold, simplify tolerance) on one
  side; the WebGL canvas in the middle; template picker and parameters on the
  other; Save and Export STL below. Stacks to one column on narrow screens.
- **Three.js is a `next/dynamic` import with `ssr: false`**, loaded only by the
  studio pages. It cannot server-render and is ~600 KB, so nothing in
  `(shop)/layout.tsx` or the header may touch it. Its chunks are fetched by
  Next's own nonced loader, which `'strict-dynamic'` permits.
- **Accessibility, honestly stated:** a 3D manipulation surface has real limits.
  Every parameter is a labelled form input with a numeric readout, so a design
  is fully adjustable from the keyboard; the canvas is a preview, not the only
  way to work. Printability problems surface as form errors, not canvas
  overlays.

## 10. Testing

Extends the existing 126 tests. Same vitest node environment: no DOM, no WebGL.

| Module | Assertions |
|---|---|
| `mask.ts` | alpha vs luminance thresholding; all-transparent and all-opaque edges; invert |
| `contour.ts` | known bitmaps to expected rings: square = 1, donut = 2, two blobs = 2 outer; hole winding opposite to its outer ring |
| `simplify.ts` | collinear points dropped; endpoints preserved; tolerance monotonic |
| `geometry.ts` | **watertightness as a property test** - every edge shared by exactly two triangles, over a spread of generated shapes; hole produces expected winding |
| `stl.ts` | byte length is exactly `84 + 50n`; header and triangle count correct |
| `validation/studio.ts` | oversized outlines rejected; params union rejects a mismatched `templateId` |
| `route-access.ts` | `/studio` private; `/designs/x` public; `/studiolike` unmatched |

## 11. Dependencies

- `three` + `@types/three` - the viewer only.
- `earcut` - polygon triangulation with holes.

**Correction to the design discussion:** the third section of the design
conversation stated "three and @types/three, nothing else". That was wrong. Three bundles earcut
internally for `ShapeUtils`, but `lib/studio/*` may not import Three (see 4.2),
so earcut is needed as its own dependency. It is ~4 KB, dependency-free, pure
JS and widely used; hand-rolling triangulation with hole support would be the
worse choice.

No WASM, no CSG library, no external service, no API keys, no per-use cost.

## 12. Future work (not in this spec)

- Re-tuning the trace threshold after reopening, which needs image retention.
- Relief/heightmap and lithophane conversion modes.
- Mesh import and boolean operations - would require a CSP change for WASM, and
  a binary parser over untrusted input.
- Any commerce integration.
