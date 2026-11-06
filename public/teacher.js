const htmlTags = new Set(["FORM", "LABEL", "INPUT", "SELECT", "OPTION", "BUTTON", "DIV", "P", "SPAN", "FIELDSET", "LEGEND"]);
const ns = "http://www.w3.org/2000/svg";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeHtmlNode(original) {
  if (original.nodeType === Node.TEXT_NODE) return document.createTextNode(original.textContent || "");
  if (original.nodeType !== Node.ELEMENT_NODE || !htmlTags.has(original.tagName)) return null;
  const name = original.tagName.toLowerCase();
  const node = document.createElement(name);
  const className = original.getAttribute("class") || "";
  if (/^[\w -]{1,120}$/.test(className)) node.className = className;
  if (original.id && /^[\w-]{1,60}$/.test(original.id)) node.id = original.id;
  if (name === "label") {
    const htmlFor = original.getAttribute("for");
    if (htmlFor && /^[\w-]{1,60}$/.test(htmlFor)) node.htmlFor = htmlFor;
  }
  if (["input", "select", "button"].includes(name)) {
    const fieldName = original.getAttribute("name");
    if (fieldName && /^[a-zA-Z][\w-]{0,50}$/.test(fieldName)) node.name = fieldName;
    if (original.hasAttribute("required")) node.required = true;
    if (original.hasAttribute("disabled")) node.disabled = true;
  }
  if (name === "input") {
    const type = original.getAttribute("type");
    node.type = type === "number" ? "number" : "text";
    for (const attr of ["min", "max", "minlength", "maxlength"]) {
      const value = original.getAttribute(attr);
      if (value && /^\d{1,5}$/.test(value)) node.setAttribute(attr, value);
    }
    node.value = (original.getAttribute("value") || "").slice(0, 120);
  }
  if (name === "option") {
    node.value = (original.getAttribute("value") || "").slice(0, 120);
    node.textContent = original.textContent || "";
    return node;
  }
  if (name === "button") node.type = "submit";
  if (name === "form") node.noValidate = false;
  for (const child of original.childNodes) {
    const safe = safeHtmlNode(child);
    if (safe) node.appendChild(safe);
  }
  return node;
}

function makeFallbackForm(definition) {
  const form = element("form", "ai-form");
  const label = element("label", "ai-label", definition.label);
  label.htmlFor = "question";
  form.appendChild(label);
  let control;
  if (definition.inputType === "select") {
    control = element("select", "ai-control");
    const empty = element("option", "", "Seç...");
    empty.value = "";
    control.appendChild(empty);
    for (const item of definition.options || []) {
      const option = element("option", "", item.label);
      option.value = item.value;
      control.appendChild(option);
    }
  } else {
    control = element("input", "ai-control");
    control.type = definition.inputType === "number" ? "number" : "text";
    if (control.type === "number") {
      control.min = "5";
      control.max = "100";
    } else {
      control.maxLength = 120;
    }
  }
  control.id = "question";
  control.name = definition.field;
  control.required = true;
  form.appendChild(control);
  const submit = element("button", "ai-submit", "Göndər");
  submit.type = "submit";
  form.appendChild(submit);
  return form;
}

const fallbackCss = ".ai-form{display:grid;gap:12px;padding:18px;border-radius:14px;background:#f3f5fa;max-width:480px}.ai-label{font-weight:700;color:#17223f}.ai-control{width:100%;box-sizing:border-box;padding:12px;border:1px solid #bfc8db;border-radius:8px;background:white;color:#111}.ai-submit{padding:12px 18px;border:0;border-radius:9px;background:#285de5;color:white;cursor:pointer}";

export function createFormPreview(turn, onAnswer, enabled = true) {
  const host = element("div", "form-host");
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style");
  const suppliedCss = typeof turn.css === "string" && turn.css.length < 15000 &&
    !/@import|url\s*\(|expression\s*\(|@font-face|<\/style|behavior\s*:/i.test(turn.css)
    ? turn.css : fallbackCss;
  style.textContent = ":host{display:block}.ai-form *{box-sizing:border-box}" + suppliedCss;
  shadow.appendChild(style);
  let form;
  if (typeof turn.html === "string" && turn.html.length < 18000 && turn.html.includes("<form")) {
    const parsed = new DOMParser().parseFromString(turn.html, "text/html");
    const original = parsed.querySelector("form");
    form = original ? safeHtmlNode(original) : null;
  }
  if (!form && turn.form) form = makeFallbackForm(turn.form);
  if (!form) return host;

  const formDefinition = turn.form;
  if (!enabled) {
    for (const control of form.querySelectorAll("input,select,button")) control.disabled = true;
    host.classList.add("is-answered");
  } else {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!formDefinition?.field) return;
      const raw = new FormData(form).get(formDefinition.field);
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value || value.length > 120) return;
      for (const control of form.querySelectorAll("input,select,button")) control.disabled = true;
      Promise.resolve(onAnswer(formDefinition.field, value)).catch(() => {
        for (const control of form.querySelectorAll("input,select,button")) control.disabled = false;
      });
    });
  }
  shadow.appendChild(form);
  return host;
}

