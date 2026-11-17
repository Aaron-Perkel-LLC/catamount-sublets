# Neighborhoods

`neighborhoods.geojson` holds the named areas a signed-out visitor sees on a
listing ("2BR · Old North End"): Old North End, Downtown, Hill Section,
University District, South End, New North End and Winooski. Anything outside
them reads "Burlington area". A listing's area is looked up from its fuzzed
center, never its true point, so the name says nothing the circle doesn't.

Borders follow roads, drawn 16 Nov 2026 from OpenStreetMap geometry and
reviewed by Aaron in geojson.io (`geojson-io-url.txt` opens the file there).
Inside Burlington the areas tile with no gaps or overlaps (checked on a grid of
16,684 points, and by polygon area). Where no road continues a border it runs
straight: due west to the lake from the west end of Manhattan Dr, due north to
the river from the end of Intervale Rd, and along UVM's campus outline for
Redstone's south edge.

Geometry © OpenStreetMap contributors, available under the Open Database
License (ODbL). The app copies these polygons into `src/config/neighborhoods.ts`;
`src/config/neighborhoods.test.ts` keeps the two in step.
