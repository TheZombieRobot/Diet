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

// Give every cube its own area of the texture (simple shelf packing).
function packUvs(bones, [texWidth, texHeight]) {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const bone of bones) {
    for (const cube of bone.cubes) {
      const [w, h, d] = cube.size;
      const rw = 2 * (w + d);
      const rh = h + d;
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

// ---------------------------------------------------------------- Gloomhound

function gloomhound() {
  const fur = "#3a3344";
  const dark = "#2a2531";
  const bone = "#b9aebf";
  const patches = (canvas, faces, rand) => {
    for (const r of Object.values(faces)) canvas.speckle(r.x, r.y, r.w, r.h, hex(dark), 0.22, rand);
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
          patches(canvas, faces, rand);
          // pale claws along the bottom of each side
          for (const r of [faces.side1, faces.front, faces.side2, faces.back]) {
            canvas.rect(r.x, r.y + r.h - 1, r.w, 1, hex("#cfc5b4"));
          }
        },
      },
    ],
  });
  const spike = (z) => ({ origin: [-1, 15, z], size: [2, 3, 2], colour: bone, noise: 0.06 });
  const bones = [
    {
      name: "body",
      pivot: [0, 11, 0],
      cubes: [{ origin: [-5, 7, -8], size: [10, 8, 16], colour: fur, detail: patches }, spike(-6), spike(-2), spike(2), spike(6)],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 13, -8],
      cubes: [
        {
          origin: [-4, 9, -15],
          size: [8, 7, 7],
          colour: fur,
          detail: (canvas, faces, rand) => {
            patches(canvas, faces, rand);
            eyes("#ffc83d", 2, 1, 2, "#fff2a8")(canvas, faces);
            canvas.rect(faces.front.x + 1, faces.front.y + 1, 2, 1, hex(dark));
            canvas.rect(faces.front.x + 5, faces.front.y + 1, 2, 1, hex(dark));
          },
        },
        {
          origin: [-2, 9, -19],
          size: [4, 3, 4],
          colour: dark,
          detail: (canvas, faces) => {
            // teeth along the jaw, and a nose
            for (const r of [faces.side1, faces.side2]) {
              for (let i = 0; i < r.w; i += 2) canvas.set(r.x + i, r.y + r.h - 1, hex("#f1ece0"));
            }
            canvas.rect(faces.front.x + 1, faces.front.y, 2, 1, hex("#17131c"));
            canvas.set(faces.front.x, faces.front.y + 2, hex("#f1ece0"));
            canvas.set(faces.front.x + 3, faces.front.y + 2, hex("#f1ece0"));
          },
        },
        { origin: [-4, 16, -11], size: [2, 3, 1], colour: dark },
        { origin: [2, 16, -11], size: [2, 3, 1], colour: dark },
      ],
    },
    leg("leg0", -5, 5),
    leg("leg1", 2, 5),
    leg("leg2", -5, -7),
    leg("leg3", 2, -7),
    { name: "tail", parent: "body", pivot: [0, 12, 8], cubes: [{ origin: [-1, 10, 8], size: [2, 3, 8], colour: fur, detail: patches }] },
  ];
  return { id: "gloomhound", bones, seed: 11, bounds: [3, 2.5] };
}

// ---------------------------------------------------------------- Thornskulk

function thornskulk() {
  const bark = "#5b4130";
  const barkDark = "#3f2c20";
  const moss = "#5d8f2a";
  const thorn = "#e2d6b5";
  const barkDetail = (mossTop) => (canvas, faces, rand) => {
    for (const r of [faces.side1, faces.front, faces.side2, faces.back]) {
      // vertical bark grooves
      for (let i = 0; i < r.w; i++) if (rand() < 0.3) canvas.rect(r.x + i, r.y, 1, r.h, shade(hex(barkDark), 0.9 + rand() * 0.2));
      // moss creeping down from the top
      canvas.speckle(r.x, r.y, r.w, Math.min(mossTop, r.h), hex(moss), 0.55, rand);
    }
    canvas.speckle(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hex(moss), 0.7, rand);
  };
  const thornCube = (x, y, z, h = 4) => ({ origin: [x, y, z], size: [2, h, 2], colour: thorn, noise: 0.05 });
  const bones = [
    {
      name: "body",
      pivot: [0, 9, 0],
      cubes: [
        { origin: [-7, 9, -5], size: [14, 11, 9], colour: bark, detail: barkDetail(3) },
        { origin: [-6, 20, -4], size: [12, 3, 8], colour: moss, noise: 0.16 },
        thornCube(-5, 23, -2),
        thornCube(3, 23, 0),
        thornCube(-1, 23, 2, 3),
      ],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 16, -5],
      cubes: [
        {
          origin: [-4, 12, -12],
          size: [8, 7, 7],
          colour: bark,
          detail: (canvas, faces, rand) => {
            barkDetail(2)(canvas, faces, rand);
            const f = faces.front;
            canvas.rect(f.x + 1, f.y + 3, 6, 1, hex("#241810"));
            eyes("#a6ff3d", 3, 1, 2, "#e9ffc2")(canvas, faces);
            canvas.rect(f.x + 2, f.y + 5, 4, 1, hex("#241810"));
          },
        },
      ],
    },
    {
      name: "leftarm",
      parent: "body",
      pivot: [9.5, 18, 0],
      cubes: [{ origin: [7, 3, -3], size: [5, 15, 5], colour: bark, detail: barkDetail(4) }, thornCube(9, 18, -1, 3)],
    },
    {
      name: "rightarm",
      parent: "body",
      pivot: [-9.5, 18, 0],
      cubes: [{ origin: [-12, 3, -3], size: [5, 15, 5], colour: bark, detail: barkDetail(4) }, thornCube(-11, 18, -1, 3)],
    },
    { name: "leftleg", pivot: [4.5, 9, 0], cubes: [{ origin: [2, 0, -2.5], size: [5, 9, 5], colour: barkDark, detail: barkDetail(1) }] },
    { name: "rightleg", pivot: [-4.5, 9, 0], cubes: [{ origin: [-7, 0, -2.5], size: [5, 9, 5], colour: barkDark, detail: barkDetail(1) }] },
  ];
  return { id: "thornskulk", bones, seed: 23, bounds: [3, 3], tex: [128, 64] };
}