function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text != null) node.textContent = String(text);
  return node;
}

function finite(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-1000, Math.min(1000, value)) : fallback;
}

export function createBoard(board = [], focusId = "") {
  const container = element("section", "board");
  const top = element("div", "board-heading");
  top.appendChild(element("strong", "", "◫ İnteraktiv lövhə"));
  top.appendChild(element("span", "muted", board.length + " element"));
  container.appendChild(top);
  const svg = svgNode("svg", { viewBox: "0 0 100 100", role: "img", "aria-label": "AI müəllimin lövhə təsviri" });
  svg.appendChild(svgNode("rect", { width: 100, height: 100, fill: "#10192f", rx: 2 }));
  for (let x = 0; x <= 100; x += 10) {
    svg.appendChild(svgNode("line", { x1: x, y1: 0, x2: x, y2: 100, stroke: "#263651", "stroke-width": 0.12 }));
    svg.appendChild(svgNode("line", { x1: 0, y1: x, x2: 100, y2: x, stroke: "#263651", "stroke-width": 0.12 }));
  }
  for (const item of board.slice(0, 40)) {
    if (!item || !item.id) continue;
    const x = finite(item.x), y = finite(item.y), w = finite(item.width), h = finite(item.height);
    const focused = focusId === item.id;
    const color = focused ? "#ffca5c" : "#b7ecff";
    const group = svgNode("g", { "data-element-id": item.id });
    if (item.type === "rectangle") {
      group.appendChild(svgNode("rect", { x, y, width: Math.max(1, w), height: Math.max(1, h), fill: "none", stroke: color, "stroke-width": 0.6 }));
    } else if (item.type === "circle") {
      group.appendChild(svgNode("circle", { cx: x + w / 2, cy: y + h / 2, r: Math.max(1, Math.abs(w) / 2), fill: "none", stroke: color, "stroke-width": 0.6 }));
    } else if (item.type === "line") {
      group.appendChild(svgNode("line", { x1: x, y1: y, x2: x + w, y2: y + h, stroke: color, "stroke-width": 0.6 }));
    } else if (item.type === "axes") {
      group.appendChild(svgNode("line", { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: color, "stroke-width": 0.45 }));
      group.appendChild(svgNode("line", { x1: x + w / 2, y1: y, x2: x + w / 2, y2: y + h, stroke: color, "stroke-width": 0.45 }));
      group.appendChild(svgNode("text", { x: x + w - 4, y: y + h / 2 - 2, fill: color, "font-size": 3 }, "x"));
      group.appendChild(svgNode("text", { x: x + w / 2 + 2, y: y + 4, fill: color, "font-size": 3 }, "y"));
    } else if (item.type === "plot") {
      const points = Array.isArray(item.points) ? item.points.slice(0, 100) : [];
      group.appendChild(svgNode("polyline", {
        points: points.map(p => finite(p.x) + "," + finite(p.y)).join(" "),
        fill: "none", stroke: color, "stroke-width": 0.65, "stroke-linejoin": "round"
      }));
    }
    if (item.type === "text" || item.type === "formula" || item.label) {
      const text = item.type === "formula" ? (item.expression || item.label) : item.label;
      if (text) {
        group.appendChild(svgNode("text", {
          x: x + 1, y: Math.min(99, y + (item.type === "text" || item.type === "formula" ? 5 : h + 5)),
          fill: color, "font-size": item.type === "formula" ? 3.7 : 3.0,
          "font-family": item.type === "formula" ? "monospace" : "sans-serif"
        }, String(text).slice(0, 130)));
      }
    }
    svg.appendChild(group);
  }
  container.appendChild(svg);
  if (board.some(item => item.type === "formula")) {
    container.appendChild(element("p", "board-note", "Düsturlar test rejimində mətn/LaTeX ifadəsi kimi göstərilir."));
  }
  return container;
}

