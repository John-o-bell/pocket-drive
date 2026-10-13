import { Client } from "@colyseus/sdk";
import { passPlan, DT } from "@pocket-drive/game";
import { projectGame, predict } from "./prediction.js";
export { projectGame } from "./prediction.js";

const STORAGE_KEY = "pocket-drive-websocket-room-v2";
const zero = () => ({ x: 0, y: 0, sprint: false });
function save(value) {
  try {
    if (typeof sessionStorage !== "undefined") {
      if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}
export function savedRoom() {
  try {
    return typeof sessionStorage !== "undefined"
      ? JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null")
      : null;
  } catch {
    return null;
  }
}
function serverURL() {
  if (import.meta.env?.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (import.meta.env?.DEV)
    return `${location.protocol}//${location.hostname}:2567`;
  return typeof location !== "undefined"
    ? location.origin
    : "http://localhost:2567";
}
export class RoomSession {
  constructor({
    code = "",
    token = "",
    slot = 0,
    endpoint = serverURL(),
    onChange = () => {},
    onError = () => {},
  } = {}) {
    this.code = code;
    this.token = token;
    this.slot = slot;
    this.client = new Client(endpoint);
    this.onChange = onChange;
    this.onError = onError;
    this.socketRoom = null;
    this.room = null;
    this.raw = null;
    this.state = null;
    this.latestInput = zero();
    this.pending = [];
    this.commandSeq = 0;
    this.inputSeq = 0;
    this.active = false;
    this.timer = null;
    this.latency = 0;
    this.lastReceive = 0;
    this.disconnected = false;
    this.fatal = false;
    this.restorePromise = null;
  }
  static async connect({
    action = "create",
    code = "",
    name = "Coach",
    ...options
  } = {}) {
    const session = new RoomSession(options);
    const room =
      action === "create"
        ? await session.client.create("football", { name })
        : await session.client.joinById(code.trim().toUpperCase(), { name });
    await session.attach(room);
    return session;
  }
  static restore(credentials, options = {}) {
    if (
      !credentials ||
      !/^[A-Z2-9]{7}$/.test(credentials.code) ||
      typeof credentials.token !== "string" ||
      credentials.token.length > 256 ||
      !credentials.token.includes(":") ||
      ![0, 1].includes(credentials.slot)
    )
      return null;
    return new RoomSession({ ...credentials, ...options });
  }
  async attach(room) {
    this.socketRoom = room;
    this.code = room.roomId;
    this.token = room.reconnectionToken;
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 50;
    room.reconnection.minDelay = 500;
    room.reconnection.maxDelay = 1000;
    room.onMessage("snapshot", (snapshot) => this.accept(snapshot));
    room.onMessage("error", (data) => this.onError(Error(data.message), this));
    room.onMessage("pong", (timestamp) => {
      this.latency = Math.round(performance.now() - timestamp);
    });
    room.onDrop(() => {
      this.disconnected = true;
      this.latestInput = zero();
      this.onChange(this);
    });
    room.onReconnect(() => {
      this.disconnected = false;
      this.token = room.reconnectionToken;
      this.persist();
      room.send("snapshot");
      this.onChange(this);
    });
    room.onLeave(() => {
      this.disconnected = true;
      this.fatal = true;
      this.stop();
      this.onChange(this);
    });
    room.onError((_code, message) =>
      this.onError(Error(message || "The match connection failed."), this),
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        room.leave();
        reject(Error("The server did not send a match snapshot."));
      }, 5000);
      const off = room.onMessage("snapshot", () => {
        clearTimeout(timeout);
        off();
        resolve();
      });
      room.send("snapshot");
    });
    this.persist();
  }
  persist() {
    save({
      code: this.code,
      token: this.socketRoom?.reconnectionToken || this.token,
      slot: this.slot,
    });
  }
  accept(room) {
    const prior = this.state,
      oldId = prior
        ? prior.possession === 0
          ? prior.carrier
          : prior.selectedDefender
        : null,
      oldPlayer = prior?.players.find((p) => p.id === oldId);
    this.slot = room.slot;
    this.room = room;
    this.raw = room.game;
    this.state = projectGame(room.game, this.slot);
    this.commandSeq = Math.max(this.commandSeq, room.ack);
    this.inputSeq = Math.max(this.inputSeq, room.inputAck ?? 0);
    this.pending = this.pending.filter((c) => c.seq > room.ack);
    this.lastReceive = performance.now();
    this.disconnected = false;
    const newId =
        this.state.possession === 0
          ? this.state.carrier
          : this.state.selectedDefender,
      newPlayer = this.state.players.find((p) => p.id === newId);
    if (
      prior?.phase === "live" &&
      this.state.phase === "live" &&
      oldId === newId &&
      oldPlayer &&
      newPlayer &&
      Math.hypot(oldPlayer.x - newPlayer.x, oldPlayer.y - newPlayer.y) < 3
    ) {
      newPlayer.x = oldPlayer.x;
      newPlayer.y = oldPlayer.y;
      newPlayer.vx = oldPlayer.vx;
      newPlayer.vy = oldPlayer.vy;
    }
    this.persist();
    this.onChange(this);
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.timer = setInterval(() => {
      this.poll();
      if (
        this.socketRoom &&
        !this.disconnected &&
        performance.now() - (this.lastPing || 0) > 1000
      ) {
        this.lastPing = performance.now();
        this.socketRoom.send("ping", this.lastPing);
      }
    }, 1000 / 30);
    this.poll();
  }
  stop() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.latestInput = zero();
  }
  async poll() {
    if (!this.socketRoom) {
      if (!this.restorePromise)
        this.restorePromise = this.client
          .reconnect(this.token)
          .then((room) => this.attach(room))
          .catch((error) => {
            this.fatal = true;
            this.disconnected = true;
            save(null);
            this.onError(error, this);
            throw error;
          });
      await this.restorePromise;
    }
    if (this.disconnected) return;
    this.socketRoom.send("sync", {
      input: { ...this.latestInput, seq: ++this.inputSeq },
      commands: this.pending.slice(0, 12),
    });
  }
  send(c) {
    if (
      !this.room ||
      this.room.stage !== "playing" ||
      this.disconnected ||
      ![
        "select",
        "selectDefense",
        "switch",
        "selectDefender",
        "throw",
        "throwAway",
        "juke",
        "tackle",
        "swat",
        "pick",
        "punt",
        "snap",
        "next",
      ].includes(c.type)
    )
      return false;
    if (c.type === "throw" && c.receiver === undefined) {
      const plan = passPlan(this.state, c, c.style || "bullet");
      if (!plan) return false;
      c = { ...c, x: plan.x, y: plan.y };
    }
    if (this.pending.length >= 24) return false;
    this.pending.push({ ...c, seq: ++this.commandSeq });
    this.poll();
    return true;
  }
  ready(value = true) {
    if (!this.disconnected) this.socketRoom?.send("sync", { ready: value });
  }
  rematch() {
    if (!this.disconnected) this.socketRoom?.send("sync", { rematch: true });
  }
  async leave() {
    this.stop();
    save(null);
    if (this.socketRoom?.connection.isOpen) await this.socketRoom.leave();
  }
  update(input, dt = DT) {
    predict(this, input, dt);
  }
}
