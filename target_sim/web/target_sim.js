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
    async init(wasmPath = 'target_sim.wasm') {
        return new Promise((resolve, reject) => {
            // This would be replaced with actual Emscripten module loading
            // For now, we'll create a mock interface
            this.Module = {
                _createSimulator: () => 1,
                _destroySimulator: (ptr) => {},
                _setBullet: (ptr, weight, diameter, length, bc, drag) => {},
                _setAtmosphere: (ptr, temp, pressure, humidity, altitude) => {},
                _setWind: (ptr, speed, direction) => {},
                _calculateTrajectory: (ptr, mv, zero, scope, max, step) => 2,
                _freeTrajectory: (ptr) => {},
                _getTrajectoryPoint: (ptr, range, drop, drift, vel, energy, time) => 0,
                _getTrajectoryPointCount: (ptr) => 0,
                _malloc: (size) => 3,
                _free: (ptr) => {},
                ccall: (name, returnType, argTypes, args) => {
                    // Mock implementation
                    return 0;
                },
                cwrap: (name, returnType, argTypes) => {
                    // Mock implementation
                    return () => 0;
                }
            };

            this.simulator = this.Module._createSimulator();
            resolve();
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

        for (let i = 0; i < pointCount; i++) {
            const range = i * shot.step;
            const dropPtr = this.Module._malloc(8);
            const driftPtr = this.Module._malloc(8);
            const velocityPtr = this.Module._malloc(8);
            const energyPtr = this.Module._malloc(8);
            const timePtr = this.Module._malloc(8);

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

            this.Module._free(dropPtr);
            this.Module._free(driftPtr);
            this.Module._free(velocityPtr);
            this.Module._free(energyPtr);
            this.Module._free(timePtr);
        }

        this.Module._freeTrajectory(trajectoryPtr);
        return trajectory;
    }

    /**
     * Get trajectory point at specific range
     * @param {number} range - Range in yards
     * @returns {Object|null} - Trajectory point or null if not found
     */
    getTrajectoryPoint(range) {
        const dropPtr = this.Module._malloc(8);
        const driftPtr = this.Module._malloc(8);
        const velocityPtr = this.Module._malloc(8);
        const energyPtr = this.Module._malloc(8);
        const timePtr = this.Module._malloc(8);

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

        this.Module._free(dropPtr);
        this.Module._free(driftPtr);
        this.Module._free(velocityPtr);
        this.Module._free(energyPtr);
        this.Module._free(timePtr);

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
