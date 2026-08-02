# Fence sketcher

Sketch a fence line, get the materials list, then walk around it in 3D.

The editor is one HTML file with no runtime dependencies, build step or
framework. Open
`fence-fable.html` in a browser and it works — on a phone, offline, from a USB
stick. The optional Node server keeps named backups and can publish explicitly
created view-only snapshots without exposing the private backup API. The public
viewer is deployed separately as a Cloudflare Worker; the editor itself remains
dependency-free.

## Repository workflow

`staging` is the integration branch and the normal deployment target. `main` is
reserved for an explicit production promotion. Work is done on a short-lived
feature branch based on `staging`, then merged through a pull request:

```sh
git fetch origin --prune
git switch staging
git pull --ff-only
git switch -c feat/<short-description>
```

Open the pull request against `staging`. Merging it runs the staging validation
and deployment workflow. Promote `staging` to `main` through a separate pull
request only when production is required. Do not commit drawings, share data,
secrets, or generated Worker output.

The canonical live checkout in this environment is
`/home/gbot/repo/fence-sketcher`; the private server uses that checkout and a
separate data directory configured with `FENCE_DATA_DIR`.

---

## What it does

**Draw the fence.** Tap to drop posts, tap the first post to close a loop,
double-tap or `Esc` to finish a run. Drag anything to move it. Points snap to
existing posts and building corners, then to fence lines and building edges,
then to alignment with neighbouring posts or another point on the same fence
(with dashed guides), then to 45°/90° rays off the last post, then to the
dynamic grid — first match wins. The **Snap objects** toggle controls the
post/corner/edge snaps; the grid spacing adapts to zoom so it stays useful at
both building-scale and site-scale views.

