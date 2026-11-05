"""Shape text with HarfBuzz and emit outlined SVG path data as JSON.
usage: text2path.py font.ttf "Text" tracking_em > out.json
Output units: font units, y flipped (y down), baseline at 0, x from 0."""
import sys, json
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

path, text, track = sys.argv[1], sys.argv[2], float(sys.argv[3])
blob = hb.Blob.from_file_path(path)
face = hb.Face(blob); font = hb.Font(face)
buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
hb.shape(font, buf, {"kern": True, "liga": True})
tt = TTFont(path); gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
upm = tt["head"].unitsPerEm
x = 0; d = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset))
    gs[name].draw(tp)
    d.append(pen.getCommands())
    x += pos.x_advance + track * upm
width = x - track * upm
os2 = tt["OS/2"]
print(json.dumps({"d": " ".join(d), "width": width, "upm": upm,
  "cap": getattr(os2, "sCapHeight", 0), "xh": getattr(os2, "sxHeight", 0),
  "asc": tt["hhea"].ascent, "desc": tt["hhea"].descent}))
