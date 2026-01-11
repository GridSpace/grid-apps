/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * QuickJS VM Wrapper
 * Provides a simplified interface for working with QuickJS contexts
 */

import { getQuickJS } from '../ext/quickjs.js';

let quickJSInstance = null;

/**
 * Get or initialize the QuickJS singleton instance
 */
async function getQuickJSInstance() {
    if (!quickJSInstance) {
        quickJSInstance = await getQuickJS();
    }
    return quickJSInstance;
}

/**
 * QuickJS VM wrapper with helper methods
 * Automatically manages a QuickJS context lifecycle
 */
class QuickJSVM {
    /**
     * Create a new QuickJS VM context
     * @param {Object} options - Optional VM configuration
     */
    constructor(options = {}) {
        this.vm = null;
        this.disposed = false;
        this.initPromise = this._init(options);
    }

    /**
     * Internal initialization (async)
     */
    async _init(options) {
        const QuickJS = await getQuickJSInstance();
        this.vm = QuickJS.newContext(options);
    }

    /**
     * Ensure VM is initialized before use
     */
    async ready() {
        await this.initPromise;
        if (this.disposed) {
            throw new Error('VM has been disposed');
        }
        return this;
    }

    /**
     * Set multiple variables in the global context
     * @param {Object} obj - Object with key/value pairs to set as globals
     * @example
     * vm.setContext({
     *     x: 123,
     *     config: { width: 800, height: 600 },
     *     items: [1, 2, 3]
     * });
     */
    setContext(obj) {
        for (const [key, value] of Object.entries(obj)) {
            const handle = this.jsToVm(value);
            this.vm.setProp(this.vm.global, key, handle);
            handle.dispose();
        }
        return this;
    }

    /**
     * Set a single global variable
     * @param {string} name - Variable name
     * @param {*} value - JavaScript value to set
     * @example
     * vm.set('x', 123);
     * vm.set('config', { width: 800 });
     */
    set(name, value) {
        const handle = this.jsToVm(value);
        this.vm.setProp(this.vm.global, name, handle);
        handle.dispose();
        return this;
    }

    /**
     * Get a global variable value
     * @param {string} name - Variable name
     * @returns {*} JavaScript value
     * @example
     * const x = vm.get('x'); // 123
     */
    get(name) {
        const handle = this.vm.getProp(this.vm.global, name);
        const value = this.vm.dump(handle);
        handle.dispose();
        return value;
    }

    /**
     * Convert JavaScript value to QuickJS handle
     * @param {*} value - JavaScript value
     * @returns {QuickJSHandle} QuickJS handle (caller must dispose)
     */
    jsToVm(value) {
        // Handle primitives
        if (value === null) {
            return this.vm.null;
        }

        if (value === undefined) {
            return this.vm.undefined;
        }

        if (typeof value === 'number') {
            return this.vm.newNumber(value);
        }

        if (typeof value === 'string') {
            return this.vm.newString(value);
        }

        if (typeof value === 'boolean') {
            return value ? this.vm.true : this.vm.false;
        }

        // Handle arrays
        if (Array.isArray(value)) {
            const arr = this.vm.newArray();
            for (let i = 0; i < value.length; i++) {
                const itemHandle = this.jsToVm(value[i]);
                this.vm.setProp(arr, i, itemHandle);
                itemHandle.dispose();
            }
            return arr;
        }

        // Handle objects
        if (typeof value === 'object') {
            const obj = this.vm.newObject();
            for (const [k, v] of Object.entries(value)) {
                const propHandle = this.jsToVm(v);
                this.vm.setProp(obj, k, propHandle);
                propHandle.dispose();
            }
            return obj;
        }

        // Fallback for unsupported types
        console.warn(`Unsupported type for VM: ${typeof value}, setting to undefined`);
        return this.vm.undefined;
    }

    /**
     * Evaluate JavaScript code in the VM
     * @param {string} code - JavaScript code to evaluate
     * @returns {*} Result value or throws error
     * @example
     * const result = vm.eval('1 + 2'); // 3
     */
    eval(code) {
        const result = this.vm.evalCode(code);

        if (result.error) {
            const error = this.vm.dump(result.error);
            result.error.dispose();
            throw new Error(`VM Error: ${error}`);
        }

        const value = this.vm.dump(result.value);
        result.value.dispose();
        return value;
    }

    /**
     * Evaluate code and return raw result handle (caller must dispose)
     * @param {string} code - JavaScript code to evaluate
     * @returns {Object} { error?: handle, value?: handle }
     */
    evalRaw(code) {
        return this.vm.evalCode(code);
    }

    /**
     * Create a JavaScript function that can be called from VM code
     * @param {string} name - Function name in VM
     * @param {Function} fn - JavaScript function to wrap
     * @example
     * vm.setFunction('add', (a, b) => a + b);
     * vm.eval('add(2, 3)'); // 5
     */
    setFunction(name, fn) {
        const fnHandle = this.vm.newFunction(name, (...args) => {
            // Convert VM args to JS
            const jsArgs = args.map(arg => this.vm.dump(arg));

            // Call JS function
            const result = fn(...jsArgs);

            // Convert result back to VM
            return this.jsToVm(result);
        });

        this.vm.setProp(this.vm.global, name, fnHandle);
        fnHandle.dispose();
        return this;
    }

    /**
     * Create an object with JSON-like structure
     * @param {Object} data - JavaScript object to convert
     * @returns {QuickJSHandle} Handle to VM object (caller must dispose)
     */
    newJSON(data) {
        return this.vm.unwrapResult(
            this.vm.evalCode(`(${JSON.stringify(data)})`)
        );
    }

    /**
     * Execute a function in the VM with arguments
     * @param {string} funcName - Function name in VM
     * @param {...*} args - Arguments to pass
     * @returns {*} Result value
     * @example
     * vm.eval('function add(a, b) { return a + b; }');
     * vm.call('add', 2, 3); // 5
     */
    call(funcName, ...args) {
        const argsStr = args.map(a => JSON.stringify(a)).join(', ');
        return this.eval(`${funcName}(${argsStr})`);
    }

    /**
     * Check if VM has been disposed
     */
    isDisposed() {
        return this.disposed;
    }

    /**
     * Get direct access to underlying QuickJS context
     * Use with caution - you're responsible for handle management
     */
    getContext() {
        return this.vm;
    }

    /**
     * Dispose the VM and free all resources
     * Must be called when done to prevent memory leaks
     */
    dispose() {
        if (!this.disposed && this.vm) {
            this.vm.dispose();
            this.disposed = true;
            this.vm = null;
        }
    }
}

/**
 * Create and initialize a new QuickJS VM
 * @param {Object} options - Optional VM configuration
 * @returns {Promise<QuickJSVM>} Initialized VM instance
 * @example
 * const vm = await createVM();
 * vm.set('x', 123);
 * const result = vm.eval('x * 2'); // 246
 * vm.dispose();
 */
async function createVM(options = {}) {
    const vm = new QuickJSVM(options);
    await vm.ready();
    return vm;
}

export { QuickJSVM, createVM };
