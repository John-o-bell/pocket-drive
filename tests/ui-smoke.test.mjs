// DOM/canvas contract smoke test; this does not substitute for browser visual QA.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("game shell switches from offense to defense and renders valid coordinates", async () => {
  const nodes = [],
    handlers = {};
  let raf = null,
    draws = 0,
    saveDepth = 0;
  const canvasContext = new Proxy(
    {},
    {
      get: (o, k) =>
        k in o
          ? o[k]
          : (...args) => {
              for (const a of args)
                if (typeof a === "number")
                  assert.ok(
                    Number.isFinite(a),
                    `canvas ${String(k)} received ${a}`,
                  );
              if (k === "fillRect") draws++;
              if (k === "save") saveDepth++;
              if (k === "restore") {
                saveDepth--;
                assert.ok(saveDepth >= 0, "unbalanced canvas restore");
              }
            },
      set: (o, k, v) => ((o[k] = v), true),
    },
  );
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.id = attrs.id;
      this.classes = new Set((attrs.class || "").split(" ").filter(Boolean));
      this.dataset = {};
      this.style = {};
      this.children = [];
      this.disabled = false;
      this.value = attrs.value || "normal";
      this.open = false;
      this.textContent = "";
      for (const [k, v] of Object.entries(attrs))
        if (k.startsWith("data-")) this.dataset[k.slice(5)] = v;
      this.classList = {
        add: (x) => this.classes.add(x),
        remove: (x) => this.classes.delete(x),
        contains: (x) => this.classes.has(x),
        toggle: (x, v) => {
          const on = v === undefined ? !this.classes.has(x) : v;
          if (on) this.classes.add(x);
          else this.classes.delete(x);
          return on;
        },
      };
    }
    set className(v) {
      this.classes = new Set(v.split(" ").filter(Boolean));
    }
    get className() {
      return [...this.classes].join(" ");
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    append(n) {
      this.children.push(n);
    }
    addEventListener(k, f) {
      this["event_" + k] = f;
    }
    focus() {
      globalThis.document.activeElement = this;
    }
    getContext() {
      return canvasContext;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1100, height: 610 };
    }
    setPointerCapture() {}
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
  }
  const html = readFileSync(
    new URL("../apps/client/index.html", import.meta.url),
    "utf8",
  );
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)) {
    const attrs = {};
    for (const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))
      attrs[a[1]] = a[2];
    nodes.push(new Element(match[1], attrs));
  }
  const byId = (id) => {
    const n = nodes.find((n) => n.id === id);
    assert.ok(n, `missing #${id}`);
    return n;
  };
  globalThis.document = {
    hidden: false,
    activeElement: byId("field"),
    getElementById: byId,
    createElement: (tag) => {
      const n = new Element(tag);
      nodes.push(n);
      return n;
    },
    querySelectorAll: (selector) =>
      nodes.filter((n) =>
        selector.startsWith(".")
          ? n.classes.has(selector.slice(1))
          : selector === "[data-move]"
            ? "move" in n.dataset
            : selector === "[data-receiver]"
              ? "receiver" in n.dataset
              : false,
      ),
    addEventListener: (k, f) => (handlers["document_" + k] = f),
  };
  globalThis.window = { addEventListener: (k, f) => (handlers[k] = f) };
  globalThis.requestAnimationFrame = (f) => (raf = f);
  globalThis.confirm = () => true;
  await import("../apps/client/src/app.js");
  const key = (k) => {
    handlers.keydown({
      key: k,
      target: byId("field"),
      repeat: false,
      preventDefault() {},
    });
    handlers.keyup({ key: k });
  };
  assert.equal(byId("game-body").classList.contains("home-view"), true);
  byId("home-solo").onclick();
  assert.equal(byId("game-body").classList.contains("game-view"), true);
  await byId("back-home").onclick();
  assert.equal(byId("game-body").classList.contains("home-view"), true);
  assert.equal(byId("home-resume").classList.contains("hidden"), false);
  key("Enter");
  assert.equal(
    byId("phase-label").textContent,
    "PRE-SNAP",
    "home keyboard input must not snap a paused game",
  );
  byId("home-resume").onclick();
  assert.equal(byId("game-body").classList.contains("game-view"), true);
  assert.equal(byId("pause-overlay").classList.contains("hidden"), true);
  assert.equal(byId("mode-phase").textContent, "YOU: OFFENSE");
  assert.match(byId("context-controls").textContent, /Enter \/ Snap/);
  const field = byId("field"),
    pointer = (type, x, y, id = 7) =>
      field["event_" + type]({
        clientX: x,
        clientY: y,
        pointerId: id,
        button: 0,
        target: field,
        preventDefault() {},
      });
  key("f");
  assert.match(byId("pass-mode-chip").textContent, /LOB/);
  byId("pass-bullet").onclick();
  assert.match(byId("pass-mode-chip").textContent, /BULLET/);
  byId("snap").onclick();
  assert.match(byId("context-title").textContent, /QB/);
  pointer("pointerdown", 500, 308);
  pointer("pointermove", 700, 335);
  assert.equal(
    byId("passing").textContent,
    "0 / 0",
    "holding aim must not throw",
  );
  raf(16);
  assert.equal(saveDepth, 0);
  pointer("pointerup", 700, 335);
  assert.equal(byId("passing").textContent, "0 / 1");
  assert.match(byId("context-title").textContent, /Pass in flight/);
  assert.equal(byId("offense-controls").classList.contains("hidden"), true);
  pointer("pointerup", 700, 335);
  assert.equal(
    byId("passing").textContent,
    "0 / 1",
    "release must not throw twice",
  );
  byId("new-game").onclick();
  byId("snap").onclick();
  pointer("pointerdown", 500, 308);
  pointer("pointercancel", 500, 308);
  pointer("pointerup", 650, 308);
  assert.equal(
    byId("passing").textContent,
    "0 / 0",
    "cancelled gestures must not throw",
  );
  byId("new-game").onclick();
  byId("pass-lob").onclick();
  byId("snap").onclick();
  pointer("pointerdown", 375, 308);
  pointer("pointermove", 265, 308);
  pointer("pointerup", 265, 308);
  assert.equal(
    byId("passing").textContent,
    "0 / 1",
    "pulling backward from QB must throw forward",
  );
  assert.match(byId("flight-status").textContent, /LOB/);
  byId("new-game").onclick();
  byId("snap").onclick();
  pointer("pointerdown", 375, 308);
  pointer("pointermove", 475, 308);
  pointer("pointerup", 475, 308);
  assert.equal(
    byId("passing").textContent,
    "0 / 0",
    "pulling forward must not create a backward pass",
  );
  byId("new-game").onclick();
  byId("snap").onclick();
  pointer("pointerdown", 500, 308);
  key("p");
  pointer("pointerup", 650, 308);
  assert.equal(
    byId("passing").textContent,
    "0 / 0",
    "pausing cancels held aim",
  );
  byId("new-game").onclick();
  byId("pass-bullet").onclick();

  for (let i = 0; i < 4; i++) {
    byId("snap").onclick();
    key("x");
    assert.match(byId("result-next").textContent, /Enter/);
    byId("snap").onclick();
  }
  assert.equal(byId("mode-phase").textContent, "YOU: DEFENSE");
  assert.equal(byId("touch-juke").textContent, "TACKLE");
  assert.match(byId("context-title").textContent, /Cyan ring/);
  assert.match(byId("context-controls").textContent, /Choose coverage/);
  assert.equal(byId("plays").classList.contains("hidden"), true);
  assert.equal(byId("defensive-plays").classList.contains("hidden"), false);
  byId("defensive-plays").children[0].onclick();
  byId("snap").onclick();
  let time = 0;
  for (let i = 0; i < 200; i++) {
    time += 1000 / 60;
    raf(time);
    if (i === 5) key("q");
    if (i === 9) key(" ");
    if (!byId("snap").disabled && i > 20) byId("snap").onclick();
  }
  assert.equal(saveDepth, 0);
  assert.ok(draws > 1000);
  assert.match(byId("defense-box").textContent, /tackles.*sacks.*picks/);
});
