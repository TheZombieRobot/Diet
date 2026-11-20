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

test("first join gives the guide once; rejoining or respawning does not give another", async () => {
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: false });
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  assert.deepEqual(host.inventory.map((s) => s.typeId), ["nightfall:night_guide"]);
  // The host's first join also opens the first-time setup form. Nobody answers here, so it counts as closed.
  await settle();
  assert.equal(world.getDynamicProperty("nightfall:setup_done"), true);
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
  ui.__ui.answers.push(3); // buttons: Night Mobs, Easy, Normal, Hard, Extreme, Hordes, Choose Mobs
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.equal(ui.__ui.forms[0].buttons.length, 7); // + Choose Mobs, kept last so the earlier indexes stay put
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

// ---------------------------------------------------------------- choosing mobs
// From here on the world is on Hard with Hordes Off, every mob On, and first-time setup already done.

const CHOOSE_MOBS = 6; // guide button index for the host
const ALL = ["nightfall:gloomhound", "nightfall:thornskulk", "nightfall:horde_stalker", "nightfall:horde_shambler", "nightfall:horde_skitter", "nightfall:horde_grasper", "nightfall:horde_brute"];
const modalForms = () => ui.__ui.forms.filter((f) => f.toggles);
const alive = (typeId) => t.entities.filter((e) => e.typeId === typeId && e.isValid);

// The host opens the guide, presses Choose Mobs and submits these toggle values (Gloomhound, Thornskulk, Horde Stalker).
async function hostChoosesMobs(values) {
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(CHOOSE_MOBS, values);
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
}

test("by default every mob is on and nothing is removed", () => {
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), undefined);
  for (const typeId of ALL) {
    const entity = dimension.spawnEntity(typeId, { x: 50, y: 64, z: 50 });
    assert.equal(entity.isValid, true, typeId);
    assert.equal(entity.events.at(-1), "nightfall:set_hard", typeId);
    entity.remove();
  }
});

test("Choose Mobs shows one toggle per mob, all on; saving turns one off, announces it and returns to the guide", async () => {
  await hostChoosesMobs([true, false, true]);
  const [form] = modalForms();
  assert.equal(form.titleText, "Choose Mobs");
  assert.deepEqual(form.toggles, [
    { label: "Gloomhound", defaultValue: true },
    { label: "Thornskulk", defaultValue: true },
    { label: "Horde Stalker", defaultValue: true },
  ]);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), '["thornskulk"]');
  assert.match(t.messages.at(-1), /Thornskulk Off/);
  assert.match(t.messages.at(-1), /Gloomhound On/);
  const last = ui.__ui.forms.at(-1);
  assert.equal(last.titleText, "Nightfall Guide", "back at the guide");
  assert.match(last.bodyText, /Mobs Off: .*Thornskulk/);
});

test("a disabled mob is removed when it spawns or loads, and never gets a difficulty event", () => {
  const spawned = dimension.spawnEntity("nightfall:thornskulk", { x: 50, y: 64, z: 50 });
  assert.equal(spawned.isValid, false);
  assert.deepEqual(spawned.events, []);
  const loaded = makeEntity("nightfall:thornskulk", { x: 60, y: 64, z: 60 }, ["nightfall"]);
  world.afterEvents.entityLoad.emit({ entity: loaded });
  assert.equal(loaded.isValid, false);
  assert.deepEqual(loaded.events, []);
  const hound = dimension.spawnEntity("nightfall:gloomhound", { x: 50, y: 64, z: 50 });
  assert.equal(hound.isValid, true);
  assert.equal(hound.events.at(-1), "nightfall:set_hard");
  const cow = dimension.spawnEntity("minecraft:cow", { x: 51, y: 64, z: 50 });
  assert.equal(cow.isValid, true);
});

test("switching a mob off removes every loaded one, and Horde Stalker also covers the four horde members", async () => {
  const hound = dimension.spawnEntity("nightfall:gloomhound", { x: 50, y: 64, z: 50 });
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 52, y: 64, z: 50 });
  const horde = ALL.slice(3).map((typeId) => dimension.spawnEntity(typeId, { x: 54, y: 64, z: 50 }));
  assert.equal(horde.length, 4);
  for (const e of [stalker, ...horde]) assert.equal(e.isValid, true);
  // Thornskulk back on (default is pre-set to the saved state), Horde Stalker off.
  await hostChoosesMobs([true, true, false]);
  assert.deepEqual(modalForms()[0].toggles.map((x) => x.defaultValue), [true, false, true], "pre-set to the saved state");
  for (const e of [stalker, ...horde]) assert.equal(e.isValid, false, e.typeId);
  assert.equal(hound.isValid, true);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), '["horde_stalker"]');
  assert.equal(dimension.spawnEntity("nightfall:thornskulk", { x: 50, y: 64, z: 50 }).isValid, true);
  assert.equal(dimension.spawnEntity("nightfall:horde_brute", { x: 50, y: 64, z: 50 }).isValid, false);
});

