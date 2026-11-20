// Builds the Behaviour Pack, the Resource Pack, docs/BALANCE.md and the versioned .mcaddon.
// Usage: node tools/build.mjs   (no dependencies needed)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  GEAR,
  GRASPER,
  HORDE,
  LIGHT,
  LOOT,
  MOBS,
  NAMESPACE as NS,
  SPAWNS,
  VANILLA,
  hordeSize,
} from "../src/scripts/balance.js";
import { hordeXp, maxLootBudget } from "../src/scripts/horde.js";
import { buildHoodArmourTexture, buildModels } from "./models.mjs";
import { buildIcons, buildPackIcon } from "./icons.mjs";
import { makeZip } from "./lib/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const uuids = JSON.parse(fs.readFileSync(path.join(root, "tools", "uuids.json"), "utf8"));
const version = pkg.version.split(".").map(Number);
const versionTag = `v${pkg.version}`;
const MIN_ENGINE = [1, 21, 100];
const ENTITY_FORMAT = "1.21.90";

const files = new Map(); // "BP/..." or "RP/..." -> Buffer
const put = (name, data) => files.set(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
const putJson = (name, value) => put(name, JSON.stringify(value, null, 2) + "\n");
const id = (key) => `${NS}:${key}`;

// ================================================================ behaviour pack: entities

const DIFF_GROUP = (d) => id(`diff_${d}`);

function difficultyParts(mob) {
  const groups = {};
  const events = {};
  for (const d of DIFFICULTIES) {
    groups[DIFF_GROUP(d)] = {
      "minecraft:health": { value: mob.health[d], max: mob.health[d] },
      "minecraft:attack": { damage: mob.damage[d] },
    };
    events[id(`set_${d}`)] = {
      remove: { component_groups: DIFFICULTIES.filter((x) => x !== d).map(DIFF_GROUP) },
      add: { component_groups: [DIFF_GROUP(d)] },
    };
  }
  return { groups, events };
}

const playerFilter = { test: "is_family", subject: "other", value: "player" };

function commonComponents(key, mob) {
  const components = {
    "minecraft:type_family": { family: mob.families },
    "minecraft:collision_box": mob.collision,
    "minecraft:scale": { value: mob.scale },
    "minecraft:physics": {},
    "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
    "minecraft:breathable": { total_supply: 15, suffocate_time: 0 },
    "minecraft:nameable": {},
    "minecraft:jump.static": {},
    "minecraft:movement.basic": {},
    // These mobs walk through open doorways but never open or break doors, and never break blocks.
    "minecraft:navigation.walk": { can_path_over_water: true, can_pass_doors: true, can_open_doors: false, can_break_doors: false },
    "minecraft:can_climb": {},
    "minecraft:despawn": { despawn_from_distance: {} },
    "minecraft:conditional_bandwidth_optimization": {},
    "minecraft:hurt_on_condition": {
      damage_conditions: [{ filters: { test: "in_lava", subject: "self", operator: "==", value: true }, cause: "lava", damage_per_tick: 4 }],
    },
    "minecraft:follow_range": { value: mob.detectRange, max: mob.detectRange },
    "minecraft:knockback_resistance": { value: mob.knockbackResistance },
    "minecraft:experience_reward": { on_death: `query.last_hit_by_player ? ${mob.xp} : 0` },
    "minecraft:behavior.float": { priority: 0 },
    "minecraft:behavior.hurt_by_target": { priority: 1 },
    "minecraft:behavior.nearest_attackable_target": {
      priority: 2,
      reselect_targets: true,
      must_see: !mob.hordeMember,
      must_see_forget_duration: 17,
      within_radius: mob.detectRange,
      entity_types: [{ filters: playerFilter, max_dist: mob.detectRange }],
    },
    "minecraft:behavior.melee_box_attack": { priority: 4 },
    "minecraft:behavior.random_look_around": { priority: 9 },
  };
  if (mob.burns) components["minecraft:burns_in_daylight"] = {};
  if (LOOT[key]) components["minecraft:loot"] = { table: `loot_tables/entities/${NS}/${key}.json` };
  return components;
}

const stroll = {
  "minecraft:behavior.random_stroll": { priority: 7, speed_multiplier: 1 },
  "minecraft:behavior.look_at_player": { priority: 8, look_distance: 8 },
};

const brightness = (operator, value) => ({ test: "is_brightness", operator, value });
const swap = (remove, add) => ({ remove: { component_groups: remove.map(id) }, add: { component_groups: add.map(id) } });

function entityFile(key, mob, { components = {}, groups = {}, events = {}, initialGroups = [] }) {
  const diff = difficultyParts(mob);
  return {
    format_version: ENTITY_FORMAT,
    "minecraft:entity": {
      description: { identifier: id(key), is_spawnable: true, is_summonable: true, is_experimental: false },
      component_groups: { ...diff.groups, ...groups },
      components: { ...commonComponents(key, mob), ...components },
      events: {
        "minecraft:entity_spawned": { add: { component_groups: [DIFF_GROUP("normal"), ...initialGroups.map(id)] } },
        ...diff.events,
        ...events,
      },
    },
  };
}

function buildEntities() {
  // Gloomhound: fast and leaping in the dark, slow and grounded in the light.
  const hound = MOBS.gloomhound;
  putJson(
    `BP/entities/${NS}/gloomhound.json`,
    entityFile("gloomhound", hound, {
      components: stroll,
      initialGroups: ["prowling"],
      groups: {
        [id("prowling")]: {
          "minecraft:movement": { value: hound.speed },
          "minecraft:behavior.leap_at_target": { priority: 3, yd: 0.4, must_be_on_ground: true },
          "minecraft:environment_sensor": { triggers: [{ filters: brightness(">", LIGHT.enterLight), event: id("enter_light") }] },
        },
        [id("wary")]: {
          "minecraft:movement": { value: hound.lightSpeed },
          "minecraft:environment_sensor": { triggers: [{ filters: brightness("<", LIGHT.enterDark), event: id("enter_dark") }] },
        },
      },
      events: {
        [id("enter_light")]: swap(["prowling"], ["wary"]),
        [id("enter_dark")]: swap(["wary"], ["prowling"]),
      },
    })
  );

  // Thornskulk: stands still, bursts at close prey (only in the dark), then tires.
  const skulk = MOBS.thornskulk;
  const hasTarget = { test: "has_target", subject: "self", operator: "==", value: true };
  const canBurst = { all_of: [hasTarget, brightness("<", LIGHT.enterLight)] };
  putJson(
    `BP/entities/${NS}/thornskulk.json`,
    entityFile("thornskulk", skulk, {
      initialGroups: ["lurking"],
      groups: {
        [id("lurking")]: {
          "minecraft:movement": { value: skulk.speed },
          "minecraft:on_target_acquired": { event: id("spot_prey"), target: "self" },
          // Already hunting when it stepped out of the light: it can burst again once it is dark.
          "minecraft:environment_sensor": { triggers: [{ filters: canBurst, event: id("spot_prey") }] },
        },
        [id("bursting")]: {
          "minecraft:movement": { value: skulk.burstSpeed },
          "minecraft:timer": { looping: false, time: skulk.burstSeconds, time_down_event: { event: id("tire"), target: "self" } },
        },
        [id("tired")]: {
          "minecraft:movement": { value: skulk.tiredSpeed },
          "minecraft:timer": { looping: false, time: skulk.tiredSeconds, time_down_event: { event: id("recover"), target: "self" } },
        },
      },
      events: {
        [id("spot_prey")]: {
          sequence: [
            { filters: brightness("<", LIGHT.enterLight), ...swap(["lurking"], ["bursting"]) },
            { filters: brightness(">=", LIGHT.enterLight), ...swap(["lurking"], ["tired"]) },
          ],
        },
        [id("tire")]: swap(["bursting"], ["tired"]),
        [id("recover")]: {
          sequence: [
            { filters: canBurst, ...swap(["tired"], ["bursting"]) },
            { filters: { none_of: [canBurst] }, ...swap(["tired"], ["lurking"]) },
          ],
        },
      },
    })
  );

  // Horde Stalker: on first sight of a player it screams for a few seconds, then calls ONE horde.
  const stalker = MOBS.horde_stalker;
  putJson(
    `BP/entities/${NS}/horde_stalker.json`,
    entityFile("horde_stalker", stalker, {
      components: stroll,
      initialGroups: ["hunting"],
      groups: {
        [id("hunting")]: {
          "minecraft:movement": { value: stalker.speed },
          "minecraft:on_target_acquired": { event: id("begin_scream"), target: "self" },
        },
        [id("screaming")]: {
          "minecraft:movement": { value: 0.05 },
          "minecraft:timer": { looping: false, time: stalker.screamSeconds, time_down_event: { event: id("call_horde"), target: "self" } },
        },
        [id("spent")]: { "minecraft:movement": { value: stalker.speed } },
      },
      events: {
        [id("begin_scream")]: swap(["hunting"], ["screaming"]),
        [id("call_horde")]: swap(["screaming"], ["spent"]),
      },
    })
  );

  for (const [key, mob] of Object.entries(MOBS)) {
    if (!mob.hordeMember) continue;
    putJson(
      `BP/entities/${NS}/${key}.json`,
      entityFile(key, mob, { components: { ...stroll, "minecraft:movement": { value: mob.speed } } })
    );
  }
}

// ================================================================ behaviour pack: spawning, loot, items, recipes

function buildSpawnRules() {
  for (const [key, spawn] of Object.entries(SPAWNS)) {
    const tags = spawn.biomeTags.map((value) => ({ test: "has_biome_tag", operator: "==", value }));
    putJson(`BP/spawn_rules/${NS}/${key}.json`, {
      format_version: "1.8.0",
      "minecraft:spawn_rules": {
        description: { identifier: id(key), population_control: "monster" },
        conditions: [
          {
            "minecraft:spawns_on_surface": {},
            "minecraft:brightness_filter": { min: 0, max: 7, adjust_for_weather: true },
            "minecraft:difficulty_filter": { min: "easy", max: "hard" },
            "minecraft:weight": { default: spawn.weight },
            "minecraft:herd": { min_size: spawn.herd[0], max_size: spawn.herd[1] },
            "minecraft:density_limit": { surface: spawn.densitySurface },
            "minecraft:biome_filter": tags.length === 1 ? tags[0] : { any_of: tags },
          },
        ],
      },
    });
  }
}

function lootTable(common, rares) {
  return {
    pools: [
      {
        rolls: 1,
        entries: [
          {
            type: "item",
            name: common.item,
            weight: 1,
            functions: [
              { function: "set_count", count: { min: common.count[0], max: common.count[1] } },
              { function: "looting_enchant", count: { min: 0, max: 1 } },
            ],
          },
        ],
      },
      ...rares.map((rare) => ({
        conditions: [
          { condition: "killed_by_player" },
          { condition: "random_chance_with_looting", chance: rare.chance, looting_multiplier: 0.05 },
        ],
        rolls: 1,
        entries: [{ type: "item", name: rare.item, weight: 1 }],
      })),
    ],
  };
}

function buildLoot() {
  const dir = `BP/loot_tables/entities/${NS}`;
  putJson(
    `${dir}/gloomhound.json`,
    lootTable({ item: "minecraft:string", count: LOOT.gloomhound.string }, [
      { item: id("gloom_fang"), chance: LOOT.gloomhound.gloomFangChance },
      { item: id("shadow_hide"), chance: LOOT.gloomhound.shadowHideChance },
    ])
  );
  putJson(
    `${dir}/thornskulk.json`,
    lootTable({ item: "minecraft:stick", count: LOOT.thornskulk.stick }, [
      { item: id("thorn_core"), chance: LOOT.thornskulk.thornCoreChance },
      { item: id("bark_hide"), chance: LOOT.thornskulk.barkHideChance },
    ])
  );
  putJson(
    `${dir}/horde_stalker.json`,
    lootTable({ item: "minecraft:rotten_flesh", count: LOOT.horde_stalker.rottenFlesh }, [
      { item: id("horde_claw"), chance: LOOT.horde_stalker.hordeClawChance },
      { item: id("tattered_cloth"), chance: LOOT.horde_stalker.tatteredClothChance },
    ])
  );
}

const ITEMS = {
  gloom_fang: { name: "Gloom Fang", category: "items", stack: 64 },
  shadow_hide: { name: "Shadow Hide", category: "items", stack: 64 },
  thorn_core: { name: "Thorn Core", category: "items", stack: 64 },
  bark_hide: { name: "Bark Hide", category: "items", stack: 64 },
  horde_claw: { name: "Horde Claw", category: "items", stack: 64 },
  tattered_cloth: { name: "Tattered Cloth", category: "items", stack: 64 },
  night_guide: { name: "Nightfall Guide", category: "items", stack: 1, extra: { "minecraft:interact_button": true } },
  bramble_charm: { name: "Bramble Charm", category: "equipment", stack: 1, extra: { "minecraft:allow_off_hand": true } },
  shadow_hood: {
    name: "Shadow Hood",
    category: "equipment",
    stack: 1,
    extra: {
      "minecraft:wearable": { slot: "slot.armor.head", protection: GEAR.shadowHood.protection },
      "minecraft:durability": { max_durability: GEAR.shadowHood.durability },
    },
  },
};

function buildItems() {
  for (const [key, item] of Object.entries(ITEMS)) {
    putJson(`BP/items/${NS}/${key}.json`, {
      format_version: "1.21.60",
      "minecraft:item": {
        description: { identifier: id(key), menu_category: { category: item.category } },
        components: {
          "minecraft:icon": `${NS}_${key}`,
          "minecraft:max_stack_size": item.stack,
          "minecraft:display_name": { value: `item.${NS}:${key}` },
          ...(item.extra ?? {}),
        },
      },
    });
  }
}

function buildRecipes() {
  const unlock = { context: "AlwaysUnlocked" };
  // The guide is handed out on first join. If it gets thrown away it is cheap to make again.
  putJson(`BP/recipes/${NS}/night_guide.json`, {
    format_version: "1.20.10",
    "minecraft:recipe_shapeless": {
      description: { identifier: id("night_guide") },
      tags: ["crafting_table"],
      ingredients: [{ tag: "minecraft:planks" }, { item: "minecraft:stick" }],
      unlock,
      result: { item: id("night_guide") },
    },
  });
  putJson(`BP/recipes/${NS}/shadow_hood.json`, {
    format_version: "1.20.10",
    "minecraft:recipe_shaped": {
      description: { identifier: id("shadow_hood") },
      tags: ["crafting_table"],
      pattern: ["H H", "F F", " S "],
      key: { H: { item: id("shadow_hide") }, F: { item: id("gloom_fang") }, S: { item: "minecraft:string" } },
      unlock,
      result: { item: id("shadow_hood") },
    },
  });
  putJson(`BP/recipes/${NS}/bramble_charm.json`, {
    format_version: "1.20.10",
    "minecraft:recipe_shaped": {
      description: { identifier: id("bramble_charm") },
      tags: ["crafting_table"],
      pattern: [" S ", "BCB"],
      key: { S: { item: "minecraft:string" }, B: { item: id("bark_hide") }, C: { item: id("thorn_core") } },
      unlock,
      result: { item: id("bramble_charm") },
    },
  });
}

// ================================================================ resource pack

const CLIENT = {
  gloomhound: { animations: { walk: "animation.quadruped.walk", look_at_target: "animation.common.look_at_target" }, egg: ["#3a3344", "#ffc83d"] },
  thornskulk: {
    animations: { walk: "animation.nightfall.biped.walk", arms: "animation.nightfall.thornskulk.arms", look_at_target: "animation.common.look_at_target" },
    egg: ["#5b4130", "#5d8f2a"],
  },
  horde_stalker: { zombie: true, egg: ["#cfc8b8", "#ffb020"] },
  horde_shambler: { zombie: true, egg: ["#6a9a4a", "#5b4a6e"] },
  horde_skitter: { zombie: true, egg: ["#a3b592", "#4c4c4c"] },
  horde_grasper: { zombie: true, egg: ["#4f7a55", "#c8d6b0"] },
  horde_brute: { zombie: true, egg: ["#5f7f3f", "#6b2f2a"] },
};
const ZOMBIE_ANIMATIONS = {
  walk: "animation.nightfall.biped.walk",
  arms: "animation.nightfall.zombie.arms",
  look_at_target: "animation.common.look_at_target",
};

const SOUNDS = {
  gloomhound: { pitch: [0.6, 0.8], ambient: "mob.wolf.growl", hurt: "mob.wolf.hurt", death: "mob.wolf.death", step: "mob.wolf.step" },
  thornskulk: { pitch: [1.1, 1.3], ambient: "mob.ravager.ambient", hurt: "mob.ravager.hurt", death: "mob.ravager.death", step: "mob.ravager.step" },
  horde_stalker: { pitch: [0.6, 0.75], ambient: "mob.zombie.say", hurt: "mob.zombie.hurt", death: "mob.zombie.death", step: "mob.zombie.step" },
  horde_shambler: { pitch: [0.8, 1.2], ambient: "mob.zombie.say", hurt: "mob.zombie.hurt", death: "mob.zombie.death", step: "mob.zombie.step" },
  horde_skitter: { pitch: [1.4, 1.7], ambient: "mob.zombie.say", hurt: "mob.zombie.hurt", death: "mob.zombie.death", step: "mob.zombie.step" },
  horde_grasper: { pitch: [1.0, 1.2], ambient: "mob.husk.ambient", hurt: "mob.zombie.hurt", death: "mob.zombie.death", step: "mob.zombie.step" },
  horde_brute: { pitch: [0.5, 0.65], ambient: "mob.zombie.say", hurt: "mob.zombie.hurt", death: "mob.zombie.death", step: "mob.zombie.step" },
};

function buildResourcePack() {
  const models = buildModels();
  for (const [geometryId, geometry] of Object.entries(models.geometries)) {
    putJson(`RP/models/entity/${NS}/${geometryId}.geo.json`, geometry);
  }
  for (const [key, canvas] of Object.entries(models.textures)) put(`RP/textures/entity/${NS}/${key}.png`, canvas.png());

  for (const [key, client] of Object.entries(CLIENT)) {
    const animations = client.zombie ? ZOMBIE_ANIMATIONS : client.animations;
    putJson(`RP/entity/${NS}/${key}.entity.json`, {
      format_version: "1.10.0",
      "minecraft:client_entity": {
        description: {
          identifier: id(key),
          materials: { default: "entity_alphatest" },
          textures: { default: `textures/entity/${NS}/${key}` },
          geometry: { default: `geometry.nightfall.${models.definitions[key].geometryId}` },
          animations,
          scripts: { animate: Object.keys(animations) },
          render_controllers: ["controller.render.nightfall"],
          spawn_egg: { base_color: client.egg[0], overlay_color: client.egg[1] },
        },
      },
    });
  }

  putJson(`RP/render_controllers/${NS}.render_controllers.json`, {
    format_version: "1.8.0",
    render_controllers: {
      "controller.render.nightfall": {
        geometry: "Geometry.default",
        materials: [{ "*": "Material.default" }],
        textures: ["Texture.default"],
      },
    },
  });

  const swing = (sign, degrees) => [`math.cos(query.anim_time * 38.17) * ${sign * degrees}`, 0, 0];
  putJson(`RP/animations/${NS}.animation.json`, {
    format_version: "1.8.0",
    animations: {
      "animation.nightfall.biped.walk": {
        loop: true,
        anim_time_update: "query.modified_distance_moved",
        bones: { leftleg: { rotation: swing(1, 40) }, rightleg: { rotation: swing(-1, 40) } },
      },
      "animation.nightfall.zombie.arms": {
        loop: true,
        bones: {
          leftarm: { rotation: ["-85.0 + math.sin(query.life_time * 90.0) * 4.0", 0, 0] },
          rightarm: { rotation: ["-85.0 - math.sin(query.life_time * 90.0) * 4.0", 0, 0] },
        },
      },
      "animation.nightfall.thornskulk.arms": {
        loop: true,
        anim_time_update: "query.modified_distance_moved",
        bones: { leftarm: { rotation: swing(-1, 30) }, rightarm: { rotation: swing(1, 30) } },
      },
    },
  });

  const entitySounds = {};
  for (const [key, s] of Object.entries(SOUNDS)) {
    entitySounds[id(key)] = {
      volume: 1,
      pitch: s.pitch,
      events: { ambient: s.ambient, hurt: s.hurt, death: s.death, step: { sound: s.step, volume: 0.45, pitch: 1 } },
    };
  }
  putJson("RP/sounds.json", { entity_sounds: { entities: entitySounds } });

  const icons = buildIcons();
  const textureData = {};
  for (const [key, canvas] of Object.entries(icons)) {
    put(`RP/textures/items/${NS}/${key}.png`, canvas.png());
    textureData[`${NS}_${key}`] = { textures: `textures/items/${NS}/${key}` };
  }
  putJson("RP/textures/item_texture.json", { resource_pack_name: NS, texture_name: "atlas.items", texture_data: textureData });

  put(`RP/textures/models/armor/${NS}_shadow_hood.png`, buildHoodArmourTexture().png());
  putJson(`RP/attachables/${NS}/shadow_hood.json`, {
    format_version: "1.8.0",
    "minecraft:attachable": {
      description: {
        identifier: id("shadow_hood"),
        materials: { default: "armor", enchanted: "armor_enchanted" },
        textures: { default: `textures/models/armor/${NS}_shadow_hood`, enchanted: "textures/misc/enchanted_actor_glint" },
        geometry: { default: "geometry.humanoid.armor.helmet" },
        scripts: { parent_setup: "variable.helmet_layer_visible = 0.0;" },
        render_controllers: ["controller.render.armor"],
      },
    },
  });

  const lang = [`pack.name=Nightfall Mobs RP ${versionTag}`, "pack.description=Gloomhound, Thornskulk and the Horde Stalker."];
  for (const [key, mob] of Object.entries(MOBS)) {
    lang.push(`entity.${NS}:${key}.name=${mob.name}`);
    lang.push(`item.spawn_egg.entity.${NS}:${key}.name=${mob.name} Spawn Egg`);
  }
  for (const [key, item] of Object.entries(ITEMS)) lang.push(`item.${NS}:${key}=${item.name}`);
  put("RP/texts/en_US.lang", lang.join("\n") + "\n");
  putJson("RP/texts/languages.json", ["en_US"]);
}

// ================================================================ manifests, scripts, docs, package

function buildManifests() {
  const description = "Gloomhound, Thornskulk and the Horde Stalker. Use the Nightfall Guide to set the difficulty.";
  putJson("BP/manifest.json", {
    format_version: 2,
    header: { name: `Nightfall Mobs BP ${versionTag}`, description, uuid: uuids.bpHeader, version, min_engine_version: MIN_ENGINE },
    modules: [
      { type: "data", uuid: uuids.bpData, version },
      { type: "script", language: "javascript", uuid: uuids.bpScript, version, entry: "scripts/main.js" },
    ],
    dependencies: [
      { uuid: uuids.rpHeader, version },
      { module_name: "@minecraft/server", version: "2.1.0" },
      { module_name: "@minecraft/server-ui", version: "2.0.0" },
    ],
  });
  putJson("RP/manifest.json", {
    format_version: 2,
    header: { name: `Nightfall Mobs RP ${versionTag}`, description, uuid: uuids.rpHeader, version, min_engine_version: MIN_ENGINE },
    modules: [{ type: "resources", uuid: uuids.rpResources, version }],
    dependencies: [{ uuid: uuids.bpHeader, version }],
  });
  const icon = buildPackIcon().png();
  put("BP/pack_icon.png", icon);
  put("RP/pack_icon.png", icon);
  const scriptDir = path.join(root, "src", "scripts");
  for (const name of fs.readdirSync(scriptDir)) put(`BP/scripts/${name}`, fs.readFileSync(path.join(scriptDir, name)));
}

// Vanilla world difficulty changes every mob's melee hit. These are the vanilla rules.
export const worldDifficultyDamage = {
  easy: (d) => Math.min(d, Math.floor(d / 2) + 1),
  normal: (d) => d,
  hard: (d) => Math.floor(d * 1.5),
};

function buildBalanceDoc() {
  const hits = (health, sword) => Math.ceil(health / sword);
  const row = (cells) => `| ${cells.join(" | ")} |`;
  const out = [];
  out.push("# Nightfall Mobs - the maths");
  out.push("");
  out.push("> This file is generated by `npm run build` from `src/scripts/balance.js`. Change numbers there, not here.");
  out.push("");
  out.push("## The target");
  out.push("");
  out.push("\"A little bit harder than the standard mobs, but not super hard.\" On **Normal** every new mob sits between a");
  out.push(`zombie (${VANILLA.zombie.health} health, ${VANILLA.zombie.damage} per hit) and an Enderman (${VANILLA.enderman.health} health, ${VANILLA.enderman.damage} per hit), and each one has a clear weakness.`);
  out.push("A player has 20 health (10 hearts). All numbers are health points: 2 points = 1 heart.");
  out.push("");
  out.push("The posters gave damage as a range (for example Gloomhound 4-6). Each range became the difficulty ladder:");
  out.push("the poster's health is the Normal health, and the top of its damage range is the Extreme hit.");
  out.push("");
  out.push("## Single mobs");
  out.push("");
  out.push(row(["Mob", "Difficulty", "Health", "Hit", "Stone sword hits", "Iron sword hits", "Diamond sword hits", "Hits to kill you (no armour)", "Hits to kill you (iron armour)"]));
  out.push(row(Array(9).fill("---")));
  for (const key of ["gloomhound", "thornskulk", "horde_stalker"]) {
    const mob = MOBS[key];
    for (const d of DIFFICULTIES) {
      out.push(
        row([
          mob.name,
          DIFFICULTY_LABELS[d],
          mob.health[d],
          mob.damage[d],
          hits(mob.health[d], VANILLA.swords.stone),
          hits(mob.health[d], VANILLA.swords.iron),
          hits(mob.health[d], VANILLA.swords.diamond),
          Math.ceil(VANILLA.playerHealth / mob.damage[d]),
          Math.ceil(VANILLA.playerHealth / (mob.damage[d] * (1 - VANILLA.ironArmourReduction))),
        ])
      );
    }
  }
  out.push("");
  out.push(`For comparison a vanilla zombie takes ${hits(VANILLA.zombie.health, VANILLA.swords.iron)} iron sword hits and needs ${Math.ceil(VANILLA.playerHealth / VANILLA.zombie.damage)} hits to kill an unarmoured player; an Enderman takes ${hits(VANILLA.enderman.health, VANILLA.swords.iron)} and needs ${Math.ceil(VANILLA.playerHealth / VANILLA.enderman.damage)}.`);
  out.push("");
  out.push("Speed (zombie 0.23, spider 0.30, baby zombie 0.35 - a sprinting player outruns all of these):");
  out.push("");
  out.push(`- Gloomhound ${MOBS.gloomhound.speed} in the dark with a leap, ${MOBS.gloomhound.lightSpeed} and no leap in the light (about light level 10+, roughly 4 blocks from a torch).`);
  out.push(`- Thornskulk stands still until you are within ${MOBS.thornskulk.detectRange} blocks, bursts at ${MOBS.thornskulk.burstSpeed} for ${MOBS.thornskulk.burstSeconds} seconds, then is tired at ${MOBS.thornskulk.tiredSpeed} for ${MOBS.thornskulk.tiredSeconds} seconds. It cannot burst in the light.`);
  out.push(`- Horde Stalker ${MOBS.horde_stalker.speed}. It sees players from ${MOBS.horde_stalker.detectRange} blocks, screams for ${MOBS.horde_stalker.screamSeconds} seconds (it barely moves while screaming), then calls one horde. Kill it during the scream and no horde comes.`);
  out.push("");
  out.push("## The horde");
  out.push("");
  out.push(row(["Type", "Job", ...DIFFICULTIES.map((d) => `${DIFFICULTY_LABELS[d]} health / hit`), "Speed", "XP"]));
  out.push(row(Array(8).fill("---")));
  const jobs = {
    horde_shambler: "The crowd",
    horde_skitter: "Small and quick, arrives first",
    horde_grasper: "Slows you for a moment",
    horde_brute: "Big, slow, hard to knock back",
  };
  for (const [key, job] of Object.entries(jobs)) {
    const mob = MOBS[key];
    out.push(row([mob.name, job, ...DIFFICULTIES.map((d) => `${mob.health[d]} / ${mob.damage[d]}`), mob.speed, mob.xp]));
  }
  out.push("");
  out.push(row(["Difficulty", "Horde size", "Shamblers", "Skitters", "Graspers", "Brutes", "Total health", "Iron sword hits to clear", "Worst case damage per second (no armour)", "Total XP", "Most loot items"]));
  out.push(row(Array(11).fill("---")));
  for (const d of DIFFICULTIES) {
    const comp = HORDE.composition[d];
    let totalHealth = 0;
    let swordHits = 0;
    let maxHit = 0;
    for (const [key, count] of Object.entries(comp)) {
      totalHealth += MOBS[key].health[d] * count;
      swordHits += hits(MOBS[key].health[d], VANILLA.swords.iron) * count;
      if (count > 0) maxHit = Math.max(maxHit, MOBS[key].damage[d]);
    }
    out.push(
      row([
        DIFFICULTY_LABELS[d],
        hordeSize(d),
        comp.horde_shambler,
        comp.horde_skitter,
        comp.horde_grasper,
        comp.horde_brute,
        totalHealth,
        swordHits,
        maxHit * VANILLA.maxHitsPerSecondOnPlayer,
        hordeXp(d),
        maxLootBudget(d),
      ])
    );
  }
  out.push("");
  out.push("Why a crowd of 20-30 is survivable: Minecraft only lets a player be hurt once every half second, however many");
  out.push("mobs are swinging. So the worst the whole horde can do is two of its hardest hits per second - the");
  out.push("\"worst case damage per second\" column. A careless player standing still in the middle loses all 20 health in about");
  out.push(`${Math.round(VANILLA.playerHealth / (MOBS.horde_brute.damage.normal * 2))} seconds on Normal with no armour (about ${Math.round(VANILLA.playerHealth / (MOBS.horde_brute.damage.normal * 2 * (1 - VANILLA.ironArmourReduction)))} seconds in iron armour), which is frightening but leaves time to back away.`);
  out.push("A door, a two-block wall or a pillar stops the horde completely: it cannot open or break doors and cannot break blocks.");
  out.push("");
  out.push(`- The horde arrives in ${HORDE.waveSeconds.length} groups, ${HORDE.waveSeconds.join(", ")} seconds after the call, ${HORDE.ringMin}-${HORDE.ringMax} blocks from the hunted player and never within ${HORDE.minPlayerDistance} blocks of any player.`);
  out.push(`- Grasper slow: Slowness I for ${DIFFICULTIES.map((d) => `${GRASPER.slowSeconds[d]}s (${DIFFICULTY_LABELS[d]})`).join(", ")}, at most once every ${GRASPER.cooldownSeconds} seconds per player.`);
  out.push(`- One Stalker calls one horde, once. No call happens if more than ${HORDE.maxMembersNearbyToCall} horde mobs are already within ${HORDE.areaRadius} blocks, and there are never more than ${HORDE.maxLiveMembers} alive.`);
  out.push("- Horde mobs and the Stalker burn in daylight, like zombies, so a horde never outlasts the night.");
  out.push("- Loot is shared by the whole horde: a few random members carry one item each. The \"most loot items\" column is the absolute cap.");
  out.push(`  A vanilla zombie gives 5 XP, so ${hordeSize("normal")} zombies would give ${hordeSize("normal") * 5}; the Normal horde gives ${hordeXp("normal")} - worth fighting, not worth farming.`);
  out.push("");
  out.push("## Drops and crafting");
  out.push("");
  const kills = (chance, need) => Math.round(need / chance);
  out.push(`- Gloomhound: string, Gloom Fang ${LOOT.gloomhound.gloomFangChance * 100}%, Shadow Hide ${LOOT.gloomhound.shadowHideChance * 100}%. A Shadow Hood needs 2 hides, 2 fangs and 1 string: about ${kills(LOOT.gloomhound.shadowHideChance, 2)} hounds.`);
  out.push(`- Thornskulk: sticks, Thorn Core ${LOOT.thornskulk.thornCoreChance * 100}%, Bark Hide ${LOOT.thornskulk.barkHideChance * 100}%. A Bramble Charm needs 2 hides, 1 core and 1 string: about ${kills(LOOT.thornskulk.barkHideChance, 2)} skulks.`);
  out.push(`- Horde Stalker: rotten flesh, Horde Claw ${LOOT.horde_stalker.hordeClawChance * 100}%, Tattered Cloth ${LOOT.horde_stalker.tatteredClothChance * 100}%.`);
  out.push(`- Shadow Hood: helmet with ${GEAR.shadowHood.protection} armour (like chainmail) and Night Vision while worn.`);
  out.push(`- Bramble Charm: held in the off hand, anything that hits you takes ${GEAR.brambleCharm.thornsDamage} damage.`);
  out.push("");
  out.push("## The other difficulty setting");
  out.push("");
  out.push("Minecraft's own world difficulty still applies on top, exactly as it does to vanilla mobs. Easy roughly halves a");
  out.push("hit (half, plus one), Hard adds half again. The tables above are for world difficulty Normal. Hit damage with both settings:");
  out.push("");
  out.push(row(["Mob", "Nightfall difficulty", "World Easy", "World Normal", "World Hard"]));
  out.push(row(Array(5).fill("---")));
  for (const key of ["gloomhound", "thornskulk", "horde_stalker", "horde_shambler", "horde_brute"]) {
    for (const d of DIFFICULTIES) {
      const hit = MOBS[key].damage[d];
      out.push(row([MOBS[key].name, DIFFICULTY_LABELS[d], worldDifficultyDamage.easy(hit), hit, worldDifficultyDamage.hard(hit)]));
    }
  }
  out.push("");
  out.push("## How often they appear");
  out.push("");
  out.push("Spawn weights next to vanilla (zombie 100, Enderman 10). All three only appear on the surface in the dark.");
  out.push("");
  for (const [key, spawn] of Object.entries(SPAWNS)) {
    out.push(`- ${MOBS[key].name}: weight ${spawn.weight}, groups of ${spawn.herd[0]}-${spawn.herd[1]}, at most ${spawn.densitySurface} nearby, biomes tagged ${spawn.biomeTags.join(" or ")}.`);
  }
  out.push("");
  out.push("These numbers have been checked by the automated tests but **not yet play-tested in the real game**. Expect to tune them after the first family session.");
  out.push("");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "BALANCE.md"), out.join("\n"));
}

function writeOutputs() {
  const buildDir = path.join(root, "build");
  fs.rmSync(buildDir, { recursive: true, force: true });
  for (const [name, data] of files) {
    const target = path.join(buildDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  const folder = { BP: "Nightfall Mobs BP", RP: "Nightfall Mobs RP" };
  const zipFiles = [...files].map(([name, data]) => ({ name: `${folder[name.slice(0, 2)]}${name.slice(2)}`, data }));
  const distDir = path.join(root, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const out = path.join(distDir, `nightfall-mobs-${versionTag}.mcaddon`);
  fs.writeFileSync(out, makeZip(zipFiles));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildEntities();
  buildSpawnRules();
  buildLoot();
  buildItems();
  buildRecipes();
  buildResourcePack();
  buildManifests();
  buildBalanceDoc();
  const out = writeOutputs();
  console.log(`Built ${files.size} files -> ${path.relative(root, out)}`);
}
