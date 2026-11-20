// Nightfall Mobs - balance tables.
// This file is the single source of truth for every number in the add-on.
// The build reads it to generate the entity files and docs/BALANCE.md, and the
// in-game scripts read it for horde size, loot and effects. Change numbers here only.

export const NAMESPACE = "nightfall";

export const DIFFICULTIES = ["easy", "normal", "hard", "extreme"];
export const DEFAULT_DIFFICULTY = "normal";

export const DIFFICULTY_LABELS = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  extreme: "Extreme",
};

// Vanilla reference values (Bedrock, world difficulty Normal) used by the maths and tests.
export const VANILLA = {
  playerHealth: 20,
  zombie: { health: 20, damage: 3, speed: 0.23 },
  spider: { health: 16, damage: 2, speed: 0.3 },
  enderman: { health: 40, damage: 7, speed: 0.3 },
  swords: { wooden: 5, stone: 6, iron: 7, diamond: 8, netherite: 9 },
  // A mob can only hurt a player once per half second (damage immunity),
  // so a crowd can never deal more than two hits per second in total.
  maxHitsPerSecondOnPlayer: 2,
  ironArmourReduction: 0.6,
};

// health / damage are listed per add-on difficulty: easy, normal, hard, extreme.
// speed is the Bedrock movement value (zombie 0.23, spider 0.30, baby zombie 0.35).
export const MOBS = {
  gloomhound: {
    name: "Gloomhound",
    health: { easy: 18, normal: 22, hard: 26, extreme: 30 },
    damage: { easy: 3, normal: 4, hard: 5, extreme: 6 },
    speed: 0.3,
    lightSpeed: 0.15,
    detectRange: 24,
    knockbackResistance: 0,
    xp: 6,
    collision: { width: 0.8, height: 0.95 },
    scale: 1.2,
    families: ["gloomhound", "nightfall", "monster", "mob"],
  },
  thornskulk: {
    name: "Thornskulk",
    health: { easy: 20, normal: 24, hard: 28, extreme: 32 },
    damage: { easy: 4, normal: 5, hard: 6, extreme: 7 },
    speed: 0.2,
    burstSpeed: 0.32,
    tiredSpeed: 0.17,
    burstSeconds: 4,
    tiredSeconds: 5,
    detectRange: 10,
    knockbackResistance: 0.3,
    xp: 7,
    collision: { width: 1.0, height: 1.7 },
    scale: 1,
    families: ["thornskulk", "nightfall", "monster", "mob"],
  },
  horde_stalker: {
    name: "Horde Stalker",
    health: { easy: 26, normal: 32, hard: 36, extreme: 40 },
    damage: { easy: 4, normal: 5, hard: 6, extreme: 7 },
    speed: 0.26,
    detectRange: 32,
    screamSeconds: 3,
    knockbackResistance: 0.2,
    xp: 7,
    collision: { width: 0.6, height: 1.9 },
    scale: 1.08,
    burns: true,
    families: ["horde_stalker", "horde", "zombie", "undead", "nightfall", "monster", "mob"],
  },
  horde_shambler: {
    name: "Horde Shambler",
    health: { easy: 10, normal: 12, hard: 14, extreme: 16 },
    damage: { easy: 1, normal: 2, hard: 2, extreme: 3 },
    speed: 0.23,
    detectRange: 48,
    knockbackResistance: 0,
    xp: 2,
    collision: { width: 0.6, height: 1.9 },
    scale: 1,
    burns: true,
    hordeMember: true,
    families: ["horde_member", "horde", "zombie", "undead", "nightfall", "monster", "mob"],
  },
  horde_skitter: {
    name: "Horde Skitter",
    health: { easy: 6, normal: 8, hard: 8, extreme: 10 },
    damage: { easy: 1, normal: 2, hard: 2, extreme: 3 },
    speed: 0.28,
    detectRange: 48,
    knockbackResistance: 0,
    xp: 3,
    collision: { width: 0.6, height: 1.9 },
    scale: 0.75,
    burns: true,
    hordeMember: true,
    families: ["horde_member", "horde", "zombie", "undead", "nightfall", "monster", "mob"],
  },
  horde_grasper: {
    name: "Horde Grasper",
    health: { easy: 8, normal: 10, hard: 12, extreme: 14 },
    damage: { easy: 1, normal: 1, hard: 2, extreme: 2 },
    speed: 0.23,
    detectRange: 48,
    knockbackResistance: 0,
    xp: 3,
    collision: { width: 0.6, height: 1.9 },
    scale: 1,
    burns: true,
    hordeMember: true,
    families: ["horde_member", "horde", "zombie", "undead", "nightfall", "monster", "mob"],
  },
  horde_brute: {
    name: "Horde Brute",
    health: { easy: 16, normal: 20, hard: 24, extreme: 28 },
    damage: { easy: 2, normal: 3, hard: 4, extreme: 4 },
    speed: 0.18,
    detectRange: 48,
    knockbackResistance: 0.5,
    xp: 4,
    collision: { width: 0.6, height: 1.9 },
    scale: 1.25,
    burns: true,
    hordeMember: true,
    families: ["horde_member", "horde", "zombie", "undead", "nightfall", "monster", "mob"],
  },
};

