import { expect, test } from "bun:test";

class FakeNode {
  tagName: string;
  textContent: string;
  children: FakeNode[] = [];
  firstChild: FakeNode | null = null;
  parentNode: FakeNode | null = null;
  nodeType: number;
  value = "";
  style = {};
  className = "";
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
  selectionDirection: "forward" | "backward" | "none" | null = "none";
  private attributes = new Map<string, string>();
  private listeners = new Map<string, (event: unknown) => unknown>();

  constructor(tag: string, text = "") {
    this.tagName = tag;
    this.textContent = text;
    this.nodeType = tag === "#text" ? 3 : 1;
  }

  append(...nodes: FakeNode[]) {
    for (const node of nodes) {
      this.children.push(node);
      node.parentNode = this;
    }
    this.firstChild = this.children[0] ?? null;
  }

  removeChild(node: FakeNode) {
    this.children.splice(this.children.indexOf(node), 1);
    if (node.contains(fakeDocument.activeElement)) fakeDocument.activeElement = null;
    node.parentNode = null;
    this.firstChild = this.children[0] ?? null;
  }

  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
    (this as unknown as Record<string, unknown>)[key] = value;
  }

  getAttribute(key: string) { return this.attributes.get(key) ?? null; }

  contains(node: FakeNode | null): boolean {
    return Boolean(node && (node === this || this.children.some((child) => child.contains(node))));
  }

  querySelector(selector: string): FakeNode | null {
    const field = selector.match(/^\[data-backlog-field="([^"]+)"\]$/)?.[1];
    if (field && this.getAttribute("data-backlog-field") === field) return this;
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  focus() { fakeDocument.activeElement = this; }

  setSelectionRange(start: number, end: number, direction: "forward" | "backward" | "none" = "none") {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }

  addEventListener(key: string, listener: (event: unknown) => unknown) {
    this.listeners.set(key, listener);
  }

  dispatch(key: string) {
    return this.listeners.get(key)?.({ target: this, preventDefault() {} });
  }
}

const fakeDocument = {
  activeElement: null as FakeNode | null,
  createElement: (tag: string) => new FakeNode(tag),
  createTextNode: (text: string) => new FakeNode("#text", text),
};
Object.assign(globalThis, { document: fakeDocument });

const { clear } = await import("../public/lib/dom.js");
const {
  captureAddBacklogFocus,
  createAddBacklogFormState,
  renderOverview,
  restoreAddBacklogFocus,
} = await import("../public/views/overview.js");

function inputs(node: FakeNode): FakeNode[] {
  return node.tagName === "input" ? [node] : node.children.flatMap(inputs);
}

function find(node: FakeNode, tag: string): FakeNode {
  if (node.tagName === tag) return node;
  for (const child of node.children) {
    const match = findOptional(child, tag);
    if (match) return match;
  }
  throw new Error(`missing ${tag}`);
}

function findOptional(node: FakeNode, tag: string): FakeNode | null {
  if (node.tagName === tag) return node;
  for (const child of node.children) {
    const match = findOptional(child, tag);
    if (match) return match;
  }
  return null;
}

function enter(host: FakeNode, label: string, dir: string) {
  const fields = inputs(host);
  fields[0]!.value = label;
  fields[0]!.dispatch("input");
  fields[1]!.value = dir;
  fields[1]!.dispatch("input");
}

function content(node: FakeNode): string {
  return node.nodeType === 3 ? node.textContent : node.children.map(content).join("");
}

test("a live workspace refresh does not erase a project path being entered", () => {
  const host = new FakeNode("main");
  const state = createAddBacklogFormState();
  host.append(renderOverview([], () => {}, async () => {}, () => {}, state) as unknown as FakeNode);

  enter(host, "photo", "/Users/demo/Documents/photo-app");

  clear(host).append(renderOverview([], () => {}, async () => {}, () => {}, state));

  expect(inputs(host).map((input) => input.value)).toEqual([
    "photo",
    "/Users/demo/Documents/photo-app",
  ]);
});

test("a live workspace refresh restores the active field and cursor", () => {
  const host = new FakeNode("main");
  const state = createAddBacklogFormState();
  const redraw = () => {
    const focus = captureAddBacklogFocus(host);
    clear(host).append(renderOverview([], () => {}, async () => {}, redraw, state));
    restoreAddBacklogFocus(host, focus);
  };
  redraw();
  enter(host, "photos", "/projects/photos");
  const path = inputs(host)[1]!;
  path.focus();
  path.setSelectionRange(9, 9);

  redraw();

  expect(fakeDocument.activeElement).toBe(inputs(host)[1]!);
  expect(inputs(host)[1]!.selectionStart).toBe(9);
  expect(inputs(host)[1]!.selectionEnd).toBe(9);
});

test("a rejected project keeps the draft available for correction", async () => {
  const host = new FakeNode("main");
  const state = createAddBacklogFormState();
  const add = async () => { throw new Error("No TASKS folder found"); };
  const redraw = () => clear(host).append(renderOverview([], () => {}, add, redraw, state));
  redraw();
  enter(host, "photos", "/wrong/path");

  await find(host, "form").dispatch("submit");

  expect(inputs(host).map((input) => input.value)).toEqual(["photos", "/wrong/path"]);
  expect(content(find(host, "form").children.at(-1)!)).toBe("No TASKS folder found");
});

test("a successful project add uses the draft and clears it afterwards", async () => {
  const host = new FakeNode("main");
  const state = createAddBacklogFormState();
  const received: string[][] = [];
  const add = async (label: string, dir: string) => { received.push([label, dir]); };
  const redraw = () => clear(host).append(renderOverview([], () => {}, add, redraw, state));
  redraw();
  enter(host, "photos", "/projects/photos");

  await find(host, "form").dispatch("submit");

  expect(received).toEqual([["photos", "/projects/photos"]]);
  expect(inputs(host).map((input) => input.value)).toEqual(["", ""]);
});
