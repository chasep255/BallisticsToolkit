/**
 * JavaScript wrapper for TargetSim WebAssembly module
 */
class TargetSim {
    constructor() {
        this.simulator = null;
        this.Module = null;
    }

    /**
     * Initialize the WebAssembly module
     * @param {string} wasmPath - Path to the WebAssembly file
     * @returns {Promise} - Promise that resolves when module is loaded
     */
    async init(wasmPath = 'ballistics_wasm.wasm') {
        return new Promise((resolve, reject) => {
            // Load the Emscripten module
            const script = document.createElement('script');
            script.src = 'ballistics_wasm.js';
            script.onload = async () => {
                // The module should be available as 'WebUI' (from EXPORT_NAME)
                if (typeof WebUI !== 'undefined') {
                    // Initialize the WebUI module with locateFile to find the WASM
                    this.Module = await WebUI({
                        locateFile: (path) => {
                            if (path.endsWith('.wasm')) {
                                return wasmPath;
                            }
                            return path;
                        }
                    });
                    this.simulator = this.Module._createSimulator();
                    resolve();
                } else {
                    reject(new Error('WebAssembly module not found'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load WebAssembly module'));
            document.head.appendChild(script);
        });
    }

    /**
     * Set bullet parameters
     * @param {Object} bullet - Bullet parameters
     * @param {number} bullet.weight - Weight in grains
     * @param {number} bullet.diameter - Diameter in inches
     * @param {number} bullet.length - Length in inches
     * @param {number} bullet.bc - Ballistic coefficient
     * @param {string} bullet.dragFunction - 'G1' or 'G7'
     */
    setBullet(bullet) {
        const dragFunction = bullet.dragFunction === 'G1' ? 0 : 1;
        this.Module._setBullet(this.simulator, bullet.weight, bullet.diameter, bullet.length, bullet.bc, dragFunction);
    }

    /**
     * Set atmospheric conditions
     * @param {Object} atmosphere - Atmospheric parameters
     * @param {number} atmosphere.temperature - Temperature in Fahrenheit
     * @param {number} atmosphere.pressure - Pressure in inches of mercury
     * @param {number} atmosphere.humidity - Humidity percentage (0-100)
     * @param {number} atmosphere.altitude - Altitude in feet
     */
    setAtmosphere(atmosphere) {
        this.Module._setAtmosphere(this.simulator, atmosphere.temperature, atmosphere.pressure, 
                                  atmosphere.humidity, atmosphere.altitude);
    }

    /**
     * Set wind conditions
     * @param {Object} wind - Wind parameters
     * @param {number} wind.speed - Wind speed in mph
     * @param {number} wind.direction - Wind direction in degrees (0=from left, 90=from front, 180=from right, 270=from rear)
     */
    setWind(wind) {
        this.Module._setWind(this.simulator, wind.speed, wind.direction);
    }

    /**
     * Calculate trajectory
     * @param {Object} shot - Shot parameters
     * @param {number} shot.muzzleVelocity - Muzzle velocity in fps
     * @param {number} shot.zeroRange - Zero range in yards
     * @param {number} shot.scopeHeight - Scope height in inches
     * @param {number} shot.maxRange - Maximum range in yards
     * @param {number} shot.step - Step size in yards
     * @returns {Object} - Trajectory data
     */
    calculateTrajectory(shot) {
        const trajectoryPtr = this.Module._calculateTrajectory(
            this.simulator, shot.muzzleVelocity, shot.zeroRange, shot.scopeHeight, shot.maxRange, shot.step
        );

        const pointCount = this.Module._getTrajectoryPointCount(trajectoryPtr);
        const trajectory = [];

        // Use stack allocation (no need for malloc/free!)
        const stackTop = this.Module.stackSave();
        const bufferPtr = this.Module.stackAlloc(40);
        const dropPtr = bufferPtr;
        const driftPtr = bufferPtr + 8;
        const velocityPtr = bufferPtr + 16;
        const energyPtr = bufferPtr + 24;
        const timePtr = bufferPtr + 32;

        for (let i = 0; i < pointCount; i++) {
            const range = i * shot.step;

            const success = this.Module._getTrajectoryPoint(
                trajectoryPtr, range, dropPtr, driftPtr, velocityPtr, energyPtr, timePtr
            );

            if (success) {
                const point = {
                    range: range,
                    drop: this.Module.getValue(dropPtr, 'double'),
                    drift: this.Module.getValue(driftPtr, 'double'),
                    velocity: this.Module.getValue(velocityPtr, 'double'),
                    energy: this.Module.getValue(energyPtr, 'double'),
                    time: this.Module.getValue(timePtr, 'double')
                };
                trajectory.push(point);
            }
        }

        this.Module.stackRestore(stackTop);
        this.Module._freeTrajectory(trajectoryPtr);
        return trajectory;
    }

    /**
     * Get trajectory point at specific range
     * @param {number} range - Range in yards
     * @returns {Object|null} - Trajectory point or null if not found
     */
    getTrajectoryPoint(range) {
        const stackTop = this.Module.stackSave();
        const bufferPtr = this.Module.stackAlloc(40);
        const dropPtr = bufferPtr;
        const driftPtr = bufferPtr + 8;
        const velocityPtr = bufferPtr + 16;
        const energyPtr = bufferPtr + 24;
        const timePtr = bufferPtr + 32;

        const success = this.Module._getTrajectoryPoint(
            this.trajectoryPtr, range, dropPtr, driftPtr, velocityPtr, energyPtr, timePtr
        );

        let point = null;
        if (success) {
            point = {
                range: range,
                drop: this.Module.getValue(dropPtr, 'double'),
                drift: this.Module.getValue(driftPtr, 'double'),
                velocity: this.Module.getValue(velocityPtr, 'double'),
                energy: this.Module.getValue(energyPtr, 'double'),
                time: this.Module.getValue(timePtr, 'double')
            };
        }

        this.Module.stackRestore(stackTop);
        return point;
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.simulator) {
            this.Module._destroySimulator(this.simulator);
            this.simulator = null;
        }
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TargetSim;
} else if (typeof window !== 'undefined') {
    window.TargetSim = TargetSim;
}
