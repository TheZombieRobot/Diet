// Nightfall Mobs - in-game logic.
// Everything here runs on the host (the Windows PC). Guests on console need nothing extra.
import { world, system, Difficulty, ItemStack, EquipmentSlot, EntityDamageCause, PlayerPermissionLevel } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  GEAR,
  GRASPER,
  HORDE,
  MOBS,
  MOB_TOGGLES,
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
const PROP_DISABLED_MOBS = `${NAMESPACE}:disabled_mobs`;
const PROP_SETUP_DONE = `${NAMESPACE}:setup_done`;

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
const TOGGLE_KEYS = Object.keys(MOB_TOGGLES);
const TOGGLE_OF_TYPE = new Map(
  Object.entries(MOB_TOGGLES).flatMap(([toggle, group]) => group.mobs.map((mob) => [`${NAMESPACE}:${mob}`, toggle]))
);
const STALKER_TOGGLE = "horde_stalker";
const SETUP_RETRY_TICKS = 40;
const SETUP_MAX_RETRIES = 15;

let difficulty = DEFAULT_DIFFICULTY;
let hordesEnabled = true;
let disabledToggles = new Set();
let setupRunning = false;
let ready = false;
const grasperCooldownUntil = new Map();

// ---------------------------------------------------------------- settings

function loadSettings() {
  const savedDifficulty = world.getDynamicProperty(PROP_DIFFICULTY);
  difficulty = typeof savedDifficulty === "string" && isDifficulty(savedDifficulty) ? savedDifficulty : DEFAULT_DIFFICULTY;
  hordesEnabled = world.getDynamicProperty(PROP_HORDES) !== false;
  disabledToggles = parseDisabledToggles(world.getDynamicProperty(PROP_DISABLED_MOBS));
  ready = true;
}

// Saved as a JSON array of toggle keys. Anything missing or unreadable means every mob is on.
function parseDisabledToggles(raw) {
  if (typeof raw !== "string") return new Set();
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((key) => TOGGLE_KEYS.includes(key)));
  } catch {
    return new Set();
  }
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

// Spawn rules are static JSON and cannot be switched off, so a disabled mob is removed in script.
function isMobDisabled(typeId) {
  const toggle = TOGGLE_OF_TYPE.get(typeId);
  return toggle !== undefined && disabledToggles.has(toggle);
}

function removeIfDisabled(entity) {
  try {
    if (!ready || !entity.isValid || !isMobDisabled(entity.typeId)) return false;
    entity.remove();
    return true;
  } catch {
    return false; // already gone
  }
}

function removeDisabledEntities() {
  if (disabledToggles.size === 0) return;
  for (const id of DIMENSIONS) {
    try {
      for (const entity of world.getDimension(id).getEntities({ families: ["nightfall"] })) removeIfDisabled(entity);
    } catch {
      // dimension not available - nothing to remove there
    }
  }
}

function onEntityAppears(entity) {
  if (!removeIfDisabled(entity)) applyDifficulty(entity);
}

function setDisabledToggles(next, changedBy) {
  const changed = TOGGLE_KEYS.some((key) => next.has(key) !== disabledToggles.has(key));
  disabledToggles = next;
  world.setDynamicProperty(PROP_DISABLED_MOBS, JSON.stringify(TOGGLE_KEYS.filter((key) => next.has(key))));
  if (changed) {
    const parts = TOGGLE_KEYS.map((key) => `${MOB_TOGGLES[key].label} ${next.has(key) ? "Off" : "On"}`);
    world.sendMessage(`§5[Nightfall]§r Mobs: §e${parts.join(", ")}§r (set by ${changedBy.name}).`);
  }
  removeDisabledEntities();
}

function offMobLabels() {
  return TOGGLE_KEYS.filter((key) => disabledToggles.has(key)).map((key) => MOB_TOGGLES[key].label);
}