test("with the Horde Stalker off, a call_horde spawns nothing even when Hordes are On", async () => {
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(5); // Hordes button: turn them back on
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.equal(world.getDynamicProperty("nightfall:hordes"), true);
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 25, y: 64, z: 0 });
  assert.equal(stalker.isValid, false);
  const horns = host.sounds.filter((s) => s === "raid.horn").length;
  const created = t.entities.length;
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  t.advance(400);
  assert.equal(host.sounds.filter((s) => s === "raid.horn").length, horns, "no horn: the call did nothing");
  assert.equal(t.entities.length, created, "nothing was even spawned");
  assert.equal(members().filter((m) => m.isValid).length, 0);
});

test("with the Horde Stalker on again, Hordes On works as before", async () => {
  await hostChoosesMobs([true, true, true]);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), "[]");
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 25, y: 64, z: 0 });
  assert.equal(stalker.isValid, true);
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  t.advance(400);
  assert.equal(members().filter((m) => m.isValid).length, hordeSize("hard"));
  for (const e of t.entities) if (e.typeId.startsWith("nightfall:")) e.isValid = false;
});

test("a horde already on its way stops arriving if the Horde Stalker is switched off", async () => {
  const stalker = dimension.spawnEntity("nightfall:horde_stalker", { x: 25, y: 64, z: 0 });
  world.afterEvents.dataDrivenEntityTrigger.emit({ entity: stalker, eventId: "nightfall:call_horde" });
  await hostChoosesMobs([true, true, false]);
  const created = t.entities.length;
  t.advance(400);
  assert.equal(t.entities.length, created);
  await hostChoosesMobs([true, true, true]);
  for (const e of t.entities) if (e.typeId.startsWith("nightfall:")) e.isValid = false;
});

test("guests see which mobs are Off but get no Choose Mobs button", async () => {
  await hostChoosesMobs([false, true, true]);
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(0); // Night Mobs
  world.afterEvents.itemUse.emit({ source: guest, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  const [guide, mobs] = ui.__ui.forms;
  assert.deepEqual(guide.buttons, ["Night Mobs"]);
  assert.match(guide.bodyText, /Mobs Off: .*Gloomhound/);
  assert.match(mobs.bodyText, /Gloomhound - Off/);
  assert.doesNotMatch(mobs.bodyText, /Fast\. Leaps/);
  assert.match(mobs.bodyText, /Thornskulk.*Health/);
});

test("a player who loses operator rights cannot save toggles or open the form", async () => {
  const before = world.getDynamicProperty("nightfall:disabled_mobs");
  // Demoted after the guide opened, before pressing Choose Mobs.
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(() => ((host.playerPermissionLevel = 1), CHOOSE_MOBS));
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  assert.equal(modalForms().length, 0);
  // Demoted while the Choose Mobs form was open.
  host.playerPermissionLevel = 2;
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push(CHOOSE_MOBS, () => ((host.playerPermissionLevel = 1), [false, false, false]));
  world.afterEvents.itemUse.emit({ source: host, itemStack: { typeId: "nightfall:night_guide" } });
  await settle();
  host.playerPermissionLevel = 2;
  assert.equal(modalForms().length, 1);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), before);
  assert.equal(dimension.spawnEntity("nightfall:thornskulk", { x: 50, y: 64, z: 50 }).isValid, true);
  await hostChoosesMobs([true, true, true]);
});

// ---------------------------------------------------------------- pick at the start

test("first-join setup never opens for a guest", async () => {
  world.setDynamicProperty("nightfall:setup_done", undefined);
  ui.__ui.forms.length = 0;
  world.afterEvents.playerSpawn.emit({ player: guest, initialSpawn: true });
  await settle();
  assert.equal(ui.__ui.forms.length, 0);
  assert.notEqual(world.getDynamicProperty("nightfall:setup_done"), true);
});

