// Nightfall Mobs - in-game logic.
// Everything here runs on the host (the Windows PC). Guests on console need nothing extra.
import { world, system, ItemStack, EquipmentSlot, EntityDamageCause, PlayerPermissionLevel } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  GEAR,
  GRASPER,
  HORDE,
  MOBS,
  NAMESPACE,
  hordeSize,
  isDifficulty,
} from "./balance.js";
import { farEnoughFromAll, planHorde, ringPoint } from "./horde.js";

const PROP_DIFFICULTY = `${NAMESPACE}:difficulty`;
const PROP_HORDES = `${NAMESPACE}:hordes`;
const PROP_GUIDE_GIVEN = `${NAMESPACE}:guide_given`;
const PROP_APPLIED = `${NAMESPACE}:applied`;
const PROP_LOOT = `${NAMESPACE}:loot`;

const GUIDE_ITEM = `${NAMESPACE}:night_guide`;
const HOOD_ITEM = `${NAMESPACE}:shadow_hood`;
const CHARM_ITEM = `${NAMESPACE}:bramble_charm`;
const STALKER = `${NAMESPACE}:horde_stalker`;
const GRASPER_ID = `${NAMESPACE}:horde_grasper`;
const MOB_IDS = new Set(Object.keys(MOBS).map((key) => `${NAMESPACE}:${key}`));
const MEMBER_IDS = new Set(
  Object.entries(MOBS)
    .filter(([, mob]) => mob.hordeMember)
    .map(([key]) => `${NAMESPACE}:${key}`)
);
const DIMENSIONS = ["overworld", "nether", "the_end"];

let difficulty = DEFAULT_DIFFICULTY;
let hordesEnabled = true;
let ready = false;
const grasperCooldownUntil = new Map();

// ---------------------------------------------------------------- settings

function loadSettings() {
  const savedDifficulty = world.getDynamicProperty(PROP_DIFFICULTY);
  difficulty = typeof savedDifficulty === "string" && isDifficulty(savedDifficulty) ? savedDifficulty : DEFAULT_DIFFICULTY;
  hordesEnabled = world.getDynamicProperty(PROP_HORDES) !== false;
  ready = true;
}

function canChangeSettings(player) {
  try {
    if (player.playerPermissionLevel === PlayerPermissionLevel.Operator) return true;
  } catch {
    // fall through
  }
  return world.getAllPlayers().length === 1;
}

function setDifficulty(next, changedBy) {
  if (!isDifficulty(next) || next === difficulty) return;
  difficulty = next;
  world.setDynamicProperty(PROP_DIFFICULTY, next);
  world.sendMessage(`§5[Nightfall]§r Difficulty is now §e${DIFFICULTY_LABELS[next]}§r (set by ${changedBy.name}).`);
  for (const id of DIMENSIONS) {
    try {
      for (const entity of world.getDimension(id).getEntities({ families: ["nightfall"] })) applyDifficulty(entity);
    } catch {
      // dimension not available - nothing to update there
    }
  }
}

function setHordes(enabled, changedBy) {
  hordesEnabled = enabled;
  world.setDynamicProperty(PROP_HORDES, enabled);
  world.sendMessage(`§5[Nightfall]§r Hordes are now §e${enabled ? "On" : "Off"}§r (set by ${changedBy.name}).`);
}

// Mobs carry one set of stats per difficulty (see the entity files). This picks the right set.
function applyDifficulty(entity) {
  try {
    if (!ready || !entity.isValid || !MOB_IDS.has(entity.typeId)) return;
    if (entity.getDynamicProperty(PROP_APPLIED) === difficulty) return;
    entity.triggerEvent(`${NAMESPACE}:set_${difficulty}`);
    entity.setDynamicProperty(PROP_APPLIED, difficulty);
  } catch {
    // the entity went away between the event and now
  }
}

// ---------------------------------------------------------------- the guide book

