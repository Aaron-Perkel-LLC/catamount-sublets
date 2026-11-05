# Logo and brand masters

The vector masters and the build script for the "roof cat" mark, redrawn from a friend's hand-drawn concepts. The site's own copies already live in `src/app/` (icon, favicon, apple icon), `public/` (default share images) and `src/components/Mark.tsx`. The PNG exports, the original concepts and the contact sheet are kept outside the repo; rebuild the PNGs with the command at the bottom.

## The mark: "roof cat"

The mark comes from concept 1: a cat at home on top of the house, in the site's two colours. The concept's draft cat looks traced from the Catamount statue, a crouched, pouncing pose that belongs to the university. So the cat is redrawn from scratch in a different pose. It lies over the ridge with a front paw hanging over the eave, and its long tail with a curled tip hangs down the other side. It's built from flat geometric shapes, like the site's previous mark. The cat rests on an intact house with an even gap along the roof; nothing is cut out of the house.

(Concept 2's walking cat was explored and dropped.)

| Token | Hex | Used for |
|---|---|---|
| lake | `#1D4F73` | house, wordmark, dark backgrounds |
| maple | `#BC4C25` | the cat, "Sublets" in the stacked lockup |
| cream | `#F7F3EC` | backgrounds; house on lake |
| ink | `#1C2328` | one-colour print |

The wordmark is Bricolage Grotesque 700 ("Sublets" is 400 in the stacked lockup), converted to outlines so no font is needed.

## Files

| Path | What |
|---|---|
| `svg/` | Masters: `mark-roofcat`, `wordmark`, `lockup-horizontal`, `lockup-stacked`, each in default, `-reversed` (on lake or dark backgrounds), `-mono-lake`, `-mono-ink` and `-mono-white`. `mark-roofcat-tile` is the app icon. |
| `mark-small.svg` | The bolder drawing for 16–24 px. |
| `social/` | Link-preview and story defaults, and `instagram-avatar-1080` (survives the circle crop). |
| `source/` | `build.mjs` + `marks.mjs` (all geometry) and `glyphs/` (outlined text), to regenerate everything. |

## Usage

- **Gap:** the space between the cat and the roof is empty, not a cream fill, so the mark works on any background.
- **Clear space:** keep at least the height of the cat's head clear on every side.
- **Minimum size:** 24 px tall on screen, 10 mm in print. Below that, use the tile or `mark-small.svg`.
- **Don't:** add an eye or other details, put an outline on the cat, recolour it green or gold, set the name in all caps or condensed type, or add athletics copy.

## Note

The mark reverses PLAN.md's earlier "no cat silhouette" (recorded in §0.5 and the decisions table). Keep the footer line saying the site is not affiliated with the university. The cat is an original drawing, but a catamount mark near a university with a catamount mascot could still draw a trademark complaint. That's worth checking before printing merch.

## Regenerate

```bash
node brand/source/build.mjs <out-dir>
```
It writes the full pack (PNGs at 512/1024/2048, favicons, social PNGs, the `web/` drop-ins and `preview.png`) into `<out-dir>`, using this repo's `sharp`; point it outside the repo. Copy any changed drop-ins into `src/app/` and `public/` by hand.
Text outlines came from `source/text2path.py` (fonttools + uharfbuzz) and the site's Bricolage TTFs.