// ---------------------------------------------------------------- Horde zombies

const ZOMBIE_LOOKS = {
  horde_stalker: { skin: "#7ea04d", shirt: "#cfc8b8", pants: "#4a3a5a", eye: "#ffb020", glow: "#fff0b0", hair: "#2b2030", slash: "#a32222", seed: 31 },
  horde_shambler: { skin: "#6a9a4a", shirt: "#5b4a6e", pants: "#3d3550", eye: "#d9c53a", seed: 41 },
  horde_skitter: { skin: "#a3b592", shirt: "#4c4c4c", pants: "#2e2e2e", eye: "#ff6a3d", seed: 51 },
  horde_grasper: { skin: "#4f7a55", shirt: "#2f4f4f", pants: "#263838", eye: "#f2f2f2", hands: "#c8d6b0", seed: 61 },
  horde_brute: { skin: "#5f7f3f", shirt: "#6b2f2a", pants: "#3a2a22", eye: "#ffd23d", seed: 71 },
};

function zombie(id) {
  const look = ZOMBIE_LOOKS[id];
  const rips = (canvas, faces, rand) => {
    for (const r of [faces.side1, faces.front, faces.side2, faces.back]) {
      // a ragged hem with skin showing through
      for (let i = 0; i < r.w; i++) if (rand() < 0.5) canvas.set(r.x + i, r.y + r.h - 1, shade(hex(look.skin), 0.9));
      canvas.speckle(r.x, r.y, r.w, r.h, shade(hex(look.shirt), 0.7), 0.12, rand);
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
          for (const r of [faces.side1, faces.front, faces.side2, faces.back]) {
            canvas.noise(r.x, r.y, r.w, 4, hex(look.shirt), 0.1, rand); // short torn sleeve
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
          for (const r of [faces.side1, faces.front, faces.side2, faces.back]) {
            canvas.noise(r.x, r.y + r.h - 3, r.w, 3, shade(hex(look.skin), 0.85), 0.1, rand); // bare feet
            for (let i = 0; i < r.w; i++) if (rand() < 0.4) canvas.set(r.x + i, r.y + r.h - 4, shade(hex(look.skin), 0.85));
          }
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
            if (look.slash) {
              const f = faces.front;
              for (let i = 0; i < 6; i++) canvas.rect(f.x + 1 + i, f.y + 3 + Math.floor(i * 0.8), 1, 2, hex(look.slash));
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
            for (const r of Object.values(faces)) canvas.speckle(r.x, r.y, r.w, r.h, shade(hex(look.skin), 0.75), 0.1, rand);
            if (look.hair) {
              canvas.noise(faces.top.x, faces.top.y, faces.top.w, faces.top.h, hex(look.hair), 0.15, rand);
              for (const r of [faces.side1, faces.side2, faces.back]) canvas.noise(r.x, r.y, r.w, 4, hex(look.hair), 0.15, rand);
              canvas.noise(f.x, f.y, f.w, 2, hex(look.hair), 0.15, rand);
              for (let i = 0; i < f.w; i += 2) canvas.set(f.x + i, f.y + 2, hex(look.hair));
            }
            canvas.rect(f.x + 1, f.y + 3, 2, 1, hex("#1c2414"));
            canvas.rect(f.x + 5, f.y + 3, 2, 1, hex("#1c2414"));
            eyes(look.eye, 4, 1, 2, look.glow)(canvas, faces);
            canvas.rect(f.x + 2, f.y + 6, 4, 1, hex("#241a1a"));
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
