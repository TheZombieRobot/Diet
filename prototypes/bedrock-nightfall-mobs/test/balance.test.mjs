import test from "node:test";
import assert from "node:assert/strict";
import { DIFFICULTIES, GRASPER, HORDE, LIGHT, MOBS, SPAWNS, VANILLA, hordeSize } from "../src/scripts/balance.js";
import { farEnoughFromAll, horizontalDistance, maxLootBudget, planHorde, ringPoint, rollLootBudget } from "../src/scripts/horde.js";
import { rng } from "../tools/lib/paint.mjs";

const SOLO = ["gloomhound", "thornskulk", "horde_stalker"];
const MEMBERS = Object.keys(MOBS).filter((key) => MOBS[key].hordeMember);

test("every mob has stats for every difficulty and they never get easier as difficulty rises", () => {
  for (const [key, mob] of Object.entries(MOBS)) {
    for (const stat of ["health", "damage"]) {
      const values = DIFFICULTIES.map((d) => mob[stat][d]);
      values.forEach((v) => assert.ok(Number.isInteger(v) && v >= 1, `${key} ${stat}`));
      for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1], `${key} ${stat} goes down`);
    }
  }
});

test("Normal: solo mobs are a little harder than a zombie but below an Enderman", () => {
  for (const key of SOLO) {
    const mob = MOBS[key];
    assert.ok(mob.health.normal > VANILLA.zombie.health && mob.health.normal < VANILLA.enderman.health, `${key} health`);
    assert.ok(mob.damage.normal > VANILLA.zombie.damage && mob.damage.normal < VANILLA.enderman.damage, `${key} damage`);
    assert.ok(Math.ceil(VANILLA.playerHealth / mob.damage.normal) >= 4, `${key} must need at least 4 hits on an unarmoured player`);
  }
});

test("no mob can ever two-shot a full-health player, even on Extreme", () => {
  for (const [key, mob] of Object.entries(MOBS)) assert.ok(mob.damage.extreme * 2 < VANILLA.playerHealth, key);
  for (const key of SOLO) assert.ok(Math.ceil(VANILLA.playerHealth / MOBS[key].damage.extreme) >= 3, key);
});

test("everything can be outrun: no mob is faster than a baby zombie", () => {
  for (const [key, mob] of Object.entries(MOBS)) {
    for (const speed of [mob.speed, mob.burstSpeed].filter(Boolean)) assert.ok(speed < 0.35, key);
  }
  assert.ok(MOBS.gloomhound.lightSpeed < MOBS.gloomhound.speed);
  assert.ok(MOBS.thornskulk.tiredSpeed < VANILLA.zombie.speed);
  assert.ok(LIGHT.enterDark < LIGHT.enterLight, "light thresholds need a gap so mobs do not flicker between states");
});

test("horde members are individually weaker than a vanilla zombie on Normal", () => {
  for (const key of MEMBERS) {
    assert.ok(MOBS[key].health.normal <= VANILLA.zombie.health, key);
    assert.ok(MOBS[key].damage.normal <= VANILLA.zombie.damage, key);
  }
  assert.ok(MOBS.horde_shambler.health.normal < VANILLA.zombie.health);
  assert.ok(MOBS.horde_shambler.damage.normal < VANILLA.zombie.damage);
});

test("horde size: about 20-30 from Normal up, smaller on Easy, mostly Shamblers", () => {
  assert.ok(hordeSize("easy") < hordeSize("normal"));
  for (const d of ["normal", "hard", "extreme"]) assert.ok(hordeSize(d) >= 20 && hordeSize(d) <= 30, d);
  for (const d of DIFFICULTIES) {
    const comp = HORDE.composition[d];
    assert.ok(comp.horde_shambler > hordeSize(d) / 2, `${d} shamblers`);
    assert.ok(comp.horde_brute <= 3 && comp.horde_skitter <= 5, d);
    assert.ok(hordeSize(d) <= HORDE.maxLiveMembers);
  }
});

test("a swarm leaves time to escape: at least 3 seconds of standing still unarmoured on Normal", () => {
  const worstHit = Math.max(...MEMBERS.map((key) => MOBS[key].damage.normal));
  const seconds = VANILLA.playerHealth / (worstHit * VANILLA.maxHitsPerSecondOnPlayer);
  assert.ok(seconds >= 3, `only ${seconds}s`);
});

test("grasper slow is short and cannot chain", () => {
  for (const d of DIFFICULTIES) assert.ok(GRASPER.slowSeconds[d] <= 2 && GRASPER.cooldownSeconds >= GRASPER.slowSeconds[d] * 2);
});

test("horde plan: right size, three waves, loot never exceeds the budget", () => {
  for (const d of DIFFICULTIES) {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = planHorde(d, rng(seed));
      assert.equal(plan.length, hordeSize(d));
      for (const [key, count] of Object.entries(HORDE.composition[d])) {
        assert.equal(plan.filter((m) => m.typeId === `nightfall:${key}`).length, count);
      }
      const loot = plan.filter((m) => m.loot).map((m) => m.loot);
      assert.ok(loot.length <= maxLootBudget(d), `${d} seed ${seed} loot ${loot.length}`);
      assert.ok(loot.filter((item) => item === "minecraft:rotten_flesh").length <= HORDE.loot.rottenFlesh[d][1]);
      assert.ok(loot.filter((item) => item === "nightfall:horde_claw").length <= 1);
      const waves = HORDE.waveSeconds.map((_, w) => plan.filter((m) => m.wave === w).length);
      assert.ok(Math.max(...waves) - Math.min(...waves) <= 1, "waves should be even");
    }
  }
});

test("normal loot budget is 4-6 rotten flesh plus 1-2 useful items", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const budget = rollLootBudget("normal", rng(seed));
    const flesh = budget.filter((item) => item === "minecraft:rotten_flesh").length;
    const useful = budget.filter((item) => HORDE.loot.usefulItems.includes(item)).length;
    assert.ok(flesh >= 4 && flesh <= 6);
    assert.ok(useful >= 1 && useful <= 2);
  }
});

test("spawn ring keeps the horde away from players", () => {
  assert.ok(HORDE.ringMin >= HORDE.minPlayerDistance);
  const centre = { x: 100.5, y: 64, z: -40.5 };
  const random = rng(5);
  for (let i = 0; i < 500; i++) {
    const p = ringPoint(centre, random);
    const distance = horizontalDistance(p, centre);
    assert.ok(distance >= HORDE.ringMin - 1.5 && distance <= HORDE.ringMax + 1.5, String(distance));
  }
  assert.equal(farEnoughFromAll({ x: 0, z: 0 }, [{ x: 30, z: 0 }, { x: 5, z: 5 }]), false);
  assert.equal(farEnoughFromAll({ x: 0, z: 0 }, [{ x: 30, z: 0 }]), true);
});

test("natural spawns are rare next to vanilla (zombie weight 100, enderman 10)", () => {
  for (const [key, spawn] of Object.entries(SPAWNS)) assert.ok(spawn.weight <= 10, key);
  assert.equal(SPAWNS.horde_stalker.densitySurface, 1);
  assert.deepEqual(SPAWNS.horde_stalker.herd, [1, 1]);
});
