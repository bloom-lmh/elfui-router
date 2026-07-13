// @elfui/router — ElfUI 路由
//
// 当前进度：F1 基础 + F5 Composable
//
// API：
// - createRouter({ mode, routes }) -> Router
// - <elf-link to="/foo"> / <elf-router-view>
// - useRouter() / useRoute() / useLink({ to })
// - 动态参数 :id、query、hash
//
// 待补：F2 嵌套 / F3 守卫与异步组件 / F4 高级特性

export {
  createRouter,
  createMemoryHistory,
  createWebHashHistory,
  createWebHistory,
  isNavigationFailure,
  setActiveRouter,
  getActiveRouter,
  NavigationFailureType,
  type Router,
  type RouterMode,
  type RouterHistory,
  type RouterOptions,
  type ResolvedRouterOptions,
  type RouteRecord,
  type RouteComponent,
  type RouteRecordProps,
  type RouteParams,
  type RouteQuery,
  type RouteLocation,
  type RouteLocationRaw,
  type RouteLocationNamed,
  type RouteLocationPath,
  type RouteMeta,
  type RouteNamedMap,
  type TypedRouteLocation,
  type NavigationFailure,
  type NavigationGuard,
  type NavigationGuardResult,
  type ScrollPosition,
  type ScrollBehaviorFn
} from "./router";

export {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRouter,
  useRoute,
  useLink,
  type UseLinkResult
} from "./composable";

export {
  registerRouterElements,
  type RouterLinkSlotScope,
  type RouterViewResolvedComponent,
  type RouterViewSlotScope
} from "./elements";
