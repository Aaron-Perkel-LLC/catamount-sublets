// Mark geometry. The cat is a list of fills and fat round-capped strokes.
export const C = {
  lake: "#1D4F73", lakeDeep: "#163E5B", maple: "#BC4C25", cream: "#F7F3EC",
  paper: "#FFFFFF", ink: "#1C2328",
};

const s = (d, w) => ({ kind: "stroke", d, w });
const f = (d) => ({ kind: "fill", d });
export const FAR_EAR = "M180 62C179 56 182 53 185 54C187 55 188 57 188 59Z";
const ellipse = (cx, cy, rx, ry) => f(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`);

// ---- Roof cat (256 grid) ---------------------------------------------------
export const roof = {
  // The pentagon M64 228V136L128 72L192 136V228Z grown by 3 with round corners,
  // and the door as a hole (fill-rule evenodd); a strip of wall stays under it.
  house: "M64 231H192A3 3 0 0 0 195 228V136A3 3 0 0 0 194.12 133.88L130.12 69.88A3 3 0 0 0 125.88 69.88L61.88 133.88A3 3 0 0 0 61 136V228A3 3 0 0 0 64 231Z",
  door: "M116 228V196A12 12 0 0 1 140 196V228Z",
  cat: [
    // body: belly rides the roofline with an even gap, back arches over the ridge
    f("M84 105L124.5 64.5Q128 60.5 131.5 64.5L168 101C176 104 184 101 186 92C187 82 182 72 174 64C158 48 138 42 118 42C98 42 80 48 74 66C70 80 74 98 84 105Z"),
    // head in profile, facing right, resting low
    f("M172 80C171 68 177 60 186 58C186 52 189 49 192 49C195 49 197 52 197 58C203 59 208 63 210 69L214 76Q216 80 213 83C211 88 206 90 200 91C192 93 186 96 180 97L172 94Z"),
    f(FAR_EAR),
    s("M78 70C62 86 50 112 47 138C45 164 44 188 34 198C26 206 16 200 20 190", 13), // tail
    s("M178 94C186 102 196 108 202 116C206 122 207 128 207 138", 14), // front leg along the slope, over the eave
    ellipse(209, 145, 8.5, 7),                    // paw
  ],
};