test("first-join setup opens for the host, retries after UserBusy, is marked done only once answered, then shows the guide", async () => {
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push("busy", "busy", [false, true, true]);
  host.chat.length = 0;
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  await settle();
  assert.equal(modalForms().length, 1);
  t.advance(39);
  await settle();
  assert.equal(modalForms().length, 1, "waits about 40 ticks between tries");
  t.advance(1);
  await settle();
  assert.equal(modalForms().length, 2);
  assert.notEqual(world.getDynamicProperty("nightfall:setup_done"), true, "not done while the game says the player is busy");
  t.advance(40);
  await settle();
  assert.equal(modalForms().length, 3);
  assert.equal(world.getDynamicProperty("nightfall:setup_done"), true);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), '["gloomhound"]');
  assert.equal(ui.__ui.forms.at(-1).titleText, "Nightfall Guide", "the main guide follows so difficulty can be picked");
  assert.match(host.chat.at(-1), /Nightfall Guide/);
});

test("first-join setup happens only once per world", async () => {
  ui.__ui.forms.length = 0;
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  await settle();
  t.advance(400);
  await settle();
  assert.equal(ui.__ui.forms.length, 0);
});

test("closing the setup form counts as answered; it still shows the guide and the chat hint", async () => {
  world.setDynamicProperty("nightfall:setup_done", undefined);
  ui.__ui.forms.length = 0;
  host.chat.length = 0;
  ui.__ui.answers.push("closed");
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  await settle();
  assert.equal(world.getDynamicProperty("nightfall:setup_done"), true);
  assert.deepEqual(ui.__ui.forms.map((f) => f.titleText), ["Choose Mobs", "Nightfall Guide"]);
  assert.match(host.chat.at(-1), /Nightfall Guide/);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), '["gloomhound"]', "closing changes nothing");
});

test("setup gives up quietly after about 15 retries, and asks again the next time the host joins", async () => {
  world.setDynamicProperty("nightfall:setup_done", undefined);
  ui.__ui.forms.length = 0;
  for (let i = 0; i < 40; i++) ui.__ui.answers.push("busy");
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  await settle();
  for (let i = 0; i < 30; i++) {
    t.advance(40);
    await settle();
  }
  assert.equal(modalForms().length, 16, "one try plus 15 retries");
  assert.notEqual(world.getDynamicProperty("nightfall:setup_done"), true);
  assert.equal(ui.__ui.forms.length, 16, "no guide pops up");
  ui.__ui.answers.length = 0;
  ui.__ui.forms.length = 0;
  ui.__ui.answers.push([true, true, true]);
  world.afterEvents.playerSpawn.emit({ player: host, initialSpawn: true });
  await settle();
  assert.equal(modalForms().length, 1);
  assert.equal(world.getDynamicProperty("nightfall:setup_done"), true);
  assert.equal(world.getDynamicProperty("nightfall:disabled_mobs"), "[]");
});

// ---------------------------------------------------------------- saved values

test("a saved list is loaded when the world loads and live mobs are cleaned up", () => {
  const live = dimension.spawnEntity("nightfall:thornskulk", { x: 50, y: 64, z: 50 });
  assert.equal(live.isValid, true);
  world.setDynamicProperty("nightfall:disabled_mobs", '["thornskulk","bogus"]');
  world.afterEvents.worldLoad.emit({});
  assert.equal(live.isValid, false);
  assert.equal(dimension.spawnEntity("nightfall:thornskulk", { x: 50, y: 64, z: 50 }).isValid, false);
  assert.equal(dimension.spawnEntity("nightfall:gloomhound", { x: 50, y: 64, z: 50 }).isValid, true);
});

test("a corrupt or odd saved value means every mob is on", () => {
  for (const bad of ["{not json", "", '{"gloomhound":true}', "42", "null", 7, true]) {
    world.setDynamicProperty("nightfall:disabled_mobs", bad);
    world.afterEvents.worldLoad.emit({});
    for (const typeId of ALL) {
      const entity = dimension.spawnEntity(typeId, { x: 50, y: 64, z: 50 });
      assert.equal(entity.isValid, true, `${typeId} with saved value ${JSON.stringify(bad)}`);
      entity.remove();
    }
  }
  world.setDynamicProperty("nightfall:disabled_mobs", undefined);
  world.afterEvents.worldLoad.emit({});
});

test("every form text is plain ASCII plus the section-sign colour codes", () => {
  assert.ok(ui.__ui.all.length > 20);
  const texts = ui.__ui.all.flatMap((f) => [f.titleText, f.bodyText, f.submitText, ...(f.buttons ?? []), ...(f.toggles ?? []).map((x) => x.label)]);
  for (const text of texts.filter((x) => x !== undefined)) assert.match(text, /^[\x20-\x7e\n\u00a7]*$/, text);
  for (const message of [...t.messages, ...host.chat]) assert.match(message, /^[\x20-\x7e\n\u00a7]*$/, message);
});
