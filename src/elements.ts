// 路由相关 Custom Elements：<elf-router-link> / <elf-router-view>
//
// 这两个元素直接基于 HTMLElement 实现，避免依赖 elfui 主包形成循环。
//
// elf-link 作为 elf-router-link 的兼容别名同时注册。

import { effect, stop } from "@elfui/reactivity";
import { ensureCustomElement } from "@elfui/runtime";
import { ELF_SCOPED_SLOTS, type ScopedSlotFn } from "@elfui/runtime/internal";

import {
  getActiveRouter,
  type RouteComponent,
  type RouteLocation,
  type RouteLocationRaw,
  type RouteRecord
} from "./router";

const TAG_ROUTER_LINK = "elf-router-link";
const TAG_ROUTER_LINK_LEGACY = "elf-link";
const TAG_VIEW = "elf-router-view";

const RouterHTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export type RouterViewResolvedComponent = string | CustomElementConstructor;

type ResolvedRouteComponent = RouterViewResolvedComponent;
type AsyncRouteComponentResolveReason = 0 | 1;

interface RouteComponentCandidate {
  name: string;
  value: ResolvedRouteComponent;
}

interface AsyncRouteComponentResolveResult {
  component: ResolvedRouteComponent | null;
  exports: string[];
  candidates: string[];
  reason?: AsyncRouteComponentResolveReason;
}

export interface RouterLinkSlotScope {
  href: string;
  route: RouteLocation | null;
  current: RouteLocation | null;
  isActive: boolean;
  isExactActive: boolean;
  navigate: (event?: Event) => Promise<void>;
}

export interface RouterViewSlotScope {
  Component: RouterViewResolvedComponent;
  component: RouterViewResolvedComponent;
  route: RouteLocation;
  record: RouteRecord;
  props: Record<string, unknown>;
  depth: number;
  name: string;
}

interface HostWithScopedSlots extends HTMLElement {
  [ELF_SCOPED_SLOTS]?: Record<string, ScopedSlotFn>;
}

const ASYNC_COMPONENT_MISSING: AsyncRouteComponentResolveReason = 0;
const ASYNC_COMPONENT_AMBIGUOUS: AsyncRouteComponentResolveReason = 1;

const getScopedSlot = <S>(host: HTMLElement, name = "default"): ScopedSlotFn<S> | undefined => {
  return (host as HostWithScopedSlots)[ELF_SCOPED_SLOTS]?.[name] as ScopedSlotFn<S> | undefined;
};

const getFallbackHref = (to: RouteLocationRaw): string => {
  if (typeof to === "string") return to;
  return "path" in to ? to.path : "/";
};

const collectRenderedNodes = (node: Node | null): Node[] => {
  if (!node) return [];
  if (typeof DocumentFragment !== "undefined" && node instanceof DocumentFragment) {
    return Array.from(node.childNodes);
  }
  return [node];
};

const isElementNode = (node: Node): node is HTMLElement => node instanceof HTMLElement;

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  (typeof value === "object" || typeof value === "function") && value !== null;

const isRouteElementConstructor = (value: unknown): value is CustomElementConstructor => {
  if (typeof value !== "function") return false;
  const maybeCtor = value as {
    __elfDefinition?: unknown;
    prototype?: unknown;
  };
  if (maybeCtor.__elfDefinition !== undefined) return true;
  return (
    typeof HTMLElement !== "undefined" &&
    typeof maybeCtor.prototype === "object" &&
    maybeCtor.prototype instanceof HTMLElement
  );
};

const resolveRouteComponentValue = (
  value: unknown,
  allowBareString: boolean
): ResolvedRouteComponent | null => {
  if (typeof value === "string") {
    return allowBareString || value.includes("-") ? value : null;
  }
  return isRouteElementConstructor(value) ? value : null;
};

const isPreferredRouteExportName = (name: string): boolean =>
  name === "Page" || name === "Component" || /^Page[A-Z0-9_]/.test(name) || /Page$/.test(name);

const formatNames = (names: string[]): string => (names.length > 0 ? names.join(", ") : "(none)");

