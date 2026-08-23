/**
 * Small markdown renderer for task section bodies. Covers exactly what task
 * files actually contain: paragraphs, bullet and checkbox lists, ### subheads,
 * fenced code, pipe tables, blockquotes, rules, and inline code/links/bold.
 * Everything is escaped first — task text is file content, not trusted HTML.
 */
const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => escapeMap[c]);

function inline(text) {
  let out = escape(text);
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safe = /^(https?:|\/|\.|#)/i.test(href) ? href : "#";
    const external = /^https?:/i.test(safe);
    return `<a href="${safe}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  out = out.replace(/(^|[^*])\*\*([^*]+)\*\*/g, (_, pre, bold) => `${pre}<strong>${bold}</strong>`);
  out = out.replace(/(https?:\/\/[^\s<)]+)/g, (url) =>
    url.includes('href="') ? url : `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  return out;
}

function tableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function renderMarkdown(source) {
  const lines = String(source || "").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) { i++; continue; }

    // fenced code
    if (/^\s*```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      i++;
      out.push(`<pre><code>${escape(body.join("\n"))}</code></pre>`);
      continue;
    }

    // heading
    const heading = line.match(/^(#{3,6})\s+(.*)$/);
    if (heading) {
      out.push(`<h3>${inline(heading[2])}</h3>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    // table
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const head = tableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? "")) rows.push(tableRow(lines[i++] ?? ""));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) {
        body.push((lines[i++] ?? "").replace(/^\s*>\s?/, ""));
      }
      out.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    // list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (!/^\s*[-*+]\s+/.test(current)) {
          // indented continuation joins the item above
          if (items.length && /^\s{2,}\S/.test(current)) {
            items[items.length - 1] += ` ${current.trim()}`;
            i++;
            continue;
          }
          break;
        }
        items.push(current.replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((item) => {
        const box = item.match(/^\[([ xX])\]\s*(.*)$/);
        if (box) {
          const on = box[1].toLowerCase() === "x";
          return `<li class="task ${on ? "on" : "off"}"><span class="box">${on ? "[x]" : "[ ]"}</span><span>${inline(box[2])}</span></li>`;
        }
        return `<li><span>${inline(item)}</span></li>`;
      }).join("")}</ul>`);
      continue;
    }

    // paragraph
    const body = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^\s*([-*+>#]|\||```)/.test(lines[i] ?? "")) {
      body.push(lines[i++] ?? "");
    }
    if (body.length) out.push(`<p>${inline(body.join(" "))}</p>`);
    else i++;
  }

  return out.join("");
}
