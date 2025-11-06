// Quick test of ReferenceData loader
const ReferenceData = require('./src/classes/ReferenceData');

console.log('Testing ReferenceData loader...\n');

const ref = new ReferenceData();

// Test track lookup
console.log('=== Track Tests ===');
const brandshatchId = 1534602052; // BrandsHatch_GP from your file
console.log(`Track ID ${brandshatchId}:`, ref.getTrackName(brandshatchId));

const spaId = -171682166; // Should be in there
console.log(`Track ID ${spaId}:`, ref.getTrackName(spaId));

// Test vehicle class lookup
console.log('\n=== Vehicle Class Tests ===');
const gt3ClassId = -112887377; // GT3 from your file
console.log(`Class ID ${gt3ClassId}:`, ref.getVehicleClassName(gt3ClassId));

const p4ClassId = -1710882048; // P4
console.log(`Class ID ${p4ClassId}:`, ref.getVehicleClassName(p4ClassId));

// Test vehicle lookup
console.log('\n=== Vehicle Tests ===');
const alpineId = -1404454397; // Alpine A424
console.log(`Vehicle ID ${alpineId}:`, ref.getVehicleName(alpineId));
const vehicle = ref.getVehicle(alpineId);
if (vehicle) {
    console.log(`  Class: ${vehicle.class}`);
}

// Test search
console.log('\n=== Search Tests ===');
const spaResults = ref.searchTracks('spa');
console.log(`Tracks matching "spa": ${spaResults.length} found`);
spaResults.forEach(t => console.log(`  - ${t.name}`));

const gt3Results = ref.searchVehicles('GT3');
console.log(`\nVehicles matching "GT3": ${gt3Results.length} found`);
gt3Results.slice(0, 5).forEach(v => console.log(`  - ${v.name}`));

console.log('\n✅ Reference data loaded successfully!');