// The host can switch whole groups of mobs off (Nightfall Guide > Choose Mobs). Each toggle covers
// the listed MOBS keys; the Horde Stalker toggle also covers the four horde members its call spawns.
// Labels are plain ASCII: they are shown on forms read on a TV.
export const MOB_TOGGLES = {
  gloomhound: { label: "Gloomhound", mobs: ["gloomhound"] },
  thornskulk: { label: "Thornskulk", mobs: ["thornskulk"] },
  horde_stalker: {
    label: "Horde Stalker",
    mobs: ["horde_stalker", "horde_shambler", "horde_skitter", "horde_grasper", "horde_brute"],
  },
};

// Brightness is the game's 0..1 value (the vanilla spider uses 0.49).
// About 0.30 is light level 10 (within ~4 blocks of a torch); 0.20 is light level 7.
export const LIGHT = { enterLight: 0.3, enterDark: 0.2 };

// The Grasper's hit slows the player briefly. The cooldown is per player, so
// several Graspers can never chain-slow ("stunlock") anybody.
export const GRASPER = {
  slowSeconds: { easy: 1, normal: 1, hard: 1.5, extreme: 2 },
  cooldownSeconds: 5,
};

export const HORDE = {
  // How many of each type a Stalker's call brings.
  composition: {
    easy: { horde_shambler: 11, horde_skitter: 1, horde_grasper: 2, horde_brute: 0 },
    normal: { horde_shambler: 15, horde_skitter: 3, horde_grasper: 3, horde_brute: 1 },
    hard: { horde_shambler: 16, horde_skitter: 4, horde_grasper: 4, horde_brute: 2 },
    extreme: { horde_shambler: 17, horde_skitter: 5, horde_grasper: 5, horde_brute: 3 },
  },
  // The horde arrives in three groups, this many seconds after the call.
  waveSeconds: [3, 6, 9],
  // Members appear on a ring this far (in blocks) from the hunted player...
  ringMin: 20,
  ringMax: 32,
  // ...and never closer than this to ANY player.
  minPlayerDistance: 16,
  maxHeightDifference: 10,
  // Safety caps so a world can never fill up with horde mobs.
  areaRadius: 64,
  maxMembersNearbyToCall: 8,
  maxLiveMembers: 45,
  // Horde-wide loot. Members have no loot table; instead a fixed budget is
  // handed out to random members when the horde spawns, so 30 kills never
  // means 30 piles of rotten flesh. Loot only drops for kills by a player.
  loot: {
    rottenFlesh: { easy: [3, 4], normal: [4, 6], hard: [4, 6], extreme: [5, 7] },
    usefulCount: { easy: [1, 1], normal: [1, 2], hard: [1, 2], extreme: [2, 2] },
    usefulItems: ["minecraft:iron_ingot", "minecraft:carrot", "minecraft:potato", "minecraft:bone", "minecraft:coal"],
    hordeClawChance: { easy: 0.35, normal: 0.5, hard: 0.6, extreme: 0.75 },
    tatteredClothChance: { easy: 0.15, normal: 0.2, hard: 0.25, extreme: 0.35 },
  },
};

// Drop chances for the mobs that use ordinary loot tables.
export const LOOT = {
  gloomhound: { string: [0, 2], gloomFangChance: 0.5, shadowHideChance: 0.2 },
  thornskulk: { stick: [0, 2], thornCoreChance: 0.4, barkHideChance: 0.2 },
  horde_stalker: { rottenFlesh: [0, 2], hordeClawChance: 0.5, tatteredClothChance: 0.2 },
};

// Natural spawning. Vanilla weights for comparison: zombie 100, enderman 10.
export const SPAWNS = {
  gloomhound: { weight: 10, herd: [1, 2], densitySurface: 2, biomeTags: ["plains", "forest"] },
  thornskulk: { weight: 8, herd: [1, 1], densitySurface: 2, biomeTags: ["forest", "taiga"] },
  horde_stalker: { weight: 6, herd: [1, 1], densitySurface: 1, biomeTags: ["monster"] },
};

export const GEAR = {
  shadowHood: { protection: 2, durability: 165, nightVisionSeconds: 15 },
  brambleCharm: { thornsDamage: 2 },
};

export function isDifficulty(value) {
  return DIFFICULTIES.includes(value);
}

export function hordeSize(difficulty) {
  return Object.values(HORDE.composition[difficulty]).reduce((a, b) => a + b, 0);
}
