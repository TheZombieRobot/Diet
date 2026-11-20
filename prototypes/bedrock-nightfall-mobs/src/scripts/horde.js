// Pure horde logic (no Minecraft imports) so it can be unit tested with Node.
import { HORDE, MOBS, NAMESPACE, hordeSize } from "./balance.js";

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The full list of member entity ids for one horde, shuffled.
export function rollMembers(difficulty, rng = Math.random) {
  const members = [];
  for (const [key, count] of Object.entries(HORDE.composition[difficulty])) {
    for (let i = 0; i < count; i++) members.push(`${NAMESPACE}:${key}`);
  }
  return shuffle(rng, members);
}

// The horde-wide loot budget: a short list of item ids, one item each.
export function rollLootBudget(difficulty, rng = Math.random) {
  const loot = HORDE.loot;
  const budget = [];
  const flesh = randInt(rng, ...loot.rottenFlesh[difficulty]);
  for (let i = 0; i < flesh; i++) budget.push("minecraft:rotten_flesh");
  const useful = randInt(rng, ...loot.usefulCount[difficulty]);
  for (let i = 0; i < useful; i++) {
    budget.push(loot.usefulItems[Math.floor(rng() * loot.usefulItems.length)]);
  }
  if (rng() < loot.hordeClawChance[difficulty]) budget.push(`${NAMESPACE}:horde_claw`);
  if (rng() < loot.tatteredClothChance[difficulty]) budget.push(`${NAMESPACE}:tattered_cloth`);
  return budget;
}

// Largest possible budget, used by tests and the balance report.
export function maxLootBudget(difficulty) {
  const loot = HORDE.loot;
  return loot.rottenFlesh[difficulty][1] + loot.usefulCount[difficulty][1] + 2;
}

// Plan one horde: which member arrives in which wave and which members carry loot.
// Each member carries at most one item, so the budget can never be exceeded or duplicated.
export function planHorde(difficulty, rng = Math.random) {
  const members = rollMembers(difficulty, rng);
  const budget = rollLootBudget(difficulty, rng).slice(0, members.length);
  const carriers = shuffle(rng, members.map((_, i) => i)).slice(0, budget.length);
  const lootByIndex = new Map(carriers.map((memberIndex, i) => [memberIndex, budget[i]]));
  const waves = HORDE.waveSeconds.length;
  return members.map((typeId, i) => ({
    typeId,
    wave: i % waves,
    loot: lootByIndex.get(i),
  }));
}

// A random point on the spawn ring around a centre (x/z only).
export function ringPoint(centre, rng = Math.random) {
  const angle = rng() * Math.PI * 2;
  const distance = HORDE.ringMin + rng() * (HORDE.ringMax - HORDE.ringMin);
  return {
    x: Math.floor(centre.x + Math.cos(angle) * distance) + 0.5,
    z: Math.floor(centre.z + Math.sin(angle) * distance) + 0.5,
  };
}

export function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function farEnoughFromAll(point, playerLocations) {
  return playerLocations.every((p) => horizontalDistance(point, p) >= HORDE.minPlayerDistance);
}

export function hordeXp(difficulty) {
  let total = MOBS.horde_stalker.xp;
  for (const [key, count] of Object.entries(HORDE.composition[difficulty])) total += MOBS[key].xp * count;
  return total;
}

export { hordeSize };
