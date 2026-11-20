// Mob models and textures, generated from code so they are easy to tweak and always match.
// Units are Minecraft model pixels (16 = one block). The front of a mob faces -Z.
import { Canvas, hex, rng, shade } from "./lib/paint.mjs";

const DEFAULT_TEX = [64, 64];

// Where each face of a box lands on the texture (standard Bedrock "box UV").
export function faceRects([u, v], [w, h, d]) {
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    side1: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    side2: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + d + w + d, y: v + d, w, h },
  };
}

// Give every cube its own area of the texture (shelf packing, tallest cubes first).
function packUvs(bones, [texWidth, texHeight]) {
  const items = [];
  for (const bone of bones) {
    for (const cube of bone.cubes) {
      const [w, h, d] = cube.size;
      items.push({ bone, cube, rw: 2 * (w + d), rh: h + d });
    }
  }
  items.sort((a, b) => b.rh - a.rh || b.rw - a.rw);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const { bone, cube, rw, rh } of items) {
    if (x + rw > texWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    if (rw > texWidth || y + rh > texHeight) throw new Error(`texture is too small for cube in bone "${bone.name}"`);
    cube.uv = [x, y];
    x += rw;
    rowHeight = Math.max(rowHeight, rh);
  }
}

function paintModel(bones, seed, [texWidth, texHeight]) {
  const canvas = new Canvas(texWidth, texHeight);
  const rand = rng(seed);
  for (const bone of bones) {
    for (const cube of bone.cubes) {
      const faces = faceRects(cube.uv, cube.size);
      const base = hex(cube.colour);
      const tone = { top: 1.12, bottom: 0.7, side1: 0.95, front: 1, side2: 0.95, back: 0.85 };
      for (const [name, r] of Object.entries(faces)) {
        canvas.noise(r.x, r.y, r.w, r.h, shade(base, tone[name]), cube.noise ?? 0.1, rand);
      }
      cube.detail?.(canvas, faces, rand);
    }
  }
  return canvas;
}

function toGeometry(id, bones, bounds, [texWidth, texHeight]) {
  return {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: {
          identifier: `geometry.nightfall.${id}`,
          texture_width: texWidth,
          texture_height: texHeight,
          visible_bounds_width: bounds[0],
          visible_bounds_height: bounds[1],
          visible_bounds_offset: [0, bounds[1] / 2, 0],
        },
        bones: bones.map((bone) => ({
          name: bone.name,
          ...(bone.parent ? { parent: bone.parent } : {}),
          pivot: bone.pivot,
          cubes: bone.cubes.map((cube) => ({ origin: cube.origin, size: cube.size, uv: cube.uv })),
        })),
      },
    ],
  };
}

function eyes(colour, row = 2, inset = 1, size = 2, glow) {
  return (canvas, faces) => {
    const f = faces.front;
    const c = hex(colour);
    for (const x of [f.x + inset, f.x + f.w - inset - size]) {
      canvas.rect(x, f.y + row, size, 1, c);
      if (glow) canvas.set(x + (x < f.x + f.w / 2 ? size - 1 : 0), f.y + row, hex(glow));
    }
  };
}

// Paint a small picture onto a face: one character per pixel, "." leaves the pixel as it is.
function art(canvas, rect, rows, palette, dx = 0, dy = 0) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === "." || !palette[ch]) return;
      canvas.set(rect.x + dx + i, rect.y + dy + j, hex(palette[ch]));
    });
  });
}

const SIDES = ["side1", "front", "side2", "back"];

// ---------------------------------------------------------------- Gloomhound