**Dimension it.** Press `D` for the dimension tool, click what you are
measuring, position the dimension, then type the value — and the drawing moves
to suit. Distances between posts, from a post to a building corner or wall,
segment lengths and corner angles all drive the geometry rather than just
annotating it. See [Dimensions](#dimensions).

**Get the quantities.** Live totals for posts, rails, palings, handrail metres,
gates and corners, with the working shown ("13 panels, 1 corner, 1 gate").
`📋 Copy summary` puts a plain-text takeoff on the clipboard.

**See it built.** The 🧊 3D button swaps the plan for a walkable 3D model of
the same drawing — posts, rails, palings, gates, handrail and buildings —
rendered from the same state as the totals. Use the orientation cube, drag to
orbit, right-drag or two fingers to pan, and scroll or pinch to zoom. Full
screen and automatic orbit controls are available on larger and smaller
screens.

### Features

- **Two fence styles** — palings (boards) or post-and-rail.
- **Per-fence settings.** Every fence line follows the shared defaults until you
  tick "This fence has its own settings", then it can keep its own name,
  spacing, style, height, rail side, post shapes, end-post rule, handrail and
  materials inclusion. Totals aggregate across all included fences.
- **Gates.** Mark any segment as a gate: its opening is excluded from fence length
  and panel totals, while its support posts and leaf rails/palings are included in
  materials unless those BOM components are excluded. Gate-only runs are named
  `Gate 1`, `Gate 2`, and so on by default and can be renamed.
- **Handrail.** An optional capping rail along the tops of the posts, with its
  own cross-section. Counted in linear metres, and it skips gate openings.
- **Posts.** Choose square or round posts for a complete run, then override an
  individual endpoint when a corner or shared junction needs a different
  shape. End posts support `Auto`, `Both`, `One end` (with a physical endpoint
  choice), and `None`; the same rules drive the plan, 3D scene and materials.
- **Buildings.** Drop a rectangle, drag it, resize from the corners, and set a
  wall height plus a flat, gable or single-pitch roof. Fences snap to building
  corners and edges. Select several building parts and explicitly **Group**
  them to make one movable/resizable composite house; **Ungroup** restores the
  parts. Group boundaries show derived lengths on each continuous external
  edge. Buildings are excluded from materials. A building never moves to satisfy
  a dimension, and dimensions taken to its corners or walls are stored as
  coordinates — move or resize the building and they stay where they were.
- **Named, selectable fences.** Fence and gate labels are visible in plan and
  can be selected directly. The same labels can be selected in 3D to inspect
  their settings; the 3D label overlay can be turned off independently.
- **Driving dimensions.** Distances, segment lengths and corner angles that move
  the drawing when you type a value, and hold it when something moves nearby.
  Placed, selected, dragged and deleted on the plan itself. See
  [Dimensions](#dimensions).
- **Per-fence 3D visibility.** Hide a fence from the 3D scene while retaining a
  muted dotted, labelled reference in plan and keeping its materials counted.
- **Metric or imperial.** Everything is stored in metres; units only affect
  display and parsing. `12'6"`, `12 ft 6 in`, `6"` and bare numbers all parse.
  Fields you haven't touched jump to the sensible default for the new unit
  (2.4 m ↔ 8 ft); fields you have typed into stay put.
- **Live materials controls.** Exclude an individual fence, or just its rails or
  palings, from the bill of materials without hiding it from the plan, and copy a
  detailed plain-text takeoff with the current names, lengths, post shapes and
  settings.
- **Light / dark theme**, remembered.
- **Autosave** to `localStorage`, plus named server backups managed from the
  top-right **Files** menu.
- **Undo and redo** (`Ctrl+Z` / `Ctrl+Y` or `Cmd+Shift+Z`), 100 deep.
- **View-only sharing.** Publish a saved drawing as an expiring, revocable link.
  Viewers can use the plan, 3D controls, labels, units and materials summary,
  but cannot change or save the drawing.

---

## Dimensions

Dimensions here work the way a CAD sketch does: they **drive** the geometry
rather than reporting it. Type a value and the drawing moves to satisfy it.

**Placing one.** Press `D` or the toolbar **Dimension** button, then:

| Click | Gives |
| --- | --- |
| a fence | that segment's length |
| a post, then a building corner | straight-line distance |
| a post, then a building wall | perpendicular distance to that wall line |
| a post, then another post | distance between them |
| two fences meeting at a post | the corner angle |

What the cursor would grab highlights before you click, and the pick you are
holding stays highlighted while you choose the second. Then **move to position
the dimension and click to place it** — the same drag-to-position step a CAD
sketch uses — and type the value where it lands. `Enter` accepts, `Esc` backs
out one stage at a time: the placement, then the held pick, then the tool.

The tool stays armed for the next dimension, so leave it with `Esc` or `D`
before selecting anything.

**Living with them.** A dimension is an entity, not a label:

- **Click** to select — the whole dimension picks, not just the number.
- **Drag** to slide it clear of the drawing; the value and geometry don't move.
- **Double-click** to retype the value in place.
- **Delete** to remove it, leaving the geometry exactly where it stands.
- Whatever you have just typed stays selected, so its **✕** and, for angles,
  **⇄** are to hand immediately.

**Which end moves.** Only a fence post can move to satisfy a dimension, so one
end of a pair must be one; buildings never move. With two posts, the one
clicked second gives way. An angle swings the leg clicked second, taking
everything downstream with it so the rest of the run keeps its shape and its
lengths — press **⇄** to hand the movement to the other leg instead, which
winds the run round the corner without disturbing the angle.

**Holding.** A dimension keeps its value when the geometry moves under it: drag
a post, type a length, move a whole run, or swing a corner, and anything
dimensioned off what moved settles with it.

**Contradictions are refused**, because two values for one measurement means
the drawing lies about itself. You can't dimension a pair whose distance is
already pinned — the two ends of one segment (its Length *is* that dimension),
or a reference that closes a loop back on itself. Nor can an angle and a
distance both drive the same post: an angle swings a stretch of the run while a
distance pins a post in place. Each refusal says which way out it has; an angle
is usually still available from the other fence, so the free side swings.

Angles are refused on closed loops, where rotating part of the run would tear
it open.

**Stored** on the post the dimension belongs to. Other posts are referenced by a
stable id rather than a position in the run, so a dimension survives points
being deleted, runs splitting and runs being reversed; if its anchor is deleted
outright it falls back to that anchor's last position instead of breaking.
Placements are kept in metres, so a dimension holds its distance from the
drawing as you zoom. Building corners and walls are stored as coordinates —
they are assumed not to move.

---

## The materials model

Post counting is the part worth explaining, because it is *not* length ÷
spacing:

- A post stands at **every vertex you drew** — a corner forces its own post.
- Plus intermediate posts so **no panel exceeds the post spacing**: each
  segment contributes `ceil(length / spacing)` panels, and that many posts (its
  far end plus the intermediates).
- Plus a post **each side of every gate**; a gate contributes no fence panels or
  fence length, but its rendered leaf rails and palings are counted unless excluded.
- An open run adds **one more** for its starting post.
- Where two runs meet at a point, that **junction post is counted once**.
- **End posts** default to `Auto` (count both ends, except one already posted by
  an earlier fence). Override with Both / One end / None when the ends are
  already posted — fixed to a building, say. One end adds a second spatial
  choice such as Left/Right or Top/Bottom, matching the endpoint labels in plan.
- **Post shape** can be square or round for a complete fence run. Selecting an
  individual post allows that one point to inherit the fence setting or override
  it as square or round. The materials summary counts each shape separately.

So a straight 10 m run at 1.5 m spacing is 7 panels and 8 posts; bend it into
two 5 m legs and it becomes 8 panels and 9 posts. Fence rails are `panels × rails
per panel`; a rail gate uses its fitted rails and a paling gate uses two frame
rails. Palings are `ceil(length / (paling width + gap))` for the fence or gate
leaf. Handrail is a length, not a count.

For post-and-rail, the rail count and gap derive from each other inside the
band left between the bottom and top clearances — edit either and the other
follows, but a value you typed always wins.

---

## The 3D view

Deliberately **not** WebGL or three.js. A fence is boxes — posts, rails,
palings, gates, handrail, buildings and roofs — so the 3D view is a flat-shaded
painter's-algorithm renderer on the same 2D canvas, keeping the app one
dependency-free file that still works offline. Faces carry their outward normal
(so shading and back-face culling don't depend on vertex winding), get clipped
against the near plane, then sort far-to-near.

- **Drag** to orbit, **right-drag / two fingers** to pan, **scroll / pinch** to
  zoom, **⤢** to fit.
- **Orientation cube**, bottom-left: it turns with the view and labels whichever
  faces point at you. Tap a face to snap to that view — Top keeps your current
  heading, the sides drop to a level elevation. Dragging from it still orbits.
- **Automatic orbit** can be started/paused, reversed, and set from 5–60°/s;
  the mobile layout collapses the speed slider into a compact control.
- **Full screen** expands the render without changing the drawing.
- **Fence labels** can be selected directly in 3D to inspect a run. Toggle the
  label overlay when the scene is busy; hidden fences are omitted from the 3D
  scene but remain dotted and selectable in plan.
- Rails are built per bay on the chosen left/right face, so interior bays meet
  at post centres and only the first/last outer bays extend to the outside face
  of their end posts. Gate leaves use the same fence face.

Known simplifications, all marked `ponytail:` in the source: handrail corners
butt rather than mitre, and the handrail adds its thickness above the fence
height.

Constraints are settled by applying them in turn — angles, then distances, one
pass each — rather than by a constraint solver. That is enough for the handful
of dimensions a fence drawing carries, but a *chain* of post-to-post dimensions
settles over successive edits rather than all at once, a cycle wobbles instead
of converging, and a post locked on both sides can drift slightly on the first
neighbour. A real solver is the standing upgrade if any of that starts to
matter. A new dimension is also placed to whichever side you drop it on, with no
awareness of what is underneath.

---

## Running it

**Just the app** — open `fence-fable.html`. That's it. Backups hide themselves
when there's no server behind the page.

**With backups:**

```sh
FENCE_DATA_DIR=/path/to/fence-data node serve-fence.mjs  # http://127.0.0.1:4647
```

`FENCE_DATA_DIR` keeps the private `backups/` and `shares/` directories outside
the checkout. If it is omitted, the server uses the repository directory. The
server is loopback-only; to reach it from other devices, put it behind Tailscale
rather than opening a port:

```sh
tailscale serve --https=4646 localhost:4647
```

On the current host, the user service
`~/.config/systemd/user/fence-sketcher.service` runs the server from
`/home/gbot/repo/fence-sketcher` on port `4647`. Its `FENCE_DATA_DIR` points to
the separate private data directory `/home/gbot/repo/fence-data`; do not move
or commit that directory when changing branches.

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/` | the app |
| `GET` | `/backups` | `[{name, mtime}]`, newest first |
| `GET` | `/backups/<name>` | one backup |
| `POST` | `/backups/<name>` | create a backup; fails if the name exists |
| `PUT` | `/backups/<name>` | save (JSON body, ≤ 2 MB, same name overwrites) |
| `PATCH` | `/backups/<name>` | rename, body `{"name":"new-name"}` |
| `DELETE` | `/backups/<name>` | delete |
| `GET` | `/share-config` | whether public sharing is configured |
| `GET` | `/shares` | active shared drawings, newest first |
| `GET` | `/shares/<name>` | active share status for one saved drawing |
| `POST` | `/shares/<name>` | publish its current in-browser snapshot |
| `PUT` | `/shares/<name>` | update its active snapshot |
| `DELETE` | `/shares/<name>` | revoke its active link |

Names are whitelisted to `[a-zA-Z0-9._-]{1,64}`, so path traversal isn't
possible.

### Full external backup and restore

Open the top-right **Files** menu. It manages the normal CRUD lifecycle
(`Save changes`, `Save as new`, `Open selected`, `Rename`, and `Delete`) and also
lists active shared drawings. The **External backup** section is separate from
those individual operations. The file server must be reachable because the
library is read from and restored to the server's named drawings:

- **Download all files** fetches every named server drawing plus the current
  canvas state and downloads one portable JSON file.
- **Restore all files** validates the full library before opening a confirmation
  dialog. Choose **Keep existing drawings** to skip name conflicts or **Replace
  existing drawings** to overwrite them. The current canvas is restored too and
  can be undone.

The portable format is `fence-sketcher-library`, version `1`. Files are limited
to 25 MB and 1,000 drawings; each restored drawing must fit the server's roughly
2 MB JSON limit and names must match `[a-zA-Z0-9._-]{1,64}`. Older single-drawing
`fence-sketcher` JSON files remain readable. Public share URLs and bearer tokens
are intentionally excluded from portable backups; recreate or manage those
links after restoring the drawings.

### Public view-only sharing

Sharing deliberately uses two security boundaries:

1. `serve-fence.mjs` remains private behind Tailscale. It is the only service
   allowed to create, update or revoke links.
2. `share-worker.mjs` is public. It serves only `/share/<token>` and the
   corresponding GET-only snapshot API. It has no backup routes and cannot list
   shares.

The public link is a 256-bit random bearer token. Snapshots are separate from
saved drawings, use `no-store`/`noindex` response headers, and expire after 7
or 30 days unless the owner explicitly chooses no expiry. The Files menu lists
all active shared drawings with Open, Copy and Manage actions; Manage can update
or explicitly remove a link. Deleting a saved drawing also revokes its active
share before removing the file.

The shared page is genuinely read-only: it freezes the loaded drawing state and
allows plan/3D navigation, fence-label inspection, units and materials viewing,
but no drawing edits, deletion, saving, or sharing actions.

The Worker is optional; the editor and backups continue to work without it.
Worker deployment is GitHub Actions only—do not use a personal `wrangler login`
or deploy directly from a development machine.

The promotion path matches the Modern Energy Dashboard:

1. Pull requests to `staging` or `main` run tests, syntax checks, the public
   viewer build and a Wrangler dry run. PR jobs receive no deployment secrets.
2. A merge to `staging` deploys `fence-sketcher-share-staging` with its own KV
   namespace through the GitHub `staging` environment.
3. Complete UAT using the staging share URL. This is the normal active path for
   the project.
4. Promote `staging` to `main` through a pull request only when production is
   needed.
5. The production workflow then passes its verification gate, pauses for the
   protected `production` environment approval, and deploys
   `fence-sketcher-share` with a separate production KV namespace.

Create GitHub environments named exactly `staging` and `production`. Restrict
staging deployments to the `staging` branch. Restrict production deployments
to `main` and require a reviewer.

Add these separately to both environments:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Account-scoped Workers Scripts and Workers KV deployment token |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account selected by Wrangler in non-interactive CI |
| Secret | `FENCE_SHARE_ADMIN_TOKEN` | Strong, environment-specific snapshot management secret |
| Variable | `CLOUDFLARE_KV_NAMESPACE_ID` | 32-character KV namespace id for that environment |
| Variable | `FENCE_SHARE_PUBLIC_URL` | Deployed Worker origin, without a trailing slash |

Create separate staging and production KV namespaces once in Cloudflare. The
namespace ids are GitHub environment variables rather than committed values;
the workflow generates an ignored `wrangler.share.ci.jsonc` on the runner.
The first deployment creates the Worker and writes `SHARE_ADMIN_TOKEN` from the
matching protected GitHub secret. Staging and production admin tokens must be
different.

Configure the same secret and the deployed Worker origin on the private server,
preferably in a systemd environment override rather than the repository:

```ini
[Service]
Environment=FENCE_SHARE_API_URL=https://fence-sketcher-share.<account>.workers.dev
Environment=FENCE_SHARE_ADMIN_TOKEN=<the same strong secret>
```

Use the token belonging to the Worker origin you configured (the current live
setup uses the `staging` Worker). Use the production environment's value only
when the private server is deliberately pointed at the production Worker.
Restart the private server after setting those values. The Files menu then
shows **Share view** whenever the current drawing has been saved. Secrets must
never be placed in `fence-fable.html`, committed, or sent in a browser request.

---

## Tests

The pure logic — unit parsing and formatting, the materials model, polyline
edits, snapping, grouping, post/end rules, backup validation, share security and
the 3D geometry — self-checks on every page load. It's silent unless something
breaks; open the console and you'll see
`fence-fable: self-checks passed`.

To run the complete Node test suite:

```sh
npm test                 # Node tests only
npm run verify           # syntax checks, tests and public-view build
npm run share:dry-run    # Worker bundle validation without publishing
```

`npm run verify` performs syntax checks, the Node test suite and the generated
public-view build. `npm run share:dry-run` additionally validates the Worker
deployment bundle without publishing it.

To run only the original inline checks headlessly:

```sh
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' fence-fable.html > /tmp/ff.js
node /tmp/ff.js        # prints the self-check line, then stops at the first DOM call
```

The `ReferenceError: document is not defined` after that line is expected —
Node has no DOM, and everything testable runs before the first DOM access.

---

## Layout

```
fence-fable.html    the whole app: markup, styles, logic, 3D renderer, tests
serve-fence.mjs     private backup server and public-share management proxy
share-worker.mjs    public GET-only snapshot viewer and management API
wrangler.share.staging.jsonc
wrangler.share.production.jsonc
                    isolated staging and production Worker templates
.github/workflows/  PR validation and protected staging/production deployments
scripts/            repeatable public-view build and CI config generation
test/               application, materials, geometry, backup and share tests
dist-share/         generated public-view assets (ignored)
backups/            saved drawings when FENCE_DATA_DIR points at the repo (ignored)
shares/             private active-link metadata when FENCE_DATA_DIR points at the repo (ignored)
package.json        Node test, build and Worker scripts
package-lock.json   locked Worker build dependency versions
```

Inside `fence-fable.html`, in order: tweakable defaults → units → state → pure
helpers → self-checks → canvas/DOM → snapping and picking → mutations (each
snapshots for undo) → 2D rendering → 3D rendering → side panels → pointer input
→ toolbar wiring → save/load.

Want to change how it behaves? Nearly everything lives in the constants block
at the top of the script: default sizes per unit, hit radii, zoom limits, the
3D timber cross-sections and the orientation cube's faces.