const resolveAsyncRouteComponent = (loaded: unknown): AsyncRouteComponentResolveResult => {
  const direct = resolveRouteComponentValue(loaded, true);
  if (direct) {
    return { component: direct, exports: [], candidates: [] };
  }

  if (!isObjectLike(loaded)) {
    return { component: null, exports: [], candidates: [], reason: ASYNC_COMPONENT_MISSING };
  }

  const mod = loaded;
  const exportNames = Object.keys(mod);
  const defaultComponent = resolveRouteComponentValue(mod.default, true);
  if (defaultComponent) {
    return { component: defaultComponent, exports: exportNames, candidates: ["default"] };
  }

  const candidates: RouteComponentCandidate[] = Object.entries(mod).flatMap(([name, value]) => {
    if (name === "default") return [];
    const component = resolveRouteComponentValue(value, false);
    return component ? [{ name, value: component }] : [];
  });

  if (candidates.length === 1) {
    return {
      component: candidates[0]!.value,
      exports: exportNames,
      candidates: [candidates[0]!.name]
    };
  }

  const preferred = candidates.filter(({ name }) => isPreferredRouteExportName(name));
  if (preferred.length === 1) {
    return {
      component: preferred[0]!.value,
      exports: exportNames,
      candidates: [preferred[0]!.name]
    };
  }

  const candidateNames = candidates.map(({ name }) => name);
  return {
    component: null,
    exports: exportNames,
    candidates: candidateNames,
    reason: candidateNames.length > 0 ? ASYNC_COMPONENT_AMBIGUOUS : ASYNC_COMPONENT_MISSING
  };
};

const reportAsyncRouteComponentError = (
  routePath: string,
  result: AsyncRouteComponentResolveResult
): void => {
  if (!__DEV__) {
    console.error(result.reason ?? 0);
    return;
  }

  const summary =
    result.reason === ASYNC_COMPONENT_AMBIGUOUS
      ? "异步组件模块有多个可用组件导出"
      : "异步组件模块没有可用组件导出";
  const candidateHint =
    result.reason === ASYNC_COMPONENT_AMBIGUOUS
      ? `候选导出: ${formatNames(result.candidates)}。`
      : "";

  const code =
    result.reason === ASYNC_COMPONENT_AMBIGUOUS
      ? "ELF_ROUTER_ASYNC_COMPONENT_AMBIGUOUS"
      : "ELF_ROUTER_ASYNC_COMPONENT_MISSING";
  console.error(
    `[elf-router]\n[${code}] ERROR <elf-router-view>\n  ${summary}（route: "${routePath}"）。${candidateHint}模块导出名: ${formatNames(result.exports)}。\n  hint: 期望 default 导出组件构造器，或只提供一个宏组件/HTMLElement 构造器命名导出。`
  );
};

const resolveRouteViewComponent = (
  record: RouteRecord,
  viewName: string
): RouteComponent | undefined => {
  if (record.components && viewName in record.components) return record.components[viewName];
  return viewName === "default" ? record.component : undefined;
};

const resolveRouteProps = (
  record: RouteRecord,
  route: RouteLocation
): Record<string, unknown> | null => {
  const option = record.props;
  if (option === true) return route.params;
  if (typeof option === "function") return option(route);
  if (option && typeof option === "object") return option;
  return null;
};

/** <elf-router-link to="/foo" replace active-class="x" exact-active-class="y">label</elf-router-link>
 *
 *  attribute:
 *  - to                    目标路径
 *  - replace               存在 → 用 router.replace 不入历史栈
 *  - active-class          当前路由匹配（前缀）时附加的 class（默认 "active"）
 *  - exact-active-class    当前路由完全相等时附加的 class（默认 "exact-active"）
 *  - custom                不自动包 <a>，改用 default scoped slot 或属性读取 href / active 状态
 */
class ElfRouterLinkElement extends RouterHTMLElement {
  public static get observedAttributes(): string[] {
    return ["to", "replace", "active-class", "exact-active-class", "custom"];
  }

  private __stop: (() => void) | undefined;
  private __to: RouteLocationRaw | null = null;

  public href = "";
  public isActive = false;
  public isExactActive = false;

  public get to(): RouteLocationRaw {
    return this.__to ?? this.getAttribute("to") ?? "";
  }

  public set to(value: RouteLocationRaw) {
    this.__to = value;
    if (this.isConnected) this.refresh();
  }

  private clickHandler = (e: MouseEvent): void => {
    if (this.hasAttribute("custom")) return;
    void this.navigateTo(this.to, e);
  };

  public attributeChangedCallback(): void {
    if (this.isConnected) this.refresh();
  }

  public connectedCallback(): void {
    this.addEventListener("click", this.clickHandler);
    this.refresh();

    const router = getActiveRouter();
    if (router) {
      const runner = effect(() => {
        // 触发依赖追踪
        void router.current.value.path;
        this.refresh();
      });
      this.__stop = () => stop(runner);
    }
  }

  public disconnectedCallback(): void {
    this.removeEventListener("click", this.clickHandler);
    this.__stop?.();
    this.__stop = undefined;
  }

  private async navigateTo(to: RouteLocationRaw, event?: Event): Promise<void> {
    if (
      event instanceof MouseEvent &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    ) {
      return;
    }
    event?.preventDefault();
    const router = getActiveRouter();
    if (!router) return;
    if (this.hasAttribute("replace")) {
      await router.replace(to);
    } else {
      await router.push(to);
    }
  }