// Mobs carry one set of stats per difficulty (see the entity files). This picks the right set.
function applyDifficulty(entity) {
  try {
    if (!ready || !entity.isValid || !MOB_IDS.has(entity.typeId) || isMobDisabled(entity.typeId)) return;
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
  if (isMobDisabled(`${NAMESPACE}:${key}`)) return `§7${mob.name} - Off§r`;
  return `§e${mob.name}§r  Health ${mob.health[difficulty]}  Hit ${mob.damage[difficulty]}`;
}

function showMobGuide(player) {
  const lines = [`Difficulty: §e${DIFFICULTY_LABELS[difficulty]}§r`, ""];
  // A mob that is switched off shows only its "- Off" line.
  lines.push(statLine("gloomhound"));
  if (!isMobDisabled(`${NAMESPACE}:gloomhound`)) lines.push("Fast. Leaps at you. Slow near torches.");
  lines.push("", statLine("thornskulk"));
  if (!isMobDisabled(`${NAMESPACE}:thornskulk`)) lines.push("Hides like a bush. Rushes, then gets tired.");
  lines.push("", statLine("horde_stalker"));
  if (!isMobDisabled(STALKER)) {
    lines.push(
      hordesEnabled
        ? `Screams, then calls ${hordeSize(difficulty)} weak zombies. Stop it fast!`
        : "Hordes are switched off.",
      "",
      "Horde zombies are weak but many. Use doors, walls and high ground. They burn at sunrise."
    );
  }
  const body = lines.join("\n");
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
  const off = offMobLabels();
  lines.push(off.length > 0 ? `Mobs Off: §e${off.join(", ")}§r` : "Mobs: all On");
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
    form.button("Choose Mobs", "textures/items/nightfall/thorn_core");
    actions.push(() => showChooseMobs(player));
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

// ---------------------------------------------------------------- choosing mobs

// Shows the toggles. Resolves to "saved", "denied", "busy", "closed" or "error".
function openMobForm(player) {
  const form = new ModalFormData().title("Choose Mobs");
  for (const key of TOGGLE_KEYS) form.toggle(MOB_TOGGLES[key].label, { defaultValue: !disabledToggles.has(key) });
  form.submitButton("Save");
  return form
    .show(player)
    .then((response) => {
      if (response.canceled || !Array.isArray(response.formValues)) {
        return response.cancelationReason === FormCancelationReason.UserBusy ? "busy" : "closed";
      }
      // Re-check: the player may have lost operator rights while the form was open.
      if (!canChangeSettings(player)) return "denied";
      const next = new Set(TOGGLE_KEYS.filter((key, index) => response.formValues[index] === false));
      setDisabledToggles(next, player);
      return "saved";
    })
    .catch(() => "error");
}

function showChooseMobs(player) {
  if (!canChangeSettings(player)) return;
  openMobForm(player).then((outcome) => {
    if (outcome === "saved") showGuide(player);
  });
}

// The first time a host joins a new world: pick mobs, then pick difficulty in the guide.
function maybeStartSetup(player) {
  if (setupRunning || world.getDynamicProperty(PROP_SETUP_DONE) === true || !canChangeSettings(player)) return;
  setupRunning = true;
  attemptSetup(player, 0);
}

function attemptSetup(player, retries) {
  let canContinue = false;
  try {
    canContinue = player.isValid && canChangeSettings(player);
  } catch {
    // player left
  }
  if (!canContinue) {
    setupRunning = false;
    return;
  }
  openMobForm(player).then((outcome) => {
    if (outcome === "busy" && retries < SETUP_MAX_RETRIES) {
      // Forms opened right after joining are often refused as "UserBusy". Try again shortly.
      system.runTimeout(() => attemptSetup(player, retries + 1), SETUP_RETRY_TICKS);
      return;
    }
    setupRunning = false;
    if (outcome === "error") return;
    try {
      player.sendMessage("§5[Nightfall]§r You can change the mobs any time from the §eNightfall Guide§r.");
      if (outcome === "busy") return; // gave up quietly; asked again the next time the host joins
      world.setDynamicProperty(PROP_SETUP_DONE, true);
      showGuide(player);
    } catch {
      // player left
    }
  });
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
  if (disabledToggles.has(STALKER_TOGGLE)) return; // switched off while the horde was on its way
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
  if (!hordesEnabled || disabledToggles.has(STALKER_TOGGLE)) return;
  if (world.getDifficulty() === Difficulty.Peaceful) return; // no hordes on Peaceful worlds
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
  removeDisabledEntities();
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  if (!player.getDynamicProperty(PROP_GUIDE_GIVEN)) {
    player.setDynamicProperty(PROP_GUIDE_GIVEN, true);
    giveGuide(player);
    player.sendMessage("§5[Nightfall]§r You got a §eNightfall Guide§r. Use it to see the night mobs and the difficulty.");
  }
  maybeStartSetup(player);
});

world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId === GUIDE_ITEM) showGuide(event.source);
});

world.afterEvents.entitySpawn.subscribe((event) => onEntityAppears(event.entity));
world.afterEvents.entityLoad.subscribe((event) => onEntityAppears(event.entity));

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
