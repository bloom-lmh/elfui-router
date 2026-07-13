// 路由核心
//
// 设计：
// - createRouter({ mode, routes }) 返回 Router 实例
// - 支持 hash / history / memory 三种模式
// - 路由记录 { path, component, name, redirect, alias, children, beforeEnter, ... }
// - 动态参数 /users/:id 解析为 params: { id: "..." }
// - query / hash 解析
// - 全局守卫 beforeEach / beforeResolve / afterEach + 路由级 beforeEnter
// - 当前激活路由暴露为 router.current（State，可用 useEffect / watch）
// - 命名路由 / addRoute / removeRoute / scrollBehavior / onError

import { toRaw, useRef, type Ref } from "@elfui/reactivity";

import { registerRouterElements } from "./elements";

export type RouterMode = "hash" | "history" | "memory";

/** 路由 meta，用户可通过 module augmentation 扩展 */
export interface RouteMeta {
  [key: string]: unknown;
}

export type RouteComponent = string | CustomElementConstructor | (() => Promise<unknown>);
export type RouteRecordProps =
  | boolean
  | Record<string, unknown>
  | ((route: RouteLocation) => Record<string, unknown>);

export interface RouteRecord {
  /** 路径模式，如 "/users/:id" */
  path: string;
  /**
   * 渲染的组件：
   * - string：标签名
   * - 构造器：CustomElementConstructor
   * - 函数：异步加载（() => import("./Page.ts")），支持 default 导出或唯一命名组件导出
   */
  component?: RouteComponent;
  /** 命名视图：<elf-router-view name="aside"> 会读取 components.aside */
  components?: Record<string, RouteComponent>;
  /** route props：true=透传 params；object=静态 props；function=从 route 计算 */
  props?: RouteRecordProps;
  /** 路由名（命名路由跳转用） */
  name?: string;
  /** 自定义元数据 */
  meta?: RouteMeta;
  /** 重定向：当命中此路径时跳转到目标 */
  redirect?: string | RouteLocationRaw | ((to: RouteLocation) => RouteLocationRaw);
  /** 别名：等价路径，命中时仍解析为本 record */
  alias?: string | string[];
  /** 嵌套子路由 */
  children?: RouteRecord[];
  /** 路由级守卫 */
  beforeEnter?: NavigationGuard | NavigationGuard[];
}

export interface RouteParams {
  [key: string]: string | string[] | undefined;
}

export interface RouteQuery {
  [key: string]: string | string[] | undefined;
}

/** typed routes 扩展点：用户可通过 module augmentation 增加 name -> params 映射。 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteNamedMap {}

type NamedRouteParams<Name extends string> = Name extends keyof RouteNamedMap
  ? RouteNamedMap[Name] extends { params: infer Params }
    ? Params
    : Record<string, string | number | Array<string | number> | undefined>
  : Record<string, string | number | Array<string | number> | undefined>;

type NamedRouteQuery<Name extends string> = Name extends keyof RouteNamedMap
  ? RouteNamedMap[Name] extends { query: infer Query }
    ? Query
    : Record<string, string | number | (string | number)[]>
  : Record<string, string | number | (string | number)[]>;

export interface RouteLocation {
  fullPath: string;
  path: string;
  /** 命中的叶子 RouteRecord */
  record: RouteRecord | null;
  /** 完整匹配链（从根到叶子） */
  matched: RouteRecord[];
  /** 命中的 name（如果有） */
  name?: string;
  /** 动态参数 */
  params: RouteParams;
  /** query 解析结果 */
  query: RouteQuery;
  /** hash（含 #） */
  hash: string;
  /** route meta（叶子的 meta） */
  meta: RouteMeta;
}

/** 命名路由跳转的 location 描述 */
export interface RouteLocationNamed<Name extends string = string> {
  name: Name;
  params?: NamedRouteParams<Name>;
  query?: NamedRouteQuery<Name>;
  hash?: string;
}
export interface RouteLocationPath {
  path: string;
  query?: Record<string, string | number | (string | number)[]>;
  hash?: string;
}

