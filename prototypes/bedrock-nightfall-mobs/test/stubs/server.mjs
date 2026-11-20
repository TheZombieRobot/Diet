// A small stand-in for @minecraft/server so the game script can be exercised in Node.
const signal = () => {
  const subs = [];
  return { subscribe: (cb) => (subs.push(cb), cb), emit: (event) => subs.forEach((cb) => cb(event)) };
};

let nextId = 1;
export const __test = { messages: [], items: [], entities: [], players: [], timeouts: [], intervals: [], topBlock: { y: 64, isLiquid: false, typeId: "minecraft:grass_block" } };

function withProps(obj) {
  const props = new Map();
  obj.getDynamicProperty = (key) => props.get(key);
  obj.setDynamicProperty = (key, value) => props.set(key, value);
  return obj;
}

export function makeEntity(typeId, location, families = []) {
  const entity = withProps({ typeId, id: String(nextId++), isValid: true, location, families, events: [], damage: [], effects: [] });
  entity.dimension = dimension;
  entity.triggerEvent = (name) => entity.events.push(name);
  entity.applyDamage = (amount, options) => entity.damage.push({ amount, options });
  entity.addEffect = (type, duration, options) => entity.effects.push({ type, duration, options });
  return entity;
}

export function makePlayer(name, location, { operator = false } = {}) {
  const player = makeEntity("minecraft:player", location, ["player"]);
  Object.assign(player, { name, playerPermissionLevel: operator ? 2 : 1, inventory: [], equipment: {}, actionBar: [], sounds: [], chat: [] });
  player.sendMessage = (m) => player.chat.push(m);
  player.playSound = (s) => player.sounds.push(s);
  player.onScreenDisplay = { setActionBar: (m) => player.actionBar.push(m) };
  player.getComponent = (id) => {
    if (id === "minecraft:inventory") return { container: { addItem: (stack) => void player.inventory.push(stack) } };
    if (id === "minecraft:equippable") return { getEquipment: (slot) => player.equipment[slot] };
    return undefined;
  };
  __test.players.push(player);
  return player;
}

const FAMILIES = (typeId) => (typeId.includes("horde_") && !typeId.includes("stalker") ? ["horde_member", "nightfall"] : ["nightfall"]);

export const dimension = {
  id: "minecraft:overworld",
  getPlayers: (options = {}) => (options.closest ? __test.players.slice(0, options.closest) : __test.players.slice()),
  getEntities: (options = {}) => __test.entities.filter((e) => e.isValid && (options.families ?? []).every((f) => e.families.includes(f))),
  getTopmostBlock: () => __test.topBlock,
  spawnEntity: (typeId, location) => {
    const entity = makeEntity(typeId, location, FAMILIES(typeId));
    __test.entities.push(entity);
    world.afterEvents.entitySpawn.emit({ entity, cause: "Spawned" });
    return entity;
  },
  spawnItem: (stack, location) => void __test.items.push({ stack, location }),
};

export const world = withProps({
  afterEvents: Object.fromEntries(
    ["worldLoad", "playerSpawn", "itemUse", "entitySpawn", "entityLoad", "dataDrivenEntityTrigger", "entityDie", "entityHurt", "playerLeave"].map((n) => [n, signal()])
  ),
  sendMessage: (m) => __test.messages.push(m),
  getAllPlayers: () => __test.players.slice(),
  getDimension: () => dimension,
});

export const system = {
  currentTick: 0,
  runTimeout: (cb, ticks) => void __test.timeouts.push({ cb, at: system.currentTick + ticks }),
  runInterval: (cb) => void __test.intervals.push(cb),
};

// Move time forward and run anything that became due.
__test.advance = (ticks) => {
  system.currentTick += ticks;
  const due = __test.timeouts.filter((t) => t.at <= system.currentTick);
  __test.timeouts = __test.timeouts.filter((t) => t.at > system.currentTick);
  due.forEach((t) => t.cb());
};

export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
  }
}
export const EquipmentSlot = { Head: "Head", Offhand: "Offhand" };
export const EntityDamageCause = { entityAttack: "entityAttack", thorns: "thorns" };
export const PlayerPermissionLevel = { Visitor: 0, Member: 1, Operator: 2, Custom: 3 };
