// Test lap time formatting
const { formatLapTime, formatRaceDate, formatGap } = require('./src/utils/formatters');

console.log('Testing lap time formatting...\n');

// Test various lap times
const testTimes = [
    { ms: 83456, desc: "1 minute 23 seconds" },
    { ms: 123456, desc: "2 minutes 3 seconds" },
    { ms: 23456, desc: "23 seconds (no minutes)" },
    { ms: 65000, desc: "Exactly 1:05" },
    { ms: 0, desc: "Zero/invalid" },
    { ms: null, desc: "Null time" },
    { ms: 3600000, desc: "1 hour (60 minutes)" }
];

console.log('=== Lap Time Formatting ===');
testTimes.forEach(test => {
    console.log(`${test.ms}ms (${test.desc}): ${formatLapTime(test.ms)}`);
});

// Test race date formatting
console.log('\n=== Race Date Formatting ===');
const epoch = 1699315200; // Example epoch
console.log(`Epoch ${epoch}: ${formatRaceDate(epoch)}`);

// Test gap formatting
console.log('\n=== Gap Formatting ===');
const gaps = [2456, -1234, 123456, 0];
gaps.forEach(gap => {
    console.log(`${gap}ms gap: ${formatGap(gap)}`);
});

console.log('\n✅ Formatting tests complete!');
