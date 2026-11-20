// 16x16 item icons drawn as character grids. "." is transparent.
import { Canvas, hex, iconFromRows, rng, shade } from "./lib/paint.mjs";

const FANG = [
  "................",
  "..........oo....",
  ".........owwo...",
  "........owwwo...",
  ".......owwwso...",
  "......owwwso....",
  ".....owwwso.....",
  ".....owwso......",
  "....owwso.......",
  "....owso........",
  "...owwo.........",
  "...owo..........",
  "..owo...........",
  "..oo............",
  "................",
  "................",
];

const HIDE = [
  "................",
  "..oo......oo....",
  ".oppo....oppo...",
  ".opppoooopppo...",
  "..oppppppppo....",
  "..opdppppdpo....",
  "..oppppppppo....",
  "..oppplpppppo...",
  "..opppddpppo....",
  "..oppppppppo....",
  ".opppppppppo....",
  ".oppoppppoppo...",
  ".oppo.oo.oppo...",
  "..oo......oo....",
  "................",
  "................",
];

const CLOTH = [
  "................",
  "..ooooooooooo...",
  ".occcccccccco...",
  ".occdcccccdco...",
  ".occccccccccco..",
  ".occcccdcccco...",
  "..occcccccccco..",
  ".occdcccccccco..",
  ".occccccccdco...",
  ".occcccdcccco...",
  "..occcccccccco..",
  ".occo.occo.oco..",
  ".oco..oco...o...",
  "..o....o........",
  "................",
  "................",
];

const CORE = [
  "................",
  ".......s........",
  "...s..ooo..s....",
  "....oogggoo.....",
  "...ogggllggo....",
  "..oggglllgggo...",
  "..ogggllggggo...",
  ".soggggggggdos..",
  "..oggggggggdo...",
  "..ogggggggddo...",
  "...oggggdddo....",
  "....oodddoo.....",
  "...s..ooo..s....",
  ".......s........",
  "................",
  "................",
];

const BARK = [
  "................",
  "................",
  "..oooooooooooo..",
  ".obbbdbbbbbdbbo.",
  ".obbbdbbbbbdbbo.",
  ".obdbbbbdbbbbbo.",
  ".obdbbbbdbbbmbo.",
  ".obbbbdbbbbmmbo.",
  ".obbbbdbbdbbbbo.",
  ".obmbbbbbdbbbbo.",
  ".obmmbdbbbbbdbo.",
  ".obbbbdbbbbbdbo.",
  "..oooooooooooo..",
  "................",
  "................",
  "................",
];

const CHARM = [
  "................",
  "......rrrr......",
  ".....r....r.....",
  ".....r....r.....",
  "......r..r......",
  ".......rr.......",
  ".....s.oo.s.....",
  "....sooggoos....",
  "....oggllggo....",
  "...sogglggdos...",
  "....oggggddo....",
  "....soogdoos....",
  ".....s.oo.s.....",
  "................",
  "................",
  "................",
];

const HOOD = [
  "................",
  "................",
  "....oooooooo....",
  "...ohhhhhhhho...",
  "..ohhhhhhhhhho..",
  "..ohhhhhhhhhho..",
  "..ohhddddddhho..",
  "..ohdkkkkkkdho..",
  "..ohdkekkekdho..",
  "..ohdkkkkkkdho..",
  "..ohdkkkkkkdho..",
  "..ohhd....dhho..",
  "..ooo......ooo..",
  "................",
  "................",
  "................",
];

const GUIDE = [
  "................",
  "...oooooooooo...",
  "..opppppppppwo..",
  "..oppppyypppwo..",
  "..opppyypppywo..",
  "..oppyyppppywo..",
  "..oppyypppppwo..",
  "..opppyyppypwo..",
  "..oppppyyyppwo..",
  "..opppppppppwo..",
  "..opeppppeppwo..",
  "..opppppppppwo..",
  "..oppppppppwwo..",
  "..owwwwwwwwwo...",
  "...ooooooooo....",
  "................",
];

export function buildIcons() {
  return {
    gloom_fang: iconFromRows(FANG, { o: "#4a4038", w: "#f3ecd8", s: "#c9bd9f" }),
    horde_claw: iconFromRows(FANG.map((row) => [...row].reverse().join("")), { o: "#2f352b", w: "#9aa58c", s: "#6f7a63" }),
    shadow_hide: iconFromRows(HIDE, { o: "#1b1424", p: "#4a3764", d: "#33264a", l: "#6a5490" }),
    tattered_cloth: iconFromRows(CLOTH, { o: "#3b3b3b", c: "#a9a59c", d: "#7d7a72" }),
    thorn_core: iconFromRows(CORE, { o: "#24401a", g: "#5fae2e", l: "#b8f06a", d: "#3d7a22", s: "#e2d6b5" }),
    bark_hide: iconFromRows(BARK, { o: "#2e2016", b: "#6b4c36", d: "#4a3324", m: "#5d8f2a" }),
    bramble_charm: iconFromRows(CHARM, { r: "#8a6a3a", o: "#24401a", g: "#5fae2e", l: "#b8f06a", d: "#3d7a22", s: "#e2d6b5" }),
    shadow_hood: iconFromRows(HOOD, { o: "#140f1a", h: "#3a2c4c", d: "#241b30", k: "#0c0810", e: "#ffc83d" }),
    night_guide: iconFromRows(GUIDE, { o: "#1b1424", p: "#4a3764", y: "#f2d661", w: "#e9e2cf", e: "#ffc83d" }),
  };
}

// Pack icon: a night sky, a moon and a pair of eyes.
export function buildPackIcon() {
  const size = 64;
  const canvas = new Canvas(size, size);
  const rand = rng(7);
  for (let y = 0; y < size; y++) {
    canvas.rect(0, y, size, 1, shade(hex("#1a1630"), 1 + (y / size) * 0.5));
  }
  for (let i = 0; i < 26; i++) canvas.set(Math.floor(rand() * size), Math.floor(rand() * 40), hex("#d8d4f0"));
  canvas.rect(42, 8, 12, 12, hex("#e6ecff"));
  canvas.rect(44, 10, 3, 3, hex("#c4cdea"));
  canvas.rect(49, 15, 3, 2, hex("#c4cdea"));
  canvas.rect(0, 46, size, 18, hex("#141a14"));
  for (let x = 0; x < size; x += 2) canvas.rect(x, 44 - Math.floor(rand() * 3), 1, 4, hex("#1f2b1c"));
  canvas.rect(16, 30, 26, 16, hex("#241d2c"));
  canvas.rect(20, 34, 6, 3, hex("#ffc83d"));
  canvas.rect(32, 34, 6, 3, hex("#ffc83d"));
  canvas.rect(24, 34, 2, 3, hex("#fff2a8"));
  canvas.rect(32, 34, 2, 3, hex("#fff2a8"));
  return canvas;
}
