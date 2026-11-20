import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DIFFICULTIES, MOBS, SPAWNS } from "../src/scripts/balance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [path.join(root, "tools", "build.mjs")], { cwd: root });
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const build = path.join(root, "build");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(build, rel), "utf8"));
const exists = (rel) => fs.existsSync(path.join(build, rel));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const allFiles = walk(build);
const lang = fs.readFileSync(path.join(build, "RP/texts/en_US.lang"), "utf8");
const itemIds = fs.readdirSync(path.join(build, "BP/items/nightfall")).map((f) => read(`BP/items/nightfall/${f}`)["minecraft:item"].description.identifier);

test("every JSON file parses", () => {
  for (const file of allFiles.filter((f) => f.endsWith(".json"))) JSON.parse(fs.readFileSync(file, "utf8"));
});

test("manifests: version and visible vX.Y.Z names come from package.json, and the packs depend on each other", () => {
  const bp = read("BP/manifest.json");
  const rp = read("RP/manifest.json");
  const version = pkg.version.split(".").map(Number);
  for (const manifest of [bp, rp]) {
    assert.deepEqual(manifest.header.version, version);
    assert.ok(manifest.header.name.endsWith(`v${pkg.version}`), manifest.header.name);
  }
  assert.ok(bp.dependencies.some((d) => d.uuid === rp.header.uuid));
  assert.ok(rp.dependencies.some((d) => d.uuid === bp.header.uuid));
  const ids = [bp.header.uuid, rp.header.uuid, ...bp.modules.map((m) => m.uuid), ...rp.modules.map((m) => m.uuid)];
  assert.equal(new Set(ids).size, ids.length, "pack ids must be unique");
  const modules = Object.fromEntries(bp.dependencies.filter((d) => d.module_name).map((d) => [d.module_name, d.version]));
  assert.deepEqual(modules, { "@minecraft/server": "2.1.0", "@minecraft/server-ui": "2.0.0" });
  for (const v of Object.values(modules)) assert.ok(!/beta|preview|rc/.test(v), "stable script APIs only");
  assert.ok(exists(bp.modules.find((m) => m.type === "script").entry.replace(/^/, "BP/")));
});

test("the .mcaddon holds both packs and is named with the version", () => {
  const file = path.join(root, "dist", `nightfall-mobs-v${pkg.version}.mcaddon`);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  for (const name of ["Nightfall Mobs BP/manifest.json", "Nightfall Mobs RP/manifest.json", "Nightfall Mobs BP/scripts/main.js"]) {
    assert.ok(bytes.includes(Buffer.from(name)), name);
  }
});

test("each mob: stats match the balance table, and every event and group it uses exists", () => {
  for (const [key, mob] of Object.entries(MOBS)) {
    const entity = read(`BP/entities/nightfall/${key}.json`)["minecraft:entity"];
    assert.equal(entity.description.identifier, `nightfall:${key}`);
    for (const d of DIFFICULTIES) {
      const group = entity.component_groups[`nightfall:diff_${d}`];
      assert.deepEqual(group["minecraft:health"], { value: mob.health[d], max: mob.health[d] });
      assert.equal(group["minecraft:attack"].damage, mob.damage[d]);
      assert.ok(entity.events[`nightfall:set_${d}`]);
    }
    const text = JSON.stringify(entity);
    const groupNames = new Set(Object.keys(entity.component_groups));
    for (const event of Object.values(entity.events)) {
      for (const step of event.sequence ?? [event]) {
        for (const g of [...(step.add?.component_groups ?? []), ...(step.remove?.component_groups ?? [])]) assert.ok(groupNames.has(g), `${key}: unknown group ${g}`);
      }
    }
    for (const match of text.matchAll(/"event":"(nightfall:[a-z_]+)"/g)) assert.ok(entity.events[match[1]], `${key}: unknown event ${match[1]}`);
    // Exactly one movement speed is active at a time: either always-on, or only inside state groups.
    const base = "minecraft:movement" in entity.components;
    const inGroups = Object.values(entity.component_groups).some((g) => "minecraft:movement" in g);
    assert.ok(base !== inGroups, `${key}: movement must be defined in exactly one place`);
    const nav = entity.components["minecraft:navigation.walk"];
    assert.equal(nav.can_break_doors, false);
    assert.equal(nav.can_open_doors, false);
    assert.equal("minecraft:burns_in_daylight" in entity.components, Boolean(mob.burns));
  }
});

