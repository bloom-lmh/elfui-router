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

import { useRef, type Ref } from "@elfui/reactivity";

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
  redirect?: string | RouteLocationRaw;
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

export const isNavigationFailure = (e: unknown): e is NavigationFailure => {
  return (
    typeof e === "object" &&
    e !== null &&
    "type" in e &&
    typeof (e as { type: unknown }).type === "string" &&
    (e as { type: string }).type in NavigationFailureType
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
  push(to: RouteLocationRaw): Promise<void | NavigationFailure>;
  replace(to: RouteLocationRaw): Promise<void | NavigationFailure>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  resolve(to: RouteLocationRaw): RouteLocation;
  beforeEach(guard: NavigationGuard): () => void;
  beforeResolve(guard: NavigationGuard): () => void;
  afterEach(cb: (to: RouteLocation, from: RouteLocation) => void): () => void;
  onError(cb: (err: unknown) => void): () => void;
  addRoute(route: RouteRecord): () => void;
  addRoute(parentName: string, route: RouteRecord): () => void;
  removeRoute(name: string): void;
  hasRoute(name: string): boolean;
  getRoutes(): RouteRecord[];
  isReady(): Promise<void>;
}

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
  const afterHooks: ((to: RouteLocation, from: RouteLocation) => void)[] = [];
  const errorHandlers: ((err: unknown) => void)[] = [];
  let memoryPath = options.initialPath;
  let isInitialNavigationDone = false;
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

  const navigate = async (
    to: RouteLocationRaw,
    replace: boolean
  ): Promise<void | NavigationFailure> => {
    const fromLoc = current.peek();
    let target = resolve(to);

    // redirect
    if (target.record?.redirect) {
      target = resolve(target.record.redirect);
    }

    // 重复导航
    if (isInitialNavigationDone && target.fullPath === fromLoc.fullPath) {
      return fail(NavigationFailureType.duplicated, target, fromLoc, "重复导航");
    }

    try {
      // 全局 beforeEach
      for (const guard of beforeGuards) {
        const result = await guard(target, fromLoc);
        if (result === false) {
          return fail(NavigationFailureType.aborted, target, fromLoc);
        }
        if (typeof result === "string" || (result && typeof result === "object")) {
          return navigate(result as RouteLocationRaw, replace);
        }
      }
      // 路由级 beforeEnter（按 matched 顺序）
      for (const r of target.matched) {
        const enters = !r.beforeEnter
          ? []
          : Array.isArray(r.beforeEnter)
            ? r.beforeEnter
            : [r.beforeEnter];
        for (const g of enters) {
          const result = await g(target, fromLoc);
          if (result === false) {
            return fail(NavigationFailureType.aborted, target, fromLoc);
          }
          if (typeof result === "string" || (result && typeof result === "object")) {
            return navigate(result as RouteLocationRaw, replace);
          }
        }
      }
      // 全局 beforeResolve
      for (const guard of beforeResolveGuards) {
        const result = await guard(target, fromLoc);
        if (result === false) {
          return fail(NavigationFailureType.aborted, target, fromLoc);
        }
        if (typeof result === "string" || (result && typeof result === "object")) {
          return navigate(result as RouteLocationRaw, replace);
        }
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

    writeUrl(target.fullPath, replace);
    current.value = target;
    isInitialNavigationDone = true;
    readyPromise.resolve();

    for (const cb of afterHooks) {
      try {
        cb(target, fromLoc);
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
    if (typeof window !== "undefined") window.history.back();
  };
  const forward = (): void => {
    if (typeof window !== "undefined") window.history.forward();
  };
  const go = (delta: number): void => {
    if (typeof window !== "undefined") window.history.go(delta);
  };

  if (typeof window !== "undefined") {
    if (mode === "hash") {
      window.addEventListener("hashchange", () => {
        current.value = resolve(readUrl());
      });
    } else if (mode === "history") {
      window.addEventListener("popstate", () => {
        current.value = resolve(readUrl());
      });
    }
  }

  const router: Router = {
    options,
    current,
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
    meta: leaf?.meta ?? {}
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
  const tryMatch = (
    routes: RouteRecord[],
    parentPath: string,
    parentChain: RouteRecord[]
  ): MatchResult | null => {
    for (const r of routes) {
      const fullPaths = expandAlias(joinPath(parentPath, r.path), r.alias);
      const chain = [...parentChain, r];

      // 子优先
      if (r.children && r.children.length > 0) {
        const childMatch = tryMatch(r.children, fullPaths[0]!, chain);
        if (childMatch) return childMatch;
      }
      // 自身（含 alias）
      for (const fullPath of fullPaths) {
        const params = matchPath(fullPath, path);
        if (params) {
          return { record: r, matched: chain, params };
        }
      }
    }
    return null;
  };
  const result = tryMatch(routes, "", []);
  if (result) return result;
  return { record: null, matched: [], params: {} };
};

const expandAlias = (mainPath: string, alias: string | string[] | undefined): string[] => {
  if (!alias) return [mainPath];
  const list = Array.isArray(alias) ? alias : [alias];
  return [mainPath, ...list];
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

    params[token.name] = decodeURIComponent(ap);
    pathIndex++;
  }
  if (pathIndex !== pathParts.length) return null;
  return params;
};

const parseParamToken = (raw: string): { name: string; optional: boolean; repeat: boolean } => {
  const body = raw.slice(1);
  const repeat = body.endsWith("*") || body.endsWith("+");
  const optional = body.endsWith("?") || body.endsWith("*");
  const base = repeat || optional ? body.slice(0, -1) : body;
  const groupIndex = base.indexOf("(");
  const name = groupIndex >= 0 ? base.slice(0, groupIndex) : base;
  return { name, optional, repeat };
};
