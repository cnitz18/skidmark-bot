/**
 * Utility functions for formatting racing data
 */

/**
 * Convert milliseconds to a human-readable lap time format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} Formatted time string (e.g., "1:23.456" or "23.456")
 */
function formatLapTime(milliseconds) {
    if (!milliseconds || milliseconds <= 0) {
        return "N/A";
    }
    
    const totalSeconds = milliseconds / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
        // Format: "1:23.456"
        return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
    } else {
        // Format: "23.456" (no minutes)
        return `${seconds.toFixed(3)}`;
    }
}

/**
 * Convert epoch timestamp to human-readable date/time
 * @param {number} epochSeconds - Unix timestamp in seconds
 * @param {string} timezone - Timezone (default: 'America/Chicago' for Central)
 * @returns {string} Formatted date/time string
 */
function formatRaceDate(epochSeconds, timezone = 'America/Chicago') {
    if (!epochSeconds) {
        return "Unknown date";
    }
    
    const date = new Date(epochSeconds * 1000);
    return date.toLocaleString('en-US', { 
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

/**
 * Format a time difference (gap) between drivers
 * @param {number} milliseconds - Time difference in milliseconds
 * @returns {string} Formatted gap (e.g., "+2.456s" or "+1:23.456")
 */
function formatGap(milliseconds) {
    if (!milliseconds || milliseconds === 0) {
        return "0.000s";
    }
    
    const sign = milliseconds > 0 ? "+" : "-";
    const abs = Math.abs(milliseconds);
    const time = formatLapTime(abs);
    
    return `${sign}${time}s`;
}

module.exports = {
    formatLapTime,
    formatRaceDate,
    formatGap
};