test("each mob has a model, texture, name, spawn egg name and sounds", () => {
  const sounds = read("RP/sounds.json").entity_sounds.entities;
  for (const key of Object.keys(MOBS)) {
    const client = read(`RP/entity/nightfall/${key}.entity.json`)["minecraft:client_entity"].description;
    assert.equal(client.identifier, `nightfall:${key}`);
    assert.ok(exists(`RP/${client.textures.default}.png`), client.textures.default);
    const geoFile = allFiles.filter((f) => f.endsWith(".geo.json")).find((f) => fs.readFileSync(f, "utf8").includes(`"${client.geometry.default}"`));
    assert.ok(geoFile, client.geometry.default);
    const bones = JSON.parse(fs.readFileSync(geoFile, "utf8"))["minecraft:geometry"][0].bones.map((b) => b.name);
    assert.ok(bones.includes("head"));
    assert.deepEqual(client.scripts.animate, Object.keys(client.animations));
    assert.ok(lang.includes(`entity.nightfall:${key}.name=`));
    assert.ok(lang.includes(`item.spawn_egg.entity.nightfall:${key}.name=`));
    assert.ok(sounds[`nightfall:${key}`]);
  }
  const custom = read("RP/animations/nightfall.animation.json").animations;
  for (const file of fs.readdirSync(path.join(build, "RP/entity/nightfall"))) {
    const client = read(`RP/entity/nightfall/${file}`)["minecraft:client_entity"].description;
    for (const animation of Object.values(client.animations)) {
      if (animation.includes("nightfall")) assert.ok(custom[animation], animation);
    }
  }
});

test("model cubes stay inside their texture and never share pixels", () => {
  for (const file of allFiles.filter((f) => f.endsWith(".geo.json"))) {
    const geo = JSON.parse(fs.readFileSync(file, "utf8"))["minecraft:geometry"][0];
    const rects = [];
    for (const bone of geo.bones) {
      for (const cube of bone.cubes) {
        const [w, h, d] = cube.size;
        const rect = { x: cube.uv[0], y: cube.uv[1], w: 2 * (w + d), h: h + d };
        assert.ok(rect.x + rect.w <= geo.description.texture_width && rect.y + rect.h <= geo.description.texture_height, file);
        for (const other of rects) {
          const apart = rect.x + rect.w <= other.x || other.x + other.w <= rect.x || rect.y + rect.h <= other.y || other.y + other.h <= rect.y;
          assert.ok(apart, `${file}: overlapping cubes in ${bone.name}`);
        }
        rects.push(rect);
      }
    }
  }
});

test("items: icon, name and texture all line up", () => {
  const atlas = read("RP/textures/item_texture.json").texture_data;
  for (const itemId of itemIds) {
    const key = itemId.split(":")[1];
    const item = read(`BP/items/nightfall/${key}.json`)["minecraft:item"];
    const icon = item.components["minecraft:icon"];
    assert.ok(atlas[icon], icon);
    assert.ok(exists(`RP/${atlas[icon].textures}.png`));
    assert.ok(lang.includes(`${item.components["minecraft:display_name"].value}=`));
  }
  assert.ok(exists("RP/textures/models/armor/nightfall_shadow_hood.png"));
  assert.equal(read("RP/attachables/nightfall/shadow_hood.json")["minecraft:attachable"].description.identifier, "nightfall:shadow_hood");
});

test("loot tables and recipes only use items that exist", () => {
  const known = (name) => name.startsWith("minecraft:") || itemIds.includes(name);
  for (const file of allFiles.filter((f) => f.includes("loot_tables"))) {
    for (const pool of JSON.parse(fs.readFileSync(file, "utf8")).pools) for (const entry of pool.entries) assert.ok(known(entry.name), entry.name);
  }
  for (const file of fs.readdirSync(path.join(build, "BP/recipes/nightfall"))) {
    const recipe = Object.values(read(`BP/recipes/nightfall/${file}`)).find((v) => typeof v === "object");
    assert.ok(itemIds.includes(recipe.result.item));
    for (const ingredient of [...Object.values(recipe.key ?? {}), ...(recipe.ingredients ?? [])]) {
      if (ingredient.item) assert.ok(known(ingredient.item), ingredient.item);
    }
  }
  for (const key of Object.keys(MOBS)) {
    const table = read(`BP/entities/nightfall/${key}.json`)["minecraft:entity"].components["minecraft:loot"]?.table;
    if (table) assert.ok(exists(`BP/${table}`), table);
    else assert.ok(MOBS[key].hordeMember, `${key} should have loot`);
  }
});

test("only the three solo mobs spawn naturally; horde members never do", () => {
  const rules = fs.readdirSync(path.join(build, "BP/spawn_rules/nightfall")).map((f) => f.replace(".json", ""));
  assert.deepEqual(rules.sort(), Object.keys(SPAWNS).sort());
  for (const key of rules) {
    const rule = read(`BP/spawn_rules/nightfall/${key}.json`)["minecraft:spawn_rules"];
    assert.equal(rule.description.identifier, `nightfall:${key}`);
    const condition = rule.conditions[0];
    assert.equal(condition["minecraft:brightness_filter"].max, 7);
    assert.ok("minecraft:spawns_on_surface" in condition && !("minecraft:spawns_underground" in condition));
  }
});

test("the pack never touches player.json or any vanilla file (safe next to Hearts & Lives)", () => {
  for (const file of allFiles) {
    const rel = path.relative(build, file).replaceAll("\\", "/");
    assert.ok(!/player\.json$/.test(rel), rel);
    if (/\/(entities|entity|items|recipes|loot_tables|spawn_rules|attachables)\//.test(rel)) assert.ok(rel.includes("/nightfall/"), rel);
  }
  for (const file of allFiles.filter((f) => /BP[\\/](entities|items|recipes|spawn_rules)/.test(f))) {
    assert.ok(!fs.readFileSync(file, "utf8").includes('"identifier": "minecraft:'), file);
  }
});