export type RouteLocationRaw = string | RouteLocationNamed | RouteLocationPath;
export type TypedRouteLocation<Name extends keyof RouteNamedMap & string> =
  RouteLocationNamed<Name>;

export type NavigationGuardResult = void | string | false | RouteLocationRaw;
export type NavigationGuard = (
  to: RouteLocation,
  from: RouteLocation
) => NavigationGuardResult | Promise<NavigationGuardResult>;

/** 导航失败原因 */
export const NavigationFailureType = {
  aborted: "aborted",
  cancelled: "cancelled",
  duplicated: "duplicated"
} as const;
export type NavigationFailureType =
  (typeof NavigationFailureType)[keyof typeof NavigationFailureType];

export interface NavigationFailure {
  type: NavigationFailureType;
  to: RouteLocation;
  from: RouteLocation;
  message?: string;
}

export const isNavigationFailure = (
  e: unknown,
  type?: NavigationFailureType
): e is NavigationFailure => {
  return (
    typeof e === "object" &&
    e !== null &&
    "type" in e &&
    typeof (e as { type: unknown }).type === "string" &&
    (e as { type: string }).type in NavigationFailureType &&
    (type === undefined || (e as { type: string }).type === type)
  );
};

/** scroll 行为 */
export interface ScrollPosition {
  top?: number;
  left?: number;
  el?: string | Element;
  behavior?: ScrollBehavior;
}
export type ScrollBehaviorFn = (
  to: RouteLocation,
  from: RouteLocation,
  savedPosition: ScrollPosition | null
) => ScrollPosition | null | Promise<ScrollPosition | null>;

export interface RouterOptions {
  mode?: RouterMode;
  routes: RouteRecord[];
  initialPath?: string;
  scrollBehavior?: ScrollBehaviorFn;
}

export interface Router {
  options: Required<Omit<RouterOptions, "scrollBehavior">> & {
    scrollBehavior?: ScrollBehaviorFn;
  };
  current: Ref<RouteLocation>;
  /** Vue Router 4 compatible alias for the reactive current location. */
  currentRoute: Ref<RouteLocation>;
  push(to: RouteLocationRaw): Promise<void | NavigationFailure>;
  replace(to: RouteLocationRaw): Promise<void | NavigationFailure>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  resolve(to: RouteLocationRaw): RouteLocation;
  beforeEach(guard: NavigationGuard): () => void;
  beforeResolve(guard: NavigationGuard): () => void;
  afterEach(
    cb: (to: RouteLocation, from: RouteLocation, failure?: NavigationFailure) => void
  ): () => void;
  onError(cb: (err: unknown) => void): () => void;
  addRoute(route: RouteRecord): () => void;
  addRoute(parentName: string, route: RouteRecord): () => void;
  removeRoute(name: string): void;
  hasRoute(name: string): boolean;
  getRoutes(): RouteRecord[];
  isReady(): Promise<void>;
}

type ComponentGuardKind = "leave" | "update";

interface ComponentGuardEntry {
  record: RouteRecord;
  guard: NavigationGuard;
}

interface ComponentGuardStore {
  leave: ComponentGuardEntry[];
  update: ComponentGuardEntry[];
}

const componentGuardStores = new WeakMap<Router, ComponentGuardStore>();
const MAX_REDIRECTS = 20;

/** @internal Used by component guard composables; applications should use the composables. */
export const registerComponentGuard = (
  router: Router,
  kind: ComponentGuardKind,
  record: RouteRecord,
  guard: NavigationGuard
): (() => void) => {
  const store = componentGuardStores.get(router);
  if (!store) return () => undefined;
  const entry = { record, guard };
  store[kind].push(entry);
  return () => {
    const index = store[kind].indexOf(entry);
    if (index >= 0) store[kind].splice(index, 1);
  };
};

