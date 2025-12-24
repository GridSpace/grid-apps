import * as QuickJSModule from "../node_modules/quickjs-emscripten/dist/index.js";

// Re-export all the named exports
export const getQuickJS = QuickJSModule.getQuickJS;
export const getQuickJSSync = QuickJSModule.getQuickJSSync;
export const newQuickJSWASMModule = QuickJSModule.newQuickJSWASMModule;
export const newQuickJSAsyncWASMModule = QuickJSModule.newQuickJSAsyncWASMModule;
export const newAsyncRuntime = QuickJSModule.newAsyncRuntime;
export const newAsyncContext = QuickJSModule.newAsyncContext;
export const DEBUG_SYNC = QuickJSModule.DEBUG_SYNC;
export const DEBUG_ASYNC = QuickJSModule.DEBUG_ASYNC;
export const RELEASE_SYNC = QuickJSModule.RELEASE_SYNC;
export const RELEASE_ASYNC = QuickJSModule.RELEASE_ASYNC;
export const errors = QuickJSModule.errors;
export const memoizePromiseFactory = QuickJSModule.memoizePromiseFactory;
export const Lifetime = QuickJSModule.Lifetime;
export const Scope = QuickJSModule.Scope;
export const WeakLifetime = QuickJSModule.WeakLifetime;
export const StaticLifetime = QuickJSModule.StaticLifetime;
export const TestQuickJSWASMModule = QuickJSModule.TestQuickJSWASMModule;
export const isFail = QuickJSModule.isFail;
export const isSuccess = QuickJSModule.isSuccess;
export const assertSync = QuickJSModule.assertSync;
export const DeferredPromise = QuickJSModule.DeferredPromise;
export const shouldInterruptAfterDeadline = QuickJSModule.shouldInterruptAfterDeadline;

// Default export
export default QuickJSModule;