export function makeSpeechPlayer(turn, onCue) {
  const row = element("div", "speech-controls");
  const button = element("button", "tiny-button", "🔊 Səsləndir");
  button.type = "button";
  const status = element("span", "muted", "Brauzer TTS");
  row.append(button, status);
  if (!("speechSynthesis" in window)) {
    button.disabled = true;
    status.textContent = "Brauzer səs dəstəkləmir";
    return row;
  }
  let spoken = false;
  button.addEventListener("click", () => {
    window.speechSynthesis.cancel();
    if (spoken) {
      spoken = false;
      button.textContent = "🔊 Səsləndir";
      status.textContent = "Dayandırıldı";
      return;
    }
    const speech = new SpeechSynthesisUtterance(turn.speech || "");
    speech.lang = "az-AZ";
    speech.rate = 0.92;
    spoken = true;
    button.textContent = "◼ Dayandır";
    status.textContent = "Danışır...";
    const cues = Array.isArray(turn.cues) ? [...turn.cues].sort((a,b) => a.atChar - b.atChar) : [];
    const notify = (index) => {
      const cue = cues.filter(c => c.atChar <= index).at(-1);
      if (cue) onCue?.(cue);
    };
    notify(0);
    speech.onboundary = (event) => notify(event.charIndex || 0);
    speech.onend = () => {
      spoken = false;
      button.textContent = "🔊 Səsləndir";
      status.textContent = "Bitdi";
    };
    speech.onerror = () => {
      spoken = false;
      button.textContent = "🔊 Səsləndir";
      status.textContent = "TTS səsi əlçatan deyil";
    };
    window.speechSynthesis.speak(speech);
  });
  return row;
}

export function createTeacherMessage(turn, { onAnswer, enabled = false } = {}) {
  const wrapper = element("div", "teacher-content");
  const header = element("div", "turn-header");
  header.appendChild(element("span", "tag " + (turn.kind === "form" ? "tag-blue" : ""), turn.kind || "lesson"));
  if (turn.sources?.length) header.appendChild(element("span", "muted", turn.sources.length + " mənbə"));
  wrapper.appendChild(header);
  wrapper.appendChild(element("p", "speech-text", turn.speech || "(mətn yoxdur)"));

  if (turn.form) {
    wrapper.appendChild(createFormPreview(turn, onAnswer, enabled));
    if (!enabled) wrapper.appendChild(element("span", "muted answered-label", "Bu forma artıq aktiv deyil"));
  }

  const gesture = element("div", "gesture-line", "Avatar jesti: —");
  let boardView = null;
  const board = Array.isArray(turn.board) ? turn.board : [];
  if (board.length) {
    boardView = element("div", "board-wrapper");
    boardView.appendChild(createBoard(board));
    wrapper.appendChild(boardView);
  }
  const onCue = (cue) => {
    gesture.textContent = "Avatar jesti: " + (cue.gestureId || "IDLE")
      + (cue.boardElementId ? " · Lövhə: " + cue.boardElementId : "");
    if (boardView && cue.boardElementId) {
      boardView.replaceChildren(createBoard(board, cue.boardElementId));
    }
  };
  wrapper.appendChild(makeSpeechPlayer(turn, onCue));
  if (turn.cues?.length) {
    const row = element("div", "cue-list");
    for (const cue of turn.cues) {
      const chip = element("button", "cue-chip", (cue.atChar ?? 0) + ": " + cue.gestureId);
      chip.type = "button";
      chip.title = cue.boardElementId || "";
      chip.addEventListener("click", () => onCue(cue));
      row.appendChild(chip);
    }
    wrapper.appendChild(row);
  }
  wrapper.appendChild(gesture);

  if (turn.sources?.length) {
    const sources = element("details", "source-details");
    sources.appendChild(element("summary", "", "Material istinadları (" + turn.sources.length + ")"));
    for (const ref of turn.sources) {
      sources.appendChild(element("div", "source-item", ref.title + " · Bölmə " + ref.chunkIndex));
    }
    wrapper.appendChild(sources);
  }
  const raw = element("details", "raw-details");
  raw.appendChild(element("summary", "", "API JSON cavabına bax"));
  raw.appendChild(element("pre", "raw-json", JSON.stringify(turn, null, 2)));
  wrapper.appendChild(raw);
  return wrapper;
}