function giveGuide(player) {
  const stack = new ItemStack(GUIDE_ITEM, 1);
  const container = player.getComponent("minecraft:inventory")?.container;
  const leftover = container ? container.addItem(stack) : stack;
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

function statLine(key) {
  const mob = MOBS[key];
  return `§e${mob.name}§r  Health ${mob.health[difficulty]}  Hit ${mob.damage[difficulty]}`;
}

function showMobGuide(player) {
  const body = [
    `Difficulty: §e${DIFFICULTY_LABELS[difficulty]}§r`,
    "",
    statLine("gloomhound"),
    "Fast. Leaps at you. Slow near torches.",
    "",
    statLine("thornskulk"),
    "Hides like a bush. Rushes, then gets tired.",
    "",
    statLine("horde_stalker"),
    hordesEnabled
      ? `Screams, then calls ${hordeSize(difficulty)} weak zombies. Stop it fast!`
      : "Hordes are switched off.",
    "",
    "Horde zombies are weak but many. Use doors, walls and high ground. They burn at sunrise.",
  ].join("\n");
  new ActionFormData()
    .title("Night Mobs")
    .body(body)
    .button("Back")
    .show(player)
    .then((response) => {
      if (!response.canceled) showGuide(player);
    })
    .catch(() => {});
}

function showGuide(player) {
  const canChange = canChangeSettings(player);
  const form = new ActionFormData().title("Nightfall Guide");
  const lines = [`Difficulty: §e${DIFFICULTY_LABELS[difficulty]}§r`, `Hordes: §e${hordesEnabled ? "On" : "Off"}§r`];
  if (!canChange) lines.push("", "Only the world host can change these.");
  form.body(lines.join("\n"));

  const actions = [];
  form.button("Night Mobs", "textures/items/nightfall/gloom_fang");
  actions.push(() => showMobGuide(player));
  if (canChange) {
    for (const level of DIFFICULTIES) {
      form.button(level === difficulty ? `§2${DIFFICULTY_LABELS[level]} (now)` : DIFFICULTY_LABELS[level]);
      actions.push(() => {
        setDifficulty(level, player);
        showGuide(player);
      });
    }
    form.button(hordesEnabled ? "Turn Hordes Off" : "Turn Hordes On", "textures/items/nightfall/horde_claw");
    actions.push(() => {
      setHordes(!hordesEnabled, player);
      showGuide(player);
    });
  }
  form
    .show(player)
    .then((response) => {
      if (response.canceled || response.selection === undefined) return;
      // Re-check: the player may have lost operator rights while the form was open.
      if (response.selection > 0 && !canChangeSettings(player)) return;
      actions[response.selection]?.();
    })
    .catch(() => {});
}

// ---------------------------------------------------------------- hordes

function tellNearby(dimension, location, radius, message, sound, soundOptions) {
  for (const player of dimension.getPlayers({ location, maxDistance: radius })) {
    try {
      if (message) player.onScreenDisplay.setActionBar(message);
      if (sound) player.playSound(sound, soundOptions);
    } catch {
      // player left
    }
  }
}

function findSpawnSpot(dimension, centre, playerLocations) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const point = ringPoint(centre);
    if (!farEnoughFromAll(point, playerLocations)) continue;
    try {
      const block = dimension.getTopmostBlock({ x: point.x, z: point.z });
      if (!block || block.isLiquid || block.typeId.includes("leaves")) continue;
      const y = block.y + 1;
      if (Math.abs(y - centre.y) > HORDE.maxHeightDifference) continue;
      return { x: point.x, y, z: point.z };
    } catch {
      // unloaded chunk - try another point
    }
  }
  return undefined;
}

function spawnWave(dimension, target, fallbackCentre, members) {
  let centre = fallbackCentre;
  try {
    if (target.isValid && target.dimension.id === dimension.id) centre = target.location;
  } catch {
    // keep the remembered location
  }
  const playerLocations = dimension.getPlayers().map((player) => player.location);
  for (const member of members) {
    const spot = findSpawnSpot(dimension, centre, playerLocations);
    if (!spot) continue; // awkward terrain: a smaller horde is better than an unfair one
    try {
      const entity = dimension.spawnEntity(member.typeId, spot);
      if (member.loot) entity.setDynamicProperty(PROP_LOOT, member.loot);
    } catch {
      // could not spawn here - skip this member
    }
  }
}

