# Fence sketcher

Sketch a fence line, get the materials list, then walk around it in 3D.

One HTML file. No dependencies, no build step, no framework. Open
`fence-fable.html` in a browser and it works — on a phone, offline, from a USB
stick. The optional 30-line Node server exists only to keep named backups you
can restore from another device.

---

## What it does

**Draw the fence.** Tap to drop posts, tap the first post to close a loop,
double-tap or `Esc` to finish a run. Drag anything to move it. Points snap to
existing posts and building corners, then to fence lines and building edges,
then to 45°/90° rays off the last post, then to alignment with any existing
post (with dashed guides), then to the grid — first match wins.

**Get the quantities.** Live totals for posts, rails, palings, handrail metres,
gates and corners, with the working shown ("13 panels, 1 corner, 1 gate").
`📋 Copy summary` puts a plain-text takeoff on the clipboard.

**See it built.** The 🧊 3D button swaps the plan for a walkable 3D model of
the same drawing — posts, rails, palings, handrail and buildings — rendered
from the exact same numbers the totals use, so the picture can never disagree
with the list.

### Features

- **Two fence styles** — palings (boards) or post-and-rail.
- **Per-fence settings.** Every fence line follows the shared defaults until you
  tick "This fence has its own settings", then it keeps its own spacing, style,
  heights and handrail. Totals aggregate across all of them.
- **Gates.** Mark any segment as a gate: it's excluded from length and panels
  but still gets a post each side.
- **Handrail.** An optional capping rail along the tops of the posts, with its
  own cross-section. Counted in linear metres, and it skips gate openings.
- **Buildings.** Drop a rectangle, drag it, resize from the corners. Fences snap
  to its corners and edges. Excluded from materials.
- **Exact lengths.** Type a segment length and the far end moves along its line;
  lock it so dragging a neighbouring post can't change it.
- **Metric or imperial.** Everything is stored in metres; units only affect
  display and parsing. `12'6"`, `12 ft 6 in`, `6"` and bare numbers all parse.
  Fields you haven't touched jump to the sensible default for the new unit
  (2.4 m ↔ 8 ft); fields you have typed into stay put.
- **Light / dark theme**, remembered.
- **Autosave** to `localStorage`, plus named backups on the server.
- **Undo** (`Ctrl+Z`), 100 deep.

---

## The materials model

Post counting is the part worth explaining, because it is *not* length ÷
spacing:

- A post stands at **every vertex you drew** — a corner forces its own post.
- Plus intermediate posts so **no panel exceeds the post spacing**: each
  segment contributes `ceil(length / spacing)` panels, and that many posts (its
  far end plus the intermediates).
- Plus a post **each side of every gate**; a gate contributes no panels.
- An open run adds **one more** for its starting post.
- Where two runs meet at a point, that **junction post is counted once**.
- **End posts** default to `Auto` (count both ends, except one already posted by
  an earlier fence). Override with Both / One / None when the ends are already
  posted — fixed to a building, say.

So a straight 10 m run at 1.5 m spacing is 7 panels and 8 posts; bend it into
two 5 m legs and it becomes 8 panels and 9 posts. Rails are `panels × rails per
panel`. Palings are `ceil(fence length / (paling width + gap))`. Handrail is a
length, not a count.

For post-and-rail, the rail count and gap derive from each other inside the
band left between the bottom and top clearances — edit either and the other
follows, but a value you typed always wins.

---

## The 3D view

Deliberately **not** WebGL or three.js. A fence is boxes — posts, rails,
palings, handrail, buildings — so the 3D view is a flat-shaded painter's
algorithm renderer on the same 2D canvas: about 250 lines, keeping the app one
dependency-free file that still works offline. Faces carry their outward normal
(so shading and back-face culling don't depend on vertex winding), get clipped
against the near plane, then sort far-to-near.

- **Drag** to orbit, **right-drag / two fingers** to pan, **scroll / pinch** to
  zoom, **⤢** to fit.
- **Orientation cube**, bottom-left: it turns with the view and labels whichever
  faces point at you. Tap a face to snap to that view — Top keeps your current
  heading, the sides drop to a level elevation. Dragging from it still orbits.
- Rails are built per bay so boards butt at the intermediate post centres and
  overhang to the outer face of the end posts.

Known simplifications, all marked `ponytail:` in the source: handrail corners
butt rather than mitre, the handrail adds its thickness above the fence height,
and length locks are enforced one neighbour at a time rather than by a
constraint solver.

---

## Running it

**Just the app** — open `fence-fable.html`. That's it. Backups hide themselves
when there's no server behind the page.

**With backups:**

```sh
node serve-fence.mjs      # http://127.0.0.1:4647
```

It serves the app and stores named drawings as JSON in `backups/` (gitignored —
your drawings stay yours). Loopback only; to reach it from your other devices,
put it behind Tailscale rather than opening a port:

```sh
tailscale serve --https=4646 localhost:4647
```

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/` | the app |
| `GET` | `/backups` | `[{name, mtime}]`, newest first |
| `GET` | `/backups/<name>` | one backup |
| `PUT` | `/backups/<name>` | save (JSON body, ≤ 2 MB, same name overwrites) |
| `PATCH` | `/backups/<name>` | rename, body `{"name":"new-name"}` |
| `DELETE` | `/backups/<name>` | delete |

Names are whitelisted to `[a-zA-Z0-9._-]{1,64}`, so path traversal isn't
possible.

---

## Tests

The pure logic — unit parsing and formatting, the materials model, polyline
edits, snapping, and the 3D geometry — self-checks on every page load. It's
silent unless something breaks; open the console and you'll see
`fence-fable: self-checks passed`.

To run them headlessly:

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
serve-fence.mjs     optional backup server (~70 lines, stdlib only)
backups/            saved drawings (gitignored)
```

Inside `fence-fable.html`, in order: tweakable defaults → units → state → pure
helpers → self-checks → canvas/DOM → snapping and picking → mutations (each
snapshots for undo) → 2D rendering → 3D rendering → side panels → pointer input
→ toolbar wiring → save/load.

Want to change how it behaves? Nearly everything lives in the constants block
at the top of the script: default sizes per unit, hit radii, zoom limits, the
3D timber cross-sections and the orientation cube's faces.
