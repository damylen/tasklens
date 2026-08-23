/** Minimal element builder. `el('div.card', {onclick}, children)` */
export function el(spec, props, ...children) {
  const [tagPart, ...classes] = String(spec).split(".");
  const node = document.createElement(tagPart || "div");
  if (classes.length) node.className = classes.join(" ");

  if (props && (typeof props !== "object" || props.nodeType || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = node.className ? `${node.className} ${value}` : value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  add(node, children);
  return node;
}

function add(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) add(node, child);
    else node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function svg(paths, { size = 14, stroke = "currentColor", width = 2, fill = "none" } = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("width", size);
  node.setAttribute("height", size);
  node.setAttribute("fill", fill);
  node.setAttribute("stroke", stroke);
  node.setAttribute("stroke-width", width);
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  node.style.flex = `0 0 ${size}px`;
  for (const d of [].concat(paths)) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    node.append(path);
  }
  return node;
}

export const ICON = {
  back: "M15 5l-7 7 7 7",
  search: "M18 11a7 7 0 11-14 0 7 7 0 0114 0zM20 20l-3.6-3.6",
  rows: "M4 6h16M4 12h16M4 18h16",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5",
  link: "M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1",
  collapse: ["M13 6l-5 6 5 6", "M18 6l-5 6 5 6"],
  expand: ["M11 6l5 6-5 6", "M6 6l5 6-5 6"],
  clock: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 7v5l3 2"],
};