const EMPTY_LOCATION: RouteLocation = {
  fullPath: "/",
  path: "/",
  record: null,
  matched: [],
  params: {},
  query: {},
  hash: "",
  meta: {}
};

let activeRouter: Router | null = null;

export const setActiveRouter = (router: Router | null): void => {
  activeRouter = router;
};

export const getActiveRouter = (): Router | null => activeRouter;

const sameRouteRecord = (a: RouteRecord, b: RouteRecord): boolean => toRaw(a) === toRaw(b);

const recordIndex = (records: RouteRecord[], record: RouteRecord): number =>
  records.findIndex((item) => sameRouteRecord(item, record));

/** 创建路由器 */
export const createRouter = (opts: RouterOptions): Router => {
  const mode = opts.mode ?? "hash";
  const options = {
    mode,
    routes: opts.routes,
    initialPath: opts.initialPath ?? "/",
    scrollBehavior: opts.scrollBehavior
  } as Required<Omit<RouterOptions, "scrollBehavior">> & {
    scrollBehavior?: ScrollBehaviorFn;
  };

  const current = useRef<RouteLocation>({ ...EMPTY_LOCATION });
  const beforeGuards: NavigationGuard[] = [];
  const beforeResolveGuards: NavigationGuard[] = [];
  const afterHooks: ((to: RouteLocation, from: RouteLocation, failure?: NavigationFailure) => void)[] =
    [];
  const errorHandlers: ((err: unknown) => void)[] = [];
  let memoryPath = options.initialPath;
  let memoryEntries = [memoryPath];
  let memoryIndex = 0;
  let isInitialNavigationDone = false;
  let navigationId = 0;
  const readyPromise: { resolve: () => void; promise: Promise<void> } = (() => {
    let res: () => void = () => {};
    const p = new Promise<void>((r) => {
      res = r;
    });
    return { resolve: res, promise: p };
  })();

  const readUrl = (): string => {
    if (mode === "hash") {
      const hash = (typeof window !== "undefined" ? window.location.hash : "") || "#/";
      return hash.startsWith("#") ? hash.slice(1) : hash;
    }
    if (mode === "history") {
      return typeof window !== "undefined"
        ? window.location.pathname + window.location.search + window.location.hash
        : "/";
    }
    return memoryPath;
  };

  const writeUrl = (path: string, replace: boolean): void => {
    if (mode === "hash") {
      if (typeof window === "undefined") return;
      if (replace) {
        const url = window.location.href.replace(/#.*$/, "") + `#${path}`;
        window.history.replaceState(null, "", url);
      } else {
        window.location.hash = path;
      }
    } else if (mode === "history") {
      if (typeof window === "undefined") return;
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    } else {
      if (replace) {
        memoryEntries[memoryIndex] = path;
      } else {
        memoryEntries = memoryEntries.slice(0, memoryIndex + 1);
        memoryEntries.push(path);
        memoryIndex++;
      }
      memoryPath = path;
    }
  };

  const resolve = (to: RouteLocationRaw): RouteLocation => {
    if (typeof to === "string") {
      return parseLocation(to, options.routes);
    }
    if ("name" in to && to.name) {
      const path = stringifyNamed(to, options.routes);
      const loc = parseLocation(path, options.routes);
      return loc;
    }
    // path-based
    let p = (to as RouteLocationPath).path ?? "/";
    const queryStr = stringifyQuery((to as RouteLocationPath).query);
    if (queryStr) p += `?${queryStr}`;
    if ((to as RouteLocationPath).hash) p += (to as RouteLocationPath).hash;
    return parseLocation(p, options.routes);
  };

  const fail = (
    type: NavigationFailureType,
    to: RouteLocation,
    from: RouteLocation,
    message?: string
  ): NavigationFailure => {
    const f: NavigationFailure = { type, to, from };
    if (message !== undefined) f.message = message;
    return f;
  };

  const runAfterHooks = (
    to: RouteLocation,
    from: RouteLocation,
    failure?: NavigationFailure
  ): void => {
    for (const cb of afterHooks) {
      try {
        cb(to, from, failure);
      } catch (err) {
        if (__DEV__) {
          console.error(
            "[elf-router]\n[ELF_ROUTER_AFTER_EACH_ERROR] ERROR router.afterEach\n  afterEach hook 执行失败。\n  hint: 请检查 afterEach 回调内部异常；该错误不会中断已经完成的导航。",
            err
          );
        } else {
          console.error(err);
        }
      }
    }
  };

  const navigate = async (
    to: RouteLocationRaw,
    replace: boolean,
    source: "push" | "pop" = "push",
    redirectDepth = 0
  ): Promise<void | NavigationFailure> => {
    const id = ++navigationId;
    const fromLoc = current.peek();
    let target = resolve(to);

    // redirect
    if (target.record?.redirect) {
      if (redirectDepth >= MAX_REDIRECTS) {
        const error = new Error(`Infinite redirect detected while navigating to "${target.fullPath}".`);
        for (const handler of errorHandlers) {
          try {
            handler(error);
          } catch {
            // Error handlers are isolated from navigation failures.
          }
        }
        throw error;
      }
      const redirect = target.record.redirect;
      return navigate(
        typeof redirect === "function" ? redirect(target) : redirect,
        replace,
        source,
        redirectDepth + 1
      );
    }

    // 重复导航
    if (isInitialNavigationDone && target.fullPath === fromLoc.fullPath) {
      return fail(NavigationFailureType.duplicated, target, fromLoc, "重复导航");
    }

    try {
      const runStage = async (
        guards: NavigationGuard[]
      ): Promise<{ handled: boolean; result?: void | NavigationFailure }> => {
        for (const guard of guards) {
          const result = await guard(target, fromLoc);
          if (id !== navigationId) {
            const failure = fail(NavigationFailureType.cancelled, target, fromLoc);
            runAfterHooks(target, fromLoc, failure);
            return { handled: true, result: failure };
          }
          if (result === false) {
            const failure = fail(NavigationFailureType.aborted, target, fromLoc);
            runAfterHooks(target, fromLoc, failure);
            return { handled: true, result: failure };
          }
          if (typeof result === "string" || (result && typeof result === "object")) {
            return {
              handled: true,
              result: await navigate(result as RouteLocationRaw, replace, source, redirectDepth + 1)
            };
          }
        }
        return { handled: false };
      };

      const componentGuards = componentGuardStores.get(router)!;
      const leaving = componentGuards.leave
        .filter(
          ({ record }) => recordIndex(fromLoc.matched, record) >= 0 && recordIndex(target.matched, record) < 0
        )
        .sort((a, b) => recordIndex(fromLoc.matched, b.record) - recordIndex(fromLoc.matched, a.record))
        .map(({ guard }) => guard);
      if (leaving.length > 0) {
        const leaveOutcome = await runStage(leaving);
        if (leaveOutcome.handled) return leaveOutcome.result;
      }

      if (beforeGuards.length > 0) {
        const beforeEachOutcome = await runStage(beforeGuards);
        if (beforeEachOutcome.handled) return beforeEachOutcome.result;
      }

      const updating = componentGuards.update
        .filter(
          ({ record }) =>
            target.fullPath !== fromLoc.fullPath &&
            recordIndex(fromLoc.matched, record) >= 0 &&
            recordIndex(target.matched, record) >= 0
        )
        .sort((a, b) => recordIndex(fromLoc.matched, a.record) - recordIndex(fromLoc.matched, b.record))
        .map(({ guard }) => guard);
      if (updating.length > 0) {
        const updateOutcome = await runStage(updating);
        if (updateOutcome.handled) return updateOutcome.result;
      }

      const entering = target.matched
        .filter((record) => recordIndex(fromLoc.matched, record) < 0)
        .flatMap((record) => {
        if (!record.beforeEnter) return [];
        return Array.isArray(record.beforeEnter) ? record.beforeEnter : [record.beforeEnter];
        });
      if (entering.length > 0) {
        const beforeEnterOutcome = await runStage(entering);
        if (beforeEnterOutcome.handled) return beforeEnterOutcome.result;
      }

      if (beforeResolveGuards.length > 0) {
        const beforeResolveOutcome = await runStage(beforeResolveGuards);
        if (beforeResolveOutcome.handled) return beforeResolveOutcome.result;
      }
    } catch (err) {
      for (const h of errorHandlers) {
        try {
          h(err);
        } catch {
          // 隔离
        }
      }
      throw err;
    }

    if (id !== navigationId) {
      return fail(NavigationFailureType.cancelled, target, fromLoc);
    }

    if (source === "push") writeUrl(target.fullPath, replace);
    current.value = target;
    isInitialNavigationDone = true;
    readyPromise.resolve();

    runAfterHooks(target, fromLoc);

    // scroll
    if (options.scrollBehavior && typeof window !== "undefined") {
      try {
        const pos = await options.scrollBehavior(target, fromLoc, null);
        if (pos) {
          if (pos.el) {
            const el = typeof pos.el === "string" ? document.querySelector(pos.el) : pos.el;
            const sIntoOpts: ScrollIntoViewOptions = {};
            if (pos.behavior !== undefined) sIntoOpts.behavior = pos.behavior;
            el?.scrollIntoView(sIntoOpts);
          } else {
            const opts: ScrollToOptions = {};
            if (pos.top !== undefined) opts.top = pos.top;
            if (pos.left !== undefined) opts.left = pos.left;
            if (pos.behavior !== undefined) opts.behavior = pos.behavior;
            window.scrollTo(opts);
          }
        }
      } catch (err) {
        if (__DEV__) {
          console.error(
            "[elf-router]\n[ELF_ROUTER_SCROLL_BEHAVIOR_ERROR] ERROR router.scrollBehavior\n  scrollBehavior 执行失败。\n  hint: 请检查 scrollBehavior 返回值，或目标 el 是否存在。",
            err
          );
        } else {
          console.error(err);
        }
      }
    }
    return undefined;
  };

  const push = (to: RouteLocationRaw): Promise<void | NavigationFailure> => navigate(to, false);
  const replace = (to: RouteLocationRaw): Promise<void | NavigationFailure> => navigate(to, true);

  const back = (): void => {
    if (mode === "memory") {
      go(-1);
    } else if (typeof window !== "undefined") window.history.back();
  };
  const forward = (): void => {
    if (mode === "memory") {
      go(1);
    } else if (typeof window !== "undefined") window.history.forward();
  };
  const go = (delta: number): void => {
    if (mode === "memory") {
      const nextIndex = memoryIndex + Math.trunc(delta);
      if (nextIndex < 0 || nextIndex >= memoryEntries.length || nextIndex === memoryIndex) return;
      const previousIndex = memoryIndex;
      const previousPath = memoryPath;
      const nextPath = memoryEntries[nextIndex]!;
      memoryIndex = nextIndex;
      memoryPath = nextPath;
      void navigate(nextPath, true, "pop").then((result) => {
        if (result && memoryIndex === nextIndex) {
          memoryIndex = previousIndex;
          memoryPath = previousPath;
        }
      });
      return;
    }
    if (typeof window !== "undefined") window.history.go(delta);
  };

  if (typeof window !== "undefined") {
    if (mode === "hash") {
      window.addEventListener("hashchange", () => {
        void navigate(readUrl(), true, "pop");
      });
    } else if (mode === "history") {
      window.addEventListener("popstate", () => {
        void navigate(readUrl(), true, "pop");
      });
    }
  }

  const router: Router = {
    options,
    current,
    currentRoute: current,
    push,
    replace,
    back,
    forward,
    go,
    resolve,
    beforeEach(guard) {
      beforeGuards.push(guard);
      return () => {
        const i = beforeGuards.indexOf(guard);
        if (i >= 0) beforeGuards.splice(i, 1);
      };
    },
    beforeResolve(guard) {
      beforeResolveGuards.push(guard);
      return () => {
        const i = beforeResolveGuards.indexOf(guard);
        if (i >= 0) beforeResolveGuards.splice(i, 1);
      };
    },
    afterEach(cb) {
      afterHooks.push(cb);
      return () => {
        const i = afterHooks.indexOf(cb);
        if (i >= 0) afterHooks.splice(i, 1);
      };
    },
    onError(cb) {
      errorHandlers.push(cb);
      return () => {
        const i = errorHandlers.indexOf(cb);
        if (i >= 0) errorHandlers.splice(i, 1);
      };
    },
    addRoute(...args: unknown[]): () => void {
      let parentName: string | undefined;
      let route: RouteRecord;
      if (args.length === 2) {
        parentName = args[0] as string;
        route = args[1] as RouteRecord;
      } else {
        route = args[0] as RouteRecord;
      }
      if (parentName) {
        const parent = findRouteByName(options.routes, parentName);
        if (!parent) {
          if (__DEV__) {
            console.warn(
              `[elf-router]\n[ELF_ROUTER_ADD_ROUTE_PARENT_MISSING] WARNING router.addRoute\n  未找到父路由 "${parentName}"。\n  hint: 请确认父路由 name 已注册，或改用 addRoute(route) 添加顶层路由。`
            );
          }
          return () => {};
        }
        if (!parent.children) parent.children = [];
        parent.children.push(route);
        return () => {
          const i = parent.children!.indexOf(route);
          if (i >= 0) parent.children!.splice(i, 1);
        };
      }
      options.routes.push(route);
      return () => {
        const i = options.routes.indexOf(route);
        if (i >= 0) options.routes.splice(i, 1);
      };
    },
    removeRoute(name) {
      removeRouteByName(options.routes, name);
    },
    hasRoute(name) {
      return findRouteByName(options.routes, name) !== null;
    },
    getRoutes() {
      const all: RouteRecord[] = [];
      const walk = (rs: RouteRecord[]): void => {
        for (const r of rs) {
          all.push(r);
          if (r.children) walk(r.children);
        }
      };
      walk(options.routes);
      return all;
    },
    isReady() {
      return readyPromise.promise;
    }
  };

  componentGuardStores.set(router, { leave: [], update: [] });

  // 初次解析
  current.value = resolve(readUrl());
  isInitialNavigationDone = true;
  readyPromise.resolve();

  // 自动激活：让 useRouter / getActiveRouter / <elf-router-view> / <elf-link> 立即可用
  setActiveRouter(router);
  registerRouterElements();

  return router;
};

// ---------- helpers ----------

const stringifyQuery = (q: Record<string, unknown> | undefined): string => {
  if (!q) return "";
  const parts: string[] = [];
  for (const k of Object.keys(q)) {
    const v = q[k];
    if (Array.isArray(v)) {
      for (const item of v)
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
    } else if (v !== undefined && v !== null) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join("&");
};

const stringifyNamed = (loc: RouteLocationNamed, routes: RouteRecord[]): string => {
  const route = findRouteByName(routes, loc.name);
  if (!route) {
    if (__DEV__) {
      console.warn(
        `[elf-router]\n[ELF_ROUTER_NAMED_ROUTE_MISSING] WARNING router.resolve\n  未找到名为 "${loc.name}" 的路由。\n  hint: 请检查 routes 中的 name，或改用 path 导航。`
      );
    }
    return "/";
  }
  const fullPattern = computeFullPath(routes, route, "") ?? route.path;
  let path = stringifyPathParams(fullPattern, loc.params);
  const q = stringifyQuery(loc.query);
  if (q) path += `?${q}`;
  if (loc.hash) path += loc.hash;
  return path;
};

const stringifyPathParams = (
  pattern: string,
  params: Record<string, string | number | Array<string | number> | undefined> | undefined
): string => {
  const parts = pattern.split("/");
  const out = parts.flatMap((part) => {
    if (!part.startsWith(":")) return [part];
    const token = parseParamToken(part);
    const value = params?.[token.name];
    if (value == null) return token.optional ? [] : [""];
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => encodeURIComponent(String(item)));
  });
  const path = out.join("/");
  return path === "" ? "/" : path.replace(/\/+/g, "/");
};

const computeFullPath = (
  routes: RouteRecord[],
  target: RouteRecord,
  parent: string
): string | null => {
  for (const r of routes) {
    const full = joinPath(parent, r.path);
    if (r === target) return full;
    if (r.children) {
      const f = computeFullPath(r.children, target, full);
      if (f) return f;
    }
  }
  return null;
};

const findRouteByName = (routes: RouteRecord[], name: string): RouteRecord | null => {
  for (const r of routes) {
    if (r.name === name) return r;
    if (r.children) {
      const f = findRouteByName(r.children, name);
      if (f) return f;
    }
  }
  return null;
};

const removeRouteByName = (routes: RouteRecord[], name: string): boolean => {
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!;
    if (r.name === name) {
      routes.splice(i, 1);
      return true;
    }
    if (r.children && removeRouteByName(r.children, name)) return true;
  }
  return false;
};