function gloomhound() {
  const fur = "#463d55";
  const dark = "#2a2433";
  const mid = "#5a4f6b";
  const bone = "#d2c7cc";
  const claw = "#e6dac6";
  const coat = (canvas, faces, rand) => {
    for (const r of Object.values(faces)) {
      canvas.speckle(r.x, r.y, r.w, r.h, hex(dark), 0.26, rand);
      canvas.speckle(r.x, r.y, r.w, r.h, hex(mid), 0.14, rand);
    }
  };
  const leg = (name, x, z) => ({
    name,
    parent: "body",
    pivot: [x + 1.5, 7, z + 1.5],
    cubes: [
      {
        origin: [x, 0, z],
        size: [3, 7, 3],
        colour: fur,
        detail: (canvas, faces, rand) => {
          coat(canvas, faces, rand);
          for (const side of SIDES) {
            const r = faces[side];
            canvas.rect(r.x, r.y + r.h - 2, r.w, 1, hex(dark)); // darker paw
          }
        },
      },
      // pale claws reaching out in front of the paw
      { origin: [x, 0, z - 1], size: [3, 1, 1], colour: claw, noise: 0.05 },
    ],
  });
  // pale spines down the back: a short base with a taller tip behind it, so each one sweeps backwards
  const spike = (z, top, h) => [
    { origin: [-1, top, z], size: [2, 3, 2], colour: bone, noise: 0.06 },
    { origin: [-0.5, top, z + 2], size: [1, h, 1], colour: bone, noise: 0.06 },
  ];
  const bones = [
    {
      name: "body",
      pivot: [0, 11, 0],
      cubes: [
        { origin: [-5, 7, -9], size: [10, 8, 8], colour: fur, detail: coat }, // deep chest
        { origin: [-4, 7, -1], size: [8, 7, 10], colour: fur, detail: coat }, // lean hindquarters
        ...spike(-8, 15, 5),
        ...spike(-4, 15, 7),
        ...spike(1, 14, 6),
        ...spike(5, 14, 5),
      ],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 12, -9],
      cubes: [
        {
          origin: [-4, 9, -16],
          size: [8, 7, 7],
          colour: fur,
          detail: (canvas, faces, rand) => {
            coat(canvas, faces, rand);
            const f = faces.front;
            art(
              canvas,
              f,
              ["dd....dd", "yY....Yy", "yy....yy", "........", "........", "........", "........"],
              { d: dark, y: "#ffc83d", Y: "#fff6b8", m: mid, r: "#5a1a26" },
            );
            // a glint of eye on the sides of the head
            for (const j of [1, 2]) {
              canvas.set(faces.side1.x + faces.side1.w - 1, faces.side1.y + j, hex("#ffc83d"));
              canvas.set(faces.side2.x, faces.side2.y + j, hex("#ffc83d"));
            }
          },
        },
        {
          // upper jaw and nose
          origin: [-2, 10, -22],
          size: [4, 4, 6],
          colour: dark,
          detail: (canvas, faces) => {
            const t = { t: "#f4efe2", n: "#120e17", g: "#3b3345" };
            art(canvas, faces.front, ["nggn", "gggg", "gggg", "t..t"], t);
            for (const s of ["side1", "side2"]) art(canvas, faces[s], ["gggggg", "gggggg", "gggggg", "t.t.t."], t);
          },
        },
        {
          // lower jaw
          origin: [-2, 7, -21],
          size: [4, 2, 5],
          colour: dark,
          detail: (canvas, faces) => {
            const t = { t: "#f4efe2", r: "#6a1f2c" };
            art(canvas, faces.front, ["t.tt", "...."], t);
            for (const s of ["side1", "side2"]) art(canvas, faces[s], ["t.t.t", "....."], t);
            canvas.rect(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hex("#6a1f2c")); // inside the mouth
          },
        },
        { origin: [-4, 16, -13], size: [2, 3, 2], colour: dark },
        { origin: [2, 16, -13], size: [2, 3, 2], colour: dark },
      ],
    },
    leg("leg0", -4, 5),
    leg("leg1", 1, 5),
    leg("leg2", -5, -8),
    leg("leg3", 2, -8),
    {
      name: "tail",
      parent: "body",
      pivot: [0, 12, 9],
      cubes: [
        { origin: [-1, 10, 9], size: [2, 3, 5], colour: fur, detail: coat },
        { origin: [-1, 12, 13], size: [2, 2, 5], colour: fur, detail: coat },
        { origin: [-1, 13, 17], size: [2, 5, 2], colour: fur, detail: coat },
      ],
    },
  ];
  return { id: "gloomhound", bones, seed: 11, bounds: [4, 2.5], tex: [128, 64] };
}

// ---------------------------------------------------------------- Thornskulk

