/**
 * Ballistics Toolkit - Embind JavaScript API
 * 
 * This file provides a clean JavaScript API using embind-generated bindings.
 * The C++ classes are automatically exposed to JavaScript through embind.
 */

class BallisticsToolkit {
    constructor() {
        this.Module = null;
        this.isLoaded = false;
    }

    async load() {
        if (this.isLoaded) {
            return;
        }

        try {
            // Load the WebAssembly module
            this.Module = await window.BallisticsToolkit();
            this.isLoaded = true;
            console.log('BallisticsToolkit WebAssembly module loaded successfully');
        } catch (error) {
            console.error('Failed to load BallisticsToolkit WebAssembly module:', error);
            throw error;
        }
    }

    // Unit factory methods
    get Units() {
        return {
            Distance: this.Module.Distance,
            Weight: this.Module.Weight,
            Velocity: this.Module.Velocity,
            Temperature: this.Module.Temperature,
            Pressure: this.Module.Pressure,
            Angle: this.Module.Angle,
            Time: this.Module.Time,
            Energy: this.Module.Energy,
            Density: this.Module.Density,
            Position3D: this.Module.Position3D,
            Velocity3D: this.Module.Velocity3D
        };
    }

    // Main classes
    get Bullet() {
        return this.Module.Bullet;
    }

    get Atmosphere() {
        return this.Module.Atmosphere;
    }

    get Trajectory() {
        return this.Module.Trajectory;
    }

    get TrajectoryPoint() {
        return this.Module.TrajectoryPoint;
    }

    get Simulator() {
        return this.Module.Simulator;
    }

    get DragFunction() {
        return this.Module.DragFunction;
    }
}

// Create global instance
window.BallisticsToolkit = new BallisticsToolkit();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.BallisticsToolkit;
}