const parseLocation = (input: string, routes: RouteRecord[]): RouteLocation => {
  let rest = input;
  let hash = "";
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  let queryStr = "";
  const qIdx = rest.indexOf("?");
  if (qIdx >= 0) {
    queryStr = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }
  const path = rest || "/";

  const query = parseQuery(queryStr);
  const matched = matchRoute(path, routes);
  const leaf = matched.record;
  const loc: RouteLocation = {
    fullPath: input || "/",
    path,
    record: leaf,
    matched: matched.matched,
    params: matched.params,
    query,
    hash,
    // Vue Router style: child meta overrides parent meta while preserving inherited policies.
    meta: Object.assign({}, ...matched.matched.map((record) => record.meta ?? {}))
  };
  if (leaf?.name !== undefined) loc.name = leaf.name;
  return loc;
};

const parseQuery = (s: string): RouteQuery => {
  const out: RouteQuery = {};
  if (!s) return out;
  for (const part of s.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
    const v = decodeURIComponent(eq < 0 ? "" : part.slice(eq + 1));
    const existing = out[k];
    if (existing === undefined) {
      out[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
    } else {
      out[k] = [existing, v];
    }
  }
  return out;
};

interface MatchResult {
  record: RouteRecord | null;
  matched: RouteRecord[];
  params: RouteParams;
}

const matchRoute = (path: string, routes: RouteRecord[]): MatchResult => {
  interface Candidate {
    record: RouteRecord;
    matched: RouteRecord[];
    path: string;
    score: number;
    order: number;
  }

  const candidates: Candidate[] = [];
  let order = 0;
  const collect = (
    records: RouteRecord[],
    parentPaths: string[],
    parentChain: RouteRecord[]
  ): void => {
    for (const record of records) {
      const fullPaths = parentPaths.flatMap((parentPath) =>
        expandAlias(joinPath(parentPath, record.path), record.alias, parentPath)
      );
      const chain = [...parentChain, record];
      for (const fullPath of fullPaths) {
        candidates.push({
          record,
          matched: chain,
          path: fullPath,
          score: scorePath(fullPath),
          order: order++
        });
      }
      if (record.children?.length) collect(record.children, fullPaths, chain);
    }
  };

  collect(routes, [""], []);
  let best: MatchResult | null = null;
  let bestScore = -Infinity;
  let bestDepth = -1;
  let bestOrder = Infinity;
  for (const candidate of candidates) {
    const params = matchPath(candidate.path, path);
    if (
      params &&
      (candidate.score > bestScore ||
        (candidate.score === bestScore &&
          (candidate.matched.length > bestDepth ||
            (candidate.matched.length === bestDepth && candidate.order < bestOrder))))
    ) {
      best = { record: candidate.record, matched: candidate.matched, params };
      bestScore = candidate.score;
      bestDepth = candidate.matched.length;
      bestOrder = candidate.order;
    }
  }
  if (best) return best;
  return { record: null, matched: [], params: {} };
};

const expandAlias = (
  mainPath: string,
  alias: string | string[] | undefined,
  parentPath: string
): string[] => {
  if (!alias) return [mainPath];
  const list = Array.isArray(alias) ? alias : [alias];
  return [mainPath, ...list.map((item) => joinPath(parentPath, item))];
};

const scorePath = (pattern: string): number => {
  return pattern
    .split("/")
    .filter(Boolean)
    .reduce((score, segment) => {
      if (!segment.startsWith(":")) return score + 40;
      const token = parseParamToken(segment);
      if (token.repeat) return score;
      return score + (token.optional ? 10 : 20);
    }, 0);
};

const joinPath = (parent: string, child: string): string => {
  if (!parent) return child;
  if (child.startsWith("/")) return child;
  return `${parent.replace(/\/$/, "")}/${child}`;
};

const matchPath = (pattern: string, path: string): RouteParams | null => {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  const params: RouteParams = {};

  let pathIndex = 0;
  for (let patternIndex = 0; patternIndex < patternParts.length; patternIndex++) {
    const pp = patternParts[patternIndex]!;
    const ap = pathParts[pathIndex];
    if (!pp.startsWith(":")) {
      if (pp !== ap) return null;
      pathIndex++;
      continue;
    }

    const token = parseParamToken(pp);
    if (token.repeat) {
      const rest = pathParts.slice(pathIndex).map((part) => decodeURIComponent(part));
      if (!token.optional && rest.length === 0) return null;
      if (token.pattern && !rest.every((part) => new RegExp(`^(?:${token.pattern})$`).test(part))) {
        return null;
      }
      params[token.name] = rest;
      pathIndex = pathParts.length;
      continue;
    }

    if (ap === undefined) {
      if (token.optional) {
        params[token.name] = undefined;
        continue;
      }
      return null;
    }

    if (
      token.optional &&
      patternParts[patternIndex + 1] &&
      !patternParts[patternIndex + 1]!.startsWith(":") &&
      patternParts[patternIndex + 1] === ap
    ) {
      params[token.name] = undefined;
      continue;
    }

    const value = decodeURIComponent(ap);
    if (token.pattern && !new RegExp(`^(?:${token.pattern})$`).test(value)) return null;
    params[token.name] = value;
    pathIndex++;
  }
  if (pathIndex !== pathParts.length) return null;
  return params;
};

const parseParamToken = (
  raw: string
): { name: string; optional: boolean; repeat: boolean; pattern?: string } => {
  const body = raw.slice(1);
  const repeat = body.endsWith("*") || body.endsWith("+");
  const optional = body.endsWith("?") || body.endsWith("*");
  const base = repeat || optional ? body.slice(0, -1) : body;
  const groupIndex = base.indexOf("(");
  const name = groupIndex >= 0 ? base.slice(0, groupIndex) : base;
  const pattern = groupIndex >= 0 && base.endsWith(")") ? base.slice(groupIndex + 1, -1) : undefined;
  return pattern ? { name, optional, repeat, pattern } : { name, optional, repeat };
};
