const fs = require('fs');
const path = require('path');

/**
 * ReferenceData - Loads and provides lookup methods for game reference data
 * (tracks, vehicles, vehicle classes) in their native game format.
 */
module.exports = (() => {
    _ = new WeakMap();
    
    class ReferenceData {
        constructor() {
            const dataDir = path.join(__dirname, '../data');
            
            let obj = {
                tracks: new Map(),
                vehicles: new Map(),
                vehicleClasses: new Map(),
                dataDir: dataDir
            };
            
            _.set(this, obj);
            this.loadAll();
        }

        /**
         * Load all reference data files
         */
        loadAll() {
            this.loadTracks();
            this.loadVehicles();
            this.loadVehicleClasses();
            console.log(`Loaded reference data: ${_.get(this).tracks.size} tracks, ${_.get(this).vehicles.size} vehicles, ${_.get(this).vehicleClasses.size} vehicle classes`);
        }

        /**
         * Load tracks from tracks.json
         */
        loadTracks() {
            try {
                const tracksPath = path.join(_.get(this).dataDir, 'tracks.json');
                const data = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
                
                if (data.result === 'ok' && data.response && data.response.list) {
                    _.get(this).tracks.clear();
                    data.response.list.forEach(track => {
                        _.get(this).tracks.set(track.id, track);
                    });
                }
            } catch (err) {
                console.error('Error loading tracks.json:', err.message);
            }
        }

        /**
         * Load vehicles from vehicles.json
         */
        loadVehicles() {
            try {
                const vehiclesPath = path.join(_.get(this).dataDir, 'vehicles.json');
                const data = JSON.parse(fs.readFileSync(vehiclesPath, 'utf8'));
                
                if (data.result === 'ok' && data.response && data.response.list) {
                    _.get(this).vehicles.clear();
                    data.response.list.forEach(vehicle => {
                        _.get(this).vehicles.set(vehicle.id, vehicle);
                    });
                }
            } catch (err) {
                console.error('Error loading vehicles.json:', err.message);
            }
        }

        /**
         * Load vehicle classes from vehicle_classes.json
         */
        loadVehicleClasses() {
            try {
                const classesPath = path.join(_.get(this).dataDir, 'vehicle_classes.json');
                const data = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
                
                if (data.result === 'ok' && data.response && data.response.list) {
                    _.get(this).vehicleClasses.clear();
                    data.response.list.forEach(vclass => {
                        _.get(this).vehicleClasses.set(vclass.value, vclass);
                    });
                }
            } catch (err) {
                console.error('Error loading vehicle_classes.json:', err.message);
            }
        }

        /**
         * Get track by ID
         * @param {number} trackId - Track ID from database
         * @returns {object|null} Track object with name, gridsize, etc.
         */
        getTrack(trackId) {
            return _.get(this).tracks.get(trackId) || null;
        }

        /**
         * Get track name by ID
         * @param {number} trackId - Track ID from database
         * @returns {string} Track name or "Unknown Track"
         */
        getTrackName(trackId) {
            const track = this.getTrack(trackId);
            return track ? track.name : `Unknown Track (${trackId})`;
        }

        /**
         * Get vehicle by ID
         * @param {number} vehicleId - Vehicle ID from database
         * @returns {object|null} Vehicle object with name, class, etc.
         */
        getVehicle(vehicleId) {
            return _.get(this).vehicles.get(vehicleId) || null;
        }

        /**
         * Get vehicle name by ID
         * @param {number} vehicleId - Vehicle ID from database
         * @returns {string} Vehicle name or "Unknown Vehicle"
         */
        getVehicleName(vehicleId) {
            const vehicle = this.getVehicle(vehicleId);
            return vehicle ? vehicle.name : `Unknown Vehicle (${vehicleId})`;
        }

        /**
         * Get vehicle class by value
         * @param {number} classValue - Vehicle class value from database
         * @returns {object|null} Vehicle class object with name, translated_name
         */
        getVehicleClass(classValue) {
            return _.get(this).vehicleClasses.get(classValue) || null;
        }

        /**
         * Get vehicle class name by value
         * @param {number} classValue - Vehicle class value from database
         * @returns {string} Class translated name or "Unknown Class"
         */
        getVehicleClassName(classValue) {
            const vclass = this.getVehicleClass(classValue);
            return vclass ? vclass.translated_name : `Unknown Class (${classValue})`;
        }

        /**
         * Search tracks by name (case-insensitive partial match)
         * @param {string} query - Search query
         * @returns {array} Array of matching track objects
         */
        searchTracks(query) {
            const lowerQuery = query.toLowerCase();
            return Array.from(_.get(this).tracks.values())
                .filter(track => track.name.toLowerCase().includes(lowerQuery));
        }

        /**
         * Search vehicles by name (case-insensitive partial match)
         * @param {string} query - Search query
         * @returns {array} Array of matching vehicle objects
         */
        searchVehicles(query) {
            const lowerQuery = query.toLowerCase();
            return Array.from(_.get(this).vehicles.values())
                .filter(vehicle => vehicle.name.toLowerCase().includes(lowerQuery));
        }

        /**
         * Reload all reference data (call this after updating files)
         */
        reload() {
            console.log('Reloading reference data...');
            this.loadAll();
        }
    }
    
    return ReferenceData;
})();