function thornskulk() {
  const bark = "#5b4130";
  const barkDark = "#3a281c";
  const barkLight = "#7b5a3e";
  const faceBark = "#6c4d36";
  const armBark = "#684a35";
  const legBark = "#33241a";
  const moss = "#5d8f2a";
  const mossDark = "#3d6a1b";
  const thorn = "#eadfbd";
  const barkDetail = (mossTop, mossAmount = 0.55) => (canvas, faces, rand) => {
    for (const side of SIDES) {
      const r = faces[side];
      // vertical bark grooves and lighter ridges
      for (let i = 0; i < r.w; i++) {
        if (rand() < 0.3) canvas.rect(r.x + i, r.y, 1, r.h, shade(hex(barkDark), 0.9 + rand() * 0.2));
        else if (rand() < 0.16) canvas.rect(r.x + i, r.y, 1, r.h, shade(hex(barkLight), 0.9 + rand() * 0.2));
      }
      // moss creeping down from the top, with a few long drips
      canvas.speckle(r.x, r.y, r.w, Math.min(mossTop, r.h), hex(moss), mossAmount, rand);
      for (let i = 0; i < r.w; i++) if (rand() < 0.18) canvas.rect(r.x + i, r.y + mossTop, 1, 1 + Math.floor(rand() * 2), hex(mossDark));
    }
    canvas.speckle(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hex(moss), 0.75, rand);
  };
  const thornCube = (x, y, z, h = 4, w = 2, d = 2) => ({ origin: [x, y, z], size: [w, h, d], colour: thorn, noise: 0.05 });
  const arm = (name, s) => {
    // s is +1 for the left arm, -1 for the right; cubes are written for the left and mirrored
    const x = (lo, w) => (s > 0 ? lo : -lo - w);
    return {
      name,
      parent: "body",
      pivot: [s * 9.5, 22, 0],
      cubes: [
        { origin: [x(7, 5), 13, -3], size: [5, 9, 6], colour: armBark, detail: barkDetail(5, 0.7) }, // upper arm
        {
          origin: [x(7, 5), 4, -6],
          size: [5, 9, 8],
          colour: bark,
          detail: (canvas, faces, rand) => {
            barkDetail(2, 0.35)(canvas, faces, rand);
            // heavy knuckles at the bottom of the fist
            for (const side of SIDES) canvas.noise(faces[side].x, faces[side].y + faces[side].h - 2, faces[side].w, 2, hex("#2a1c13"), 0.12, rand);
          },
        }, // forearm and fist, pushed forward
        thornCube(x(8, 2), 22, -1, 4), // shoulder thorn
        thornCube(x(8, 2), 11, 3, 2, 2, 3), // elbow spike
      ],
    };
  };
  const leg = (name, s) => {
    const x = (lo, w) => (s > 0 ? lo : -lo - w);
    return {
      name,
      pivot: [s * 2.5, 12, 0],
      cubes: [
        { origin: [x(1, 3), 4, -2], size: [3, 8, 4], colour: legBark, detail: barkDetail(2, 0.3) },
        { origin: [x(1, 4), 0, -5], size: [4, 4, 7], colour: "#291c14", detail: barkDetail(1, 0.25) },
      ],
    };
  };
  const bones = [
    {
      name: "body",
      pivot: [0, 12, 0],
      cubes: [
        { origin: [-4, 12, -3], size: [8, 3, 6], colour: barkDark, detail: barkDetail(1, 0.2) }, // hips
        { origin: [-5, 15, -3], size: [10, 8, 7], colour: bark, detail: barkDetail(3) }, // chest
        { origin: [-7, 22, -4], size: [14, 3, 10], colour: moss, noise: 0.16 }, // mossy shoulders
        { origin: [-5, 19, 1], size: [10, 6, 7], colour: bark, detail: barkDetail(4, 0.7) }, // hump
        thornCube(-4, 25, 2, 3),
        thornCube(0, 25, 4, 4),
        thornCube(3, 25, 6, 3),
      ],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 21, -4],
      cubes: [
        {
          origin: [-5, 17, -11],
          size: [10, 8, 8],
          colour: faceBark,
          detail: (canvas, faces, rand) => {
            barkDetail(2, 0.5)(canvas, faces, rand);
            art(
              canvas,
              faces.front,
              ["..........", "..........", "kkkkkkkkkk", "kGGGkkGGGk", "kWGGkkGGWk", ".kkkkkkkk.", "..kTkkTk..", ".........."],
              { k: "#1d130c", G: "#a6ff3d", W: "#efffc8", T: thorn },
            );
          },
        },
        { origin: [-5, 23, -12], size: [10, 2, 1], colour: barkDark, detail: barkDetail(1, 0.3) }, // heavy brow
        thornCube(-5, 25, -8, 3),
        thornCube(3, 25, -7, 3),
      ],
    },
    arm("leftarm", 1),
    arm("rightarm", -1),
    leg("leftleg", 1),
    leg("rightleg", -1),
  ];
  return { id: "thornskulk", bones, seed: 23, bounds: [3, 3], tex: [128, 64] };
}

// ---------------------------------------------------------------- Horde zombies