  private refresh(): void {
    const router = getActiveRouter();
    const to = this.to;
    const target = router ? router.resolve(to) : null;
    const fallbackHref = getFallbackHref(to);
    const rawHref = target?.fullPath ?? fallbackHref;
    const href = router?.options.mode === "hash" ? `#${rawHref}` : rawHref;
    const current = router?.current.peek() ?? null;
    const targetPath = target?.path ?? fallbackHref;
    const isExact = current ? current.path === targetPath : false;
    const isActive = current ? isExact || current.path.startsWith(`${targetPath}/`) : false;
    const activeClass = this.getAttribute("active-class") ?? "active";
    const exactActiveClass = this.getAttribute("exact-active-class") ?? "exact-active";

    this.href = href;
    this.isActive = isActive;
    this.isExactActive = isExact;
    this.setAttribute("href", href);
    this.toggleAttribute("active", isActive);
    this.toggleAttribute("exact-active", isExact);
    this.classList.toggle(activeClass, isActive);
    this.classList.toggle(exactActiveClass, isExact);

    const scope: RouterLinkSlotScope = {
      href,
      route: target,
      current,
      isActive,
      isExactActive: isExact,
      navigate: (event?: Event) => this.navigateTo(to, event)
    };

    if (this.hasAttribute("custom")) {
      this.unwrapAnchor();
      const slot = getScopedSlot<RouterLinkSlotScope>(this);
      if (slot) {
        const node = slot(scope);
        this.replaceChildren();
        if (node) this.appendChild(node);
      }
    } else {
      this.ensureAnchor(href);
    }
  }

  private ensureAnchor(href: string): void {
    const existing = this.firstElementChild;
    if (
      this.childNodes.length === 1 &&
      existing instanceof HTMLAnchorElement &&
      existing.parentElement === this
    ) {
      existing.href = href;
      return;
    }

    const link = document.createElement("a");
    link.href = href;
    while (this.firstChild) {
      link.appendChild(this.firstChild);
    }
    this.appendChild(link);
  }

  private unwrapAnchor(): void {
    const existing = this.firstElementChild;
    if (
      this.childNodes.length !== 1 ||
      !(existing instanceof HTMLAnchorElement) ||
      existing.parentElement !== this
    ) {
      return;
    }
    while (existing.firstChild) {
      this.insertBefore(existing.firstChild, existing);
    }
    existing.remove();
  }
}

/** <elf-router-view depth="0" transition="fade"></elf-router-view>
 *
 *  attribute:
 *  - depth        嵌套层级（默认 0）
 *  - transition   过渡 class 前缀（启用时给新组件加 enter / leave class）
 *  - duration     过渡时长（ms，默认 200）
 */
class ElfRouterViewElement extends RouterHTMLElement {
  private __stop: (() => void) | undefined;
  private __currentNodes: Node[] = [];
  private __renderToken = 0;

  public connectedCallback(): void {
    const router = getActiveRouter();
    if (!router) {
      if (__DEV__) {
        console.warn(
          "[elf-router]\n[ELF_ROUTER_NO_ACTIVE_ROUTER] WARNING <elf-router-view>\n  没有激活的 router。\n  hint: 请先调用 createRouter(...)，或显式 setActiveRouter(router)。"
        );
      }
      return;
    }
    const runner = effect(() => {
      const loc = router.current.value;
      this.scheduleRender(loc);
    });
    this.__stop = () => stop(runner);
  }

  public disconnectedCallback(): void {
    this.__stop?.();
    this.__stop = undefined;
    this.__renderToken++;
  }

  private scheduleRender(loc: RouteLocation): void {
    const token = ++this.__renderToken;
    queueMicrotask(() => {
      if (!this.isConnected || token !== this.__renderToken) return;
      void this.render(loc, token);
    });
  }

