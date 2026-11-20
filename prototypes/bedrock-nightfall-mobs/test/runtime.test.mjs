// Runs the real game script against small stand-ins for the Minecraft modules.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hordeSize } from "../src/scripts/balance.js";
import { maxLootBudget } from "../src/scripts/horde.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nightfall-"));
fs.cpSync(path.join(root, "src", "scripts"), path.join(sandbox, "scripts"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), '{"type":"module"}');
for (const [name, stub] of [["server", "server.mjs"], ["server-ui", "server-ui.mjs"]]) {
  const dir = path.join(sandbox, "node_modules", "@minecraft", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `@minecraft/${name}`, type: "module", main: "index.js" }));
  fs.copyFileSync(path.join(root, "test", "stubs", stub), path.join(dir, "index.js"));
}
const mc = await import(pathToFileURL(path.join(sandbox, "node_modules/@minecraft/server/index.js")).href);
const ui = await import(pathToFileURL(path.join(sandbox, "node_modules/@minecraft/server-ui/index.js")).href);
await import(pathToFileURL(path.join(sandbox, "scripts/main.js")).href);
const { world, dimension, __test: t, makePlayer, makeEntity } = mc;
const settle = () => new Promise((resolve) => setImmediate(resolve));

world.afterEvents.worldLoad.emit({});
const host = makePlayer("Host", { x: 0.5, y: 64, z: 0.5 }, { operator: true });
const guest = makePlayer("Guest", { x: 3.5, y: 64, z: 0.5 });
const members = () => t.entities.filter((e) => e.families.includes("horde_member"));

test("first join gives the guide once; rejoining or respawning does not give another", () => {
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: false });
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  assert.deepEqual(host.inventory.map((s) => s.typeId), ["nightfall:night_guide"]);
});

test("new mobs get the current difficulty applied exactly once", () => {
  const hound = dimension.spawnEntity("nightfall:gloomhound", { x: 40, y: 64, z: 0 });
  assert.deepEqual(hound.events, ["nightfall:set_normal"]);
  world.afterEvents.entityLoad.emit({ entity: hound });
  assert.equal(hound.events.length, 1);
  const cow = dimension.spawnEntity("minecraft:cow", { x: 41, y: 64, z: 0 });
  assert.deepEqual(cow.events, []);
});

test("guest sees the guide but cannot change anything", async () => {
  ui.__ui.forms.length = 0;
  world.afterEvents.itemUse.emit({ source: guest, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.deepEqual(ui.__ui.forms[0].buttons, ["Night Mobs"]);
  assert.match(ui.__ui.forms[0].bodyText, /Only the world host/);
});

test("host changes difficulty from the guide: saved, announced, and live mobs are updated", async () => {
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(3); // buttons: Night Mobs, Easy, Normal, Hard, Extreme, Hordes
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.equal(ui.__ui.forms[0].buttons.length, 6);
  assert.equal(world.getDynamicProperty("nightfall:difficulty"), "hard");
  assert.ok(t.messages.at(-1).includes("Hard"));
  const hound = t.entities.find((e) => e.typeId === "nightfall:gloomhound");
  assert.equal(hound.events.at(-1), "nightfall:set_hard");
  assert.match(ui.__ui.forms.at(-1).bodyText, /Hard/);
});

test("stalker scream warns players; the call brings one horde in three waves, away from players", () => {
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 25, y: 64, z: 0 });
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:begin_scream" });
  assert.ok(host.actionBar.at(-1).includes("Stalker"));
  assert.equal(members().length, 0);
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  assert.ok(host.sounds.includes("raid.horn"));
  assert.equal(members().length, 0, "nothing appears instantly");
  t.advance(60);
  const firstWave = members().length;
  assert.ok(firstWave > 0 && firstWave < hordeSize("hard"));
  t.advance(120);
  assert.equal(members().length, hordeSize("hard"));
  for (const member of members()) {
    for (const player of [host, guest]) {
      assert.ok(Math.hypot(member.location.x - player.location.x, member.location.z - player.location.z) >= 16);
    }
    assert.equal(member.events.at(-1), "nightfall:set_hard");
  }
  const carriers = members().filter((m) => m.getDynamicProperty("nightfall:loot"));
  assert.ok(carriers.length >= 5 && carriers.length <= maxLootBudget("hard"));
});

test("a second call nearby does nothing while a horde is still alive", () => {
  const before = members().length;
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 20, y: 64, z: 5 });
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  t.advance(400);
  assert.equal(members().length, before);
});

test("horde loot: only carriers drop, only for player kills, one item each", () => {
  t.items.length = 0;
  const carrier = members().find((m) => m.getDynamicProperty("nightfall:loot"));
  const empty = members().find((m) => !m.getDynamicProperty("nightfall:loot"));
  world.afterEvents.entityDie.emit({ deadEntity: empty, damageSource: { cause: "entityAttack", damagingEntity: host } });
  world.afterEvents.entityDie.emit({ deadEntity: carrier, damageSource: { cause: "fire" } });
  assert.equal(t.items.length, 0);
  world.afterEvents.entityDie.emit({ deadEntity: carrier, damageSource: { cause: "entityAttack", damagingEntity: host } });
  assert.equal(t.items.length, 1);
  assert.equal(t.items[0].stack.amount, 1);
});

test("grasper slows a player, but not again inside the cooldown", () => {
  const grasper = makeEntity("nightfall:horde_grasper", { x: 1, y: 64, z: 1 });
  const hit = () => world.afterEvents.entityHurt.emit({ hurtEntity: guest, damageSource: { cause: "entityAttack", damagingEntity: grasper } });
  hit();
  hit();
  assert.equal(guest.effects.filter((e) => e.type === "slowness").length, 1);
  assert.equal(guest.effects[0].duration, 30); // 1.5s on Hard
  t.advance(101);
  hit();
  assert.equal(guest.effects.filter((e) => e.type === "slowness").length, 2);
  assert.equal(host.effects.length, 0, "other players are not affected");
});

test("bramble charm in the off hand pricks attackers; without it nothing happens", () => {
  const zombie = makeEntity("minecraft:zombie", { x: 1, y: 64, z: 1 });
  const hit = () => world.afterEvents.entityHurt.emit({ hurtEntity: host, damageSource: { cause: "entityAttack", damagingEntity: zombie } });
  hit();
  assert.equal(zombie.damage.length, 0);
  host.equipment.Offhand = { typeId: "nightfall:bramble_charm" };
  hit();
  assert.deepEqual(zombie.damage.map((d) => d.amount), [2]);
});

test("shadow hood gives night vision only while worn", () => {
  const tick = t.intervals[0];
  tick();
  assert.equal(host.effects.filter((e) => e.type === "night_vision").length, 0);
  host.equipment.Head = { typeId: "nightfall:shadow_hood" };
  tick();
  const effect = host.effects.find((e) => e.type === "night_vision");
  assert.ok(effect.duration > 200, "must stay above 10 seconds so the screen does not flicker");
  assert.equal(guest.effects.filter((e) => e.type === "night_vision").length, 0);
});

test("hordes can be switched off by the host", async () => {
  for (const m of members()) m.isValid = false;
  ui.__ui.answers.push(5);
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.equal(world.getDynamicProperty("nightfall:hordes"), false);
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 25, y: 64, z: 0 });
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  t.advance(400);
  assert.equal(members().filter((m) => m.isValid).length, 0);
});