function callHorde(stalker) {
  if (!hordesEnabled) return;
  const dimension = stalker.dimension;
  const location = stalker.location;
  const target = dimension.getPlayers({ location, closest: 1, maxDistance: HORDE.areaRadius })[0];
  if (!target) return;

  // Caps: one horde per area, and a ceiling on live horde mobs.
  const nearby = dimension.getEntities({ families: ["horde_member"], location, maxDistance: HORDE.areaRadius }).length;
  if (nearby > HORDE.maxMembersNearbyToCall) return;
  const live = dimension.getEntities({ families: ["horde_member"] }).length;
  const room = HORDE.maxLiveMembers - live;
  if (room <= 0) return;
  const plan = planHorde(difficulty).slice(0, room);

  tellNearby(dimension, location, HORDE.areaRadius, "§cThe horde is coming!", "raid.horn", { volume: 1 });
  const centre = target.location;
  HORDE.waveSeconds.forEach((seconds, wave) => {
    const members = plan.filter((member) => member.wave === wave);
    system.runTimeout(() => spawnWave(dimension, target, centre, members), seconds * 20);
  });
}

// ---------------------------------------------------------------- event wiring

world.afterEvents.worldLoad.subscribe(() => {
  loadSettings();
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  if (player.getDynamicProperty(PROP_GUIDE_GIVEN)) return;
  player.setDynamicProperty(PROP_GUIDE_GIVEN, true);
  giveGuide(player);
  player.sendMessage("§5[Nightfall]§r You got a §eNightfall Guide§r. Use it to see the night mobs and the difficulty.");
});

world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId === GUIDE_ITEM) showGuide(event.source);
});

world.afterEvents.entitySpawn.subscribe((event) => applyDifficulty(event.entity));
world.afterEvents.entityLoad.subscribe((event) => applyDifficulty(event.entity));

world.afterEvents.dataDrivenEntityTrigger.subscribe(
  (event) => {
    try {
      if (event.eventId === `${NAMESPACE}:begin_scream`) {
        tellNearby(
          event.entity.dimension,
          event.entity.location,
          48,
          hordesEnabled ? "§cA Horde Stalker is calling its horde! Stop it!" : "§cA Horde Stalker has seen you!",
          "mob.ravager.roar",
          { volume: 1, pitch: 0.7 }
        );
      } else if (event.eventId === `${NAMESPACE}:call_horde`) {
        callHorde(event.entity);
      }
    } catch {
      // stalker died or unloaded in the same tick
    }
  },
  { entityTypes: [STALKER], eventTypes: [`${NAMESPACE}:begin_scream`, `${NAMESPACE}:call_horde`] }
);

// Horde loot: a member only drops what it was handed when the horde spawned, and only for player kills.
world.afterEvents.entityDie.subscribe((event) => {
  try {
    const dead = event.deadEntity;
    if (!MEMBER_IDS.has(dead.typeId)) return;
    const loot = dead.getDynamicProperty(PROP_LOOT);
    if (typeof loot !== "string") return;
    if (event.damageSource.damagingEntity?.typeId !== "minecraft:player") return;
    dead.dimension.spawnItem(new ItemStack(loot, 1), dead.location);
  } catch {
    // entity already removed - no loot
  }
});

world.afterEvents.entityHurt.subscribe(
  (event) => {
    try {
      const player = event.hurtEntity;
      const attacker = event.damageSource.damagingEntity;
      if (!attacker || !attacker.isValid || event.damageSource.cause !== EntityDamageCause.entityAttack) return;

      // Grasper: a short slow, with a per-player cooldown so it can never chain.
      if (attacker.typeId === GRASPER_ID) {
        const now = system.currentTick;
        if ((grasperCooldownUntil.get(player.id) ?? 0) <= now) {
          grasperCooldownUntil.set(player.id, now + GRASPER.cooldownSeconds * 20);
          player.addEffect("slowness", Math.round(GRASPER.slowSeconds[difficulty] * 20), { amplifier: 0 });
        }
      }

      // Bramble Charm in the off hand: whoever hits you gets pricked.
      const offhand = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
      if (offhand?.typeId === CHARM_ITEM && attacker.id !== player.id) {
        attacker.applyDamage(GEAR.brambleCharm.thornsDamage, { cause: EntityDamageCause.thorns, damagingEntity: player });
      }
    } catch {
      // someone left or died mid-event
    }
  },
  { entityTypes: ["minecraft:player"] }
);

world.afterEvents.playerLeave.subscribe((event) => grasperCooldownUntil.delete(event.playerId));

// Shadow Hood: night vision while it is worn. Kept above 10 seconds so the screen never flickers.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const head = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head);
      if (head?.typeId === HOOD_ITEM) {
        player.addEffect("night_vision", GEAR.shadowHood.nightVisionSeconds * 20, { showParticles: false });
      }
    } catch {
      // player left
    }
  }
}, 40);