  private async render(loc: RouteLocation, token: number): Promise<void> {
    const transitionName = this.getAttribute("transition");
    const duration = Number(this.getAttribute("duration") ?? 200);

    this.removeCurrentNodes(transitionName, duration);

    const depth = Number(this.getAttribute("depth") ?? 0);
    const viewName = this.getAttribute("name") ?? "default";
    const record = loc.matched[depth];
    if (!record) return;

    const c = resolveRouteViewComponent(record, viewName);
    if (!c) return;
    let resolvedComponent: ResolvedRouteComponent;

    if (typeof c === "string") {
      resolvedComponent = c;
    } else if (isRouteElementConstructor(c)) {
      resolvedComponent = c;
    } else if (typeof c === "function") {
      try {
        const mod = await (c as () => Promise<unknown>)();
        if (!this.isConnected || token !== this.__renderToken) return;
        const result = resolveAsyncRouteComponent(mod);
        if (result.component) {
          resolvedComponent = result.component;
        } else {
          reportAsyncRouteComponentError(record.path, result);
          return;
        }
      } catch (err) {
        if (__DEV__) {
          console.error(
            `[elf-router]\n[ELF_ROUTER_ASYNC_COMPONENT_LOAD] ERROR <elf-router-view>\n  异步组件加载失败（route: "${record.path}"）。\n  hint: 请检查动态 import 路径、导出组件名以及构建工具的 chunk 加载错误。`,
            err
          );
        } else {
          console.error(err);
        }
        return;
      }
    } else {
      if (__DEV__) {
        console.error(
          `[elf-router]\n[ELF_ROUTER_INVALID_COMPONENT] ERROR <elf-router-view>\n  无效的 route.component（route: "${record.path}"）。\n  hint: route.component 必须是 tag 字符串、CustomElement 构造器，或返回这些值/模块的异步函数。`,
          c
        );
      } else {
        console.error(c);
      }
      return;
    }

    const props = resolveRouteProps(record, loc);
    const slot = getScopedSlot<RouterViewSlotScope>(this);
    if (slot) {
      const node = slot({
        Component: resolvedComponent,
        component: resolvedComponent,
        route: loc,
        record,
        props: props ?? {},
        depth,
        name: viewName
      });
      this.appendRenderedNode(node, transitionName, duration);
      return;
    }

    const el = this.createComponentElement(resolvedComponent, loc, props);
    this.appendRenderedNode(el, transitionName, duration);
  }

  private createComponentElement(
    resolvedComponent: ResolvedRouteComponent,
    loc: RouteLocation,
    props: Record<string, unknown> | null
  ): HTMLElement {
    let el: HTMLElement;
    if (typeof resolvedComponent === "string") {
      el = document.createElement(resolvedComponent);
    } else {
      const ctor = resolvedComponent as unknown as { __elfDefinition?: { tag?: string } };
      el = ctor.__elfDefinition
        ? document.createElement(ensureCustomElement(resolvedComponent))
        : new (resolvedComponent as new () => HTMLElement)();
    }
    (el as unknown as { route?: RouteLocation }).route = loc;
    if (props) Object.assign(el, props);
    return el;
  }

  private removeCurrentNodes(transitionName: string | null, duration: number): void {
    const oldNodes = this.__currentNodes.filter((node) => node.parentNode);
    this.__currentNodes = [];
    if (oldNodes.length === 0) return;

    const remove = (): void => {
      for (const node of oldNodes) {
        node.parentNode?.removeChild(node);
      }
    };

    const elements = oldNodes.filter(isElementNode);
    if (!transitionName || elements.length === 0) {
      remove();
      return;
    }

    for (const el of elements) {
      el.classList.add(`${transitionName}-leave-from`);
      el.classList.add(`${transitionName}-leave-active`);
    }
    requestAnimationFrame(() => {
      for (const el of elements) {
        el.classList.remove(`${transitionName}-leave-from`);
        el.classList.add(`${transitionName}-leave-to`);
      }
    });
    setTimeout(remove, duration);
  }

  private appendRenderedNode(
    node: Node | null,
    transitionName: string | null,
    duration: number
  ): void {
    const nodes = collectRenderedNodes(node);
    if (nodes.length === 0 || !node) return;

    const elements = nodes.filter(isElementNode);
    if (transitionName) {
      for (const el of elements) {
        el.classList.add(`${transitionName}-enter-from`);
        el.classList.add(`${transitionName}-enter-active`);
      }
    }

    this.appendChild(node);
    this.__currentNodes = nodes;

    if (transitionName && elements.length > 0) {
      requestAnimationFrame(() => {
        for (const el of elements) {
          el.classList.remove(`${transitionName}-enter-from`);
          el.classList.add(`${transitionName}-enter-to`);
        }
      });
      setTimeout(() => {
        for (const el of elements) {
          el.classList.remove(`${transitionName}-enter-to`);
          el.classList.remove(`${transitionName}-enter-active`);
        }
      }, duration);
    }
  }
}

let registered = false;

/** 注册 elf-router-link / elf-link / elf-router-view 到 customElements */
export const registerRouterElements = (): void => {
  if (registered) return;
  if (typeof customElements === "undefined") return;
  if (!customElements.get(TAG_ROUTER_LINK)) {
    customElements.define(TAG_ROUTER_LINK, ElfRouterLinkElement);
  }
  if (!customElements.get(TAG_ROUTER_LINK_LEGACY)) {
    // 第二个标签复用同一个类不行（CE 规范不允许同一个 class 注册两个 tag）
    // 用一个 thin 子类
    class ElfLinkLegacy extends ElfRouterLinkElement {}
    customElements.define(TAG_ROUTER_LINK_LEGACY, ElfLinkLegacy);
  }
  if (!customElements.get(TAG_VIEW)) {
    customElements.define(TAG_VIEW, ElfRouterViewElement);
  }
  registered = true;
};
