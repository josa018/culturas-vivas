export class MockClassList {
  private readonly classes = new Set<string>();

  public add(...tokens: string[]): void {
    for (const token of tokens) {
      token
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => this.classes.add(c));
    }
  }

  public remove(...tokens: string[]): void {
    for (const token of tokens) {
      token
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => this.classes.delete(c));
    }
  }

  public contains(token: string): boolean {
    return this.classes.has(token);
  }
}

export class MockElement {
  public tagName: string;
  public className: string = "";
  private _textContent: string | null = null;

  public get textContent(): string {
    if (this._textContent !== null) {
      return this._textContent;
    }
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join("");
    }
    return "";
  }

  public set textContent(value: string) {
    this._textContent = value;
  }

  public classList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes = new Map<string, string>();
  public listeners = new Map<string, Array<(event: unknown) => void>>();
  public style: Record<string, string> = {};
  public value: string = "";
  public rows: number = 2;
  public placeholder: string = "";
  public id: string = "";
  public type: string = "";
  public isPlaying: boolean = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") {
      this.id = value;
    }
  }

  public getAttribute(name: string): string | null {
    if (name === "id") {
      return this.id || null;
    }
    return this.attributes.get(name) ?? null;
  }

  public appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public append(...items: (MockElement | string)[]): void {
    for (const item of items) {
      if (typeof item === "string") {
        const textNode = new MockElement("span");
        textNode.textContent = item;
        this.appendChild(textNode);
      } else if (item instanceof MockElement) {
        this.appendChild(item);
      }
    }
  }

  public remove(): void {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  public addEventListener(event: string, handler: (e: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  public dispatchEvent(event: string, payload?: unknown): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) {
      h(payload ?? { stopPropagation: () => {}, preventDefault: () => {} });
    }
  }

  public querySelector<T = MockElement>(selector: string): T | null {
    const match = (el: MockElement): MockElement | null => {
      if (selector.startsWith('[data-action="')) {
        const action = selector.slice(14, -2);
        if (el.getAttribute("data-action") === action) return el;
      }
      if (selector.startsWith('[data-rating="')) {
        const rating = selector.slice(14, -2);
        if (el.getAttribute("data-rating") === rating) return el;
      }
      if (selector.startsWith('[data-screen-id="')) {
        const screenId = selector.slice(17, -2);
        if (el.getAttribute("data-screen-id") === screenId) return el;
      }
      if (
        selector.startsWith("#") &&
        (el.id === selector.slice(1) ||
          el.getAttribute("id") === selector.slice(1))
      ) {
        return el;
      }
      if (selector === "a-scene" && el.tagName === "A-SCENE") {
        return el;
      }
      for (const child of el.children) {
        const res = match(child);
        if (res) return res;
      }
      return null;
    };
    return match(this) as T | null;
  }

  public querySelectorAll<T = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];
    const walk = (el: MockElement): void => {
      if (selector === "[data-rating]" && el.getAttribute("data-rating")) {
        results.push(el);
      }
      for (const child of el.children) {
        walk(child);
      }
    };
    walk(this);
    return results as T[];
  }

  public play(): void {
    this.isPlaying = true;
  }

  public pause(): void {
    this.isPlaying = false;
  }
}

export function setupMockDocument(
  rootSelectorTarget?: MockElement,
  sceneTarget?: MockElement,
): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => new MockElement(tag),
    querySelector: (sel: string) => {
      if (sel === "a-scene" && sceneTarget) {
        return sceneTarget;
      }
      if (rootSelectorTarget) {
        return rootSelectorTarget.querySelector(sel);
      }
      return null;
    },
    getElementById: (id: string) => {
      if (rootSelectorTarget && rootSelectorTarget.id === id) {
        return rootSelectorTarget;
      }
      return null;
    },
  };
}
