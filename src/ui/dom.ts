// A tiny element builder: h("button.big", { onclick }, "Play").

type Child = Node | string | null | undefined | false;
type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type El<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

export function h<S extends string>(tag: S, props: Record<string, unknown> | null = null, ...children: Child[]): El<S> {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name!);
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === "style" || k.startsWith("data-") || k.startsWith("aria-") || k === "role") el.setAttribute(k, String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c) el.append(c);
  return el as El<S>;
}

export function svg(markup: string, cls = "icon"): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild as SVGSVGElement;
  el.classList.add(cls);
  el.setAttribute("aria-hidden", "true");
  return el;
}
