// 路由 composables — useRouter / useRoute / useLink

import { toRaw, useEffect, useRef } from "@elfui/reactivity";
import { onUnmount, useHost } from "@elfui/runtime";

import {
  getActiveRouter,
  registerComponentGuard,
  type NavigationGuard,
  type RouteLocation,
  type RouteLocationRaw,
  type Router
} from "./router";

// `router.current.value` is replaced for each navigation. Returning that snapshot from
// useRoute() makes `const route = useRoute()` stale after the first navigation. Keep a
// stable, read-through facade so normal setup usage remains reactive just like
// Vue Router's `useRoute()`.
const routeFacades = new WeakMap<Router, RouteLocation>();

const sameRouteParams = (a: RouteLocation["params"], b: RouteLocation["params"]): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => {
      const left = a[key];
      const right = b[key];
      if (Array.isArray(left) || Array.isArray(right)) {
        return (
          Array.isArray(left) &&
          Array.isArray(right) &&
          left.length === right.length &&
          left.every((value, index) => value === right[index])
        );
      }
      return left === right;
    })
  );
};

const sameRouteRecord = (a: RouteLocation["record"], b: RouteLocation["record"]): boolean =>
  a !== null && b !== null && toRaw(a) === toRaw(b);

const getRouteFacade = (router: Router): RouteLocation => {
  const cached = routeFacades.get(router);
  if (cached) return cached;
  const facade = new Proxy({} as RouteLocation, {
    get(_target, key) {
      return Reflect.get(router.current.value, key);
    },
    has(_target, key) {
      return key in router.current.value;
    },
    ownKeys() {
      return Reflect.ownKeys(router.current.value);
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Object.getOwnPropertyDescriptor(router.current.value, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set() {
      if (__DEV__) {
        console.warn("[elf-router] Route locations are readonly.");
      }
      return false;
    }
  });
  routeFacades.set(router, facade);
  return facade;
};

/** 在 setup 内拿到当前 Router */
export const useRouter = (): Router | null => getActiveRouter();

/** 在 setup 内拿到当前激活的 RouteLocation（响应式 state） */
export const useRoute = (): RouteLocation => {
  const r = getActiveRouter();
  if (!r) {
    if (__DEV__) {
      console.warn(
        "[elf-router]\n[ELF_ROUTER_NO_ACTIVE_ROUTER] WARNING useRoute\n  没有激活的 router。\n  hint: 请先调用 createRouter(...)，或显式 setActiveRouter(router)。"
      );
    }
    return {
      href: "/",
      fullPath: "/",
      path: "/",
      record: null,
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {}
    };
  }
  return getRouteFacade(r);
};

export interface UseLinkResult {
  /** 当前 href（可填到 anchor 的 href 属性） */
  href: string;
  /** 是否激活 */
  isActive: boolean;
  /** 是否完全匹配 */
  isExactActive: boolean;
  /** 编程式跳转 */
  navigate: () => Promise<void>;
}

export interface UseLinkOptions {
  to: RouteLocationRaw;
  replace?: boolean;
}

/** 给自定义 link 组件的 headless API */
export const useLink = (input: RouteLocationRaw | UseLinkOptions): UseLinkResult => {
  const options =
    typeof input === "object" && input !== null && "to" in input
      ? (input as UseLinkOptions)
      : { to: input as RouteLocationRaw };
  const { to } = options;
  const router = getActiveRouter();
  const isActiveState = useRef(false);
  const isExactState = useRef(false);
  const fallbackHref = typeof to === "string" ? to : "path" in to ? to.path : "/";
  const href = router ? router.resolve(to).href : fallbackHref;

  if (router) {
    useEffect(() => {
      const current = router.current.value;
      const target = router.resolve(to);
      isExactState.value = Boolean(
        target.record &&
        sameRouteRecord(current.record, target.record) &&
        sameRouteParams(current.params, target.params)
      );
      isActiveState.value = Boolean(
        target.record && current.matched.some((record) => sameRouteRecord(record, target.record))
      );
    });
  }

  return {
    href,
    get isActive(): boolean {
      return isActiveState.value as boolean;
    },
    get isExactActive(): boolean {
      return isExactState.value as boolean;
    },
    navigate: async () => {
      if (!router) return;
      if (options.replace) await router.replace(to);
      else await router.push(to);
    }
  };
};

export const onBeforeRouteLeave = (guard: NavigationGuard): (() => void) => {
  const router = getActiveRouter();
  const host = useHost<HTMLElement & { __elfRouterRecord?: RouteLocation["record"] }>();
  const record = host.__elfRouterRecord ?? router?.current.peek().record;
  if (!router || !record) return () => undefined;
  const dispose = registerComponentGuard(router, "leave", record, guard);
  onUnmount(dispose);
  return dispose;
};

export const onBeforeRouteUpdate = (guard: NavigationGuard): (() => void) => {
  const router = getActiveRouter();
  const host = useHost<HTMLElement & { __elfRouterRecord?: RouteLocation["record"] }>();
  const record = host.__elfRouterRecord ?? router?.current.peek().record;
  if (!router || !record) return () => undefined;
  const dispose = registerComponentGuard(router, "update", record, guard);
  onUnmount(dispose);
  return dispose;
};