const ZOMBIE_LOOKS = {
  horde_stalker: { skin: "#7ea04d", shirt: "#d4cdbd", pants: "#4f3d66", eye: "#ffb020", glow: "#fff0b0", hair: "#2b2030", slash: "#a32222", seed: 31 },
  horde_shambler: { skin: "#6a9a4a", shirt: "#5b4a6e", pants: "#3d3550", eye: "#d9c53a", seed: 41 },
  horde_skitter: { skin: "#a3b592", shirt: "#4c4c4c", pants: "#2e2e2e", eye: "#ff6a3d", seed: 51 },
  horde_grasper: { skin: "#4f7a55", shirt: "#2f4f4f", pants: "#263838", eye: "#f2f2f2", hands: "#c8d6b0", seed: 61 },
  horde_brute: { skin: "#5f7f3f", shirt: "#6b2f2a", pants: "#3a2a22", eye: "#ffd23d", seed: 71 },
};

function zombie(id) {
  const look = ZOMBIE_LOOKS[id];
  const skin = hex(look.skin);
  const rips = (canvas, faces, rand) => {
    for (const side of SIDES) {
      const r = faces[side];
      // a ragged hem with skin showing through
      for (let i = 0; i < r.w; i++) {
        const drop = Math.floor(rand() * 3);
        if (drop > 0) canvas.rect(r.x + i, r.y + r.h - drop, 1, drop, shade(skin, 0.9));
      }
      canvas.speckle(r.x, r.y, r.w, r.h, shade(hex(look.shirt), 0.7), 0.14, rand);
    }
  };
  const arm = (name, x) => ({
    name,
    parent: "body",
    pivot: [x + 2, 22, 0],
    cubes: [
      {
        origin: [x, 12, -2],
        size: [4, 12, 4],
        colour: look.skin,
        detail: (canvas, faces, rand) => {
          for (const side of SIDES) {
            const r = faces[side];
            canvas.noise(r.x, r.y, r.w, 4, hex(look.shirt), 0.1, rand); // short torn sleeve
            for (let i = 0; i < r.w; i++) if (rand() < 0.5) canvas.set(r.x + i, r.y + 4, shade(hex(look.shirt), 0.8));
            canvas.speckle(r.x, r.y + 4, r.w, r.h - 4, shade(skin, 0.7), 0.12, rand);
            if (look.hands) canvas.noise(r.x, r.y + r.h - 5, r.w, 5, hex(look.hands), 0.08, rand);
          }
          canvas.noise(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hex(look.shirt), 0.1, rand);
        },
      },
    ],
  });
  const leg = (name, x) => ({
    name,
    pivot: [x + 2, 12, 0],
    cubes: [
      {
        origin: [x, 0, -2],
        size: [4, 12, 4],
        colour: look.pants,
        detail: (canvas, faces, rand) => {
          for (const side of SIDES) {
            const r = faces[side];
            canvas.noise(r.x, r.y + r.h - 3, r.w, 3, shade(skin, 0.85), 0.1, rand); // bare feet
            for (let i = 0; i < r.w; i++) if (rand() < 0.4) canvas.set(r.x + i, r.y + r.h - 4, shade(skin, 0.85));
            canvas.speckle(r.x, r.y, r.w, r.h - 4, shade(hex(look.pants), 0.7), 0.14, rand);
          }
          // a belt line at the top of the trousers, with a buckle
          for (const side of SIDES) canvas.rect(faces[side].x, faces[side].y, faces[side].w, 1, hex("#3a2a1e"));
          // a torn knee on the front
          canvas.rect(faces.front.x + 1, faces.front.y + 6, 2, 2, shade(skin, 0.8));
        },
      },
    ],
  });
  const bones = [
    {
      name: "body",
      pivot: [0, 24, 0],
      cubes: [
        {
          origin: [-4, 12, -2],
          size: [8, 12, 4],
          colour: look.shirt,
          detail: (canvas, faces, rand) => {
            rips(canvas, faces, rand);
            const f = faces.front;
            // ragged V-neck showing skin
            for (let j = 0; j < 3; j++) canvas.rect(f.x + 1 + j, f.y + j, 6 - 2 * j, 1, shade(skin, 0.9));
            if (look.slash) {
              // a long red slash across the chest, bleeding down
              for (let i = 0; i < 7; i++) {
                canvas.rect(f.x + 1 + i, f.y + 3 + Math.floor(i * 0.7), 1, 2, hex(look.slash));
              }
              canvas.rect(f.x + 5, f.y + 7, 1, 3, shade(hex(look.slash), 0.8));
              canvas.speckle(f.x, f.y + 2, f.w, 7, shade(hex(look.slash), 0.7), 0.1, rand);
              // dirty grey stains
              canvas.speckle(f.x, f.y + 6, f.w, 4, shade(hex(look.shirt), 0.65), 0.25, rand);
            }
          },
        },
      ],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 24, 0],
      cubes: [
        {
          origin: [-4, 24, -4],
          size: [8, 8, 8],
          colour: look.skin,
          detail: (canvas, faces, rand) => {
            const f = faces.front;
            for (const r of Object.values(faces)) canvas.speckle(r.x, r.y, r.w, r.h, shade(skin, 0.75), 0.1, rand);
            if (look.hair) {
              const hair = hex(look.hair);
              const strand = () => shade(hair, 0.85 + rand() * 0.4);
              canvas.noise(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hair, 0.18, rand);
              // messy hair falling over the sides and the back of the head
              for (const side of ["side1", "side2", "back"]) {
                const r = faces[side];
                canvas.noise(r.x, r.y, r.w, 3, hair, 0.18, rand);
                for (let i = 0; i < r.w; i++) canvas.rect(r.x + i, r.y + 3, 1, Math.floor(rand() * 4), strand());
              }
              // a ragged fringe over the forehead
              canvas.noise(f.x, f.y, f.w, 1, hair, 0.18, rand);
              const fringe = [3, 2, 4, 2, 3, 4, 2, 3];
              for (let i = 0; i < f.w; i++) canvas.rect(f.x + i, f.y + 1, 1, fringe[i] - 1, strand());
            }
            // heavy brows and glowing eyes
            canvas.rect(f.x + 1, f.y + 2, 3, 1, hex("#1c2414"));
            canvas.rect(f.x + 4, f.y + 2, 3, 1, hex("#1c2414"));
            for (const x of [1, 5]) {
              canvas.rect(f.x + x, f.y + 3, 2, 2, hex(look.eye));
              canvas.rect(f.x + x - 1 + (x === 1 ? 0 : 3), f.y + 3, 1, 2, hex("#1c2414"));
            }
            if (look.glow) {
              canvas.set(f.x + 2, f.y + 3, hex(look.glow));
              canvas.set(f.x + 5, f.y + 3, hex(look.glow));
            }
            // open mouth with a few teeth
            canvas.rect(f.x + 2, f.y + 5, 4, 2, hex("#241a1a"));
            canvas.set(f.x + 2, f.y + 5, hex("#e8e2d0"));
            canvas.set(f.x + 4, f.y + 5, hex("#e8e2d0"));
            canvas.set(f.x + 5, f.y + 5, hex("#e8e2d0"));
            canvas.set(f.x + 3, f.y + 6, hex("#e8e2d0"));
          },
        },
      ],
    },
    arm("rightarm", -8),
    arm("leftarm", 4),
    leg("rightleg", -4),
    leg("leftleg", 0),
  ];
  return { id, bones, seed: look.seed, bounds: [3, 3.5] };
}

// One shared zombie shape, five textures.
export function buildModels() {
  const out = { geometries: {}, textures: {}, definitions: {} };
  const add = (model, geometryId) => {
    const tex = model.tex ?? DEFAULT_TEX;
    packUvs(model.bones, tex);
    out.textures[model.id] = paintModel(model.bones, model.seed, tex);
    out.definitions[model.id] = { geometryId, bones: model.bones, tex };
    if (!out.geometries[geometryId]) out.geometries[geometryId] = toGeometry(geometryId, model.bones, model.bounds, tex);
  };
  add(gloomhound(), "gloomhound");
  add(thornskulk(), "thornskulk");
  for (const id of Object.keys(ZOMBIE_LOOKS)) add(zombie(id), "horde_zombie");
  return out;
}

// Shadow Hood as worn: standard 64x32 armour layout, only the helmet area is used.
export function buildHoodArmourTexture() {
  const canvas = new Canvas(64, 32);
  const rand = rng(91);
  const cloth = hex("#2c2238");
  const faces = faceRects([0, 0], [8, 8, 8]);
  for (const [name, r] of Object.entries(faces)) {
    if (name === "bottom") continue;
    canvas.noise(r.x, r.y, r.w, r.h, shade(cloth, name === "top" ? 1.15 : 1), 0.12, rand);
  }
  // open face so the wearer's eyes show from inside the hood
  canvas.clear(faces.front.x + 1, faces.front.y + 3, 6, 5);
  canvas.rect(faces.front.x, faces.front.y + 2, 8, 1, hex("#3d2f4f"));
  return canvas;
}
