// Register service worker for periodic sync (if supported)
if ('serviceWorker' in navigator && 'PeriodicSyncManager' in window) {
    navigator.serviceWorker.register('/service-worker.js').then(async (registration) => {
        try {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
                await registration.periodicSync.register('check-for-updates', {
                    minInterval: 24 * 60 * 60 * 1000  // Check every 24 hours
                });
                console.log("Periodic sync registered!");
            }
        } catch (error) {
            console.error("Failed to register periodic sync", error);
        }
    }).catch((error) => console.error('Service worker registration failed:', error));
} else {
    console.log("Periodic background sync not supported by this browser.");
}

// Logout functionality
function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    sessionStorage.removeItem('isLoggedIn');
    window.location.href = 'index.html'; // Ensure this path is correct
}

// Function to sync all submissions
async function syncAllSubmissions() {
    // Check if the device is online
    if (!navigator.onLine) {
        alert("Device is offline. Please sync when back online.");
        return; // Exit the function if offline
    }

    const spinner = document.getElementById('spinner');
    spinner.style.display = 'block'; // Show spinner

    const storageKeys = {
        siteSignIn: 'site_sign_in_responses',
        deerCull: 'deer_cull_responses',
        observations: 'observations_responses',
    };

    const scriptURLs = {
        siteSignIn: "https://script.google.com/macros/s/AKfycbyG0-lJ3fKWjBR0ya74y5V02JkDBsZuVdRXTTxU375TQcSNU_41JT8VSGSYbHj-5-js/exec",
        deerCull: "https://script.google.com/macros/s/AKfycbz7R7FuRXu4qi_cQd_Rg5sZY-D6pMEVRHol0FQRNuKXbR3MtXau6cnBuDpRxFAaozc/exec",
        observations: "https://script.google.com/macros/s/AKfycbywWOzFRrkypAlrbHhdBid60QTn1EurJ7Ko-hnMK3T9iy4nrtyabg6bOqoGrgBMXNDQ/exec",
    };

    const syncData = async (storageKey, scriptURL) => {
        const responses = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (responses.length === 0) {
            console.log(`No pending submissions for ${storageKey}`);
            return;
        }

        const unsynced = [];
        for (const response of responses) {
            try {
                const networkResponse = await fetch(scriptURL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(response),
                });

                if (networkResponse.ok) {
                    const serverResponse = await networkResponse.json();
                    if (serverResponse.status === "success") {
                        console.log(`Submission for ${storageKey} successfully synced:`, response);
                    } else {
                        console.error(`Server error for ${storageKey}:`, serverResponse.message);
                        unsynced.push(response);
                    }
                } else {
                    console.error(`Network error for ${storageKey}:`, networkResponse.statusText);
                    unsynced.push(response);
                }
            } catch (error) {
                console.error(`Error syncing response for ${storageKey}:`, error);
                unsynced.push(response);
            }
        }

        if (unsynced.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(unsynced));
        } else {
            localStorage.removeItem(storageKey);
        }
    };

    try {
        await Promise.all([
            syncData(storageKeys.siteSignIn, scriptURLs.siteSignIn),
            syncData(storageKeys.deerCull, scriptURLs.deerCull),
            syncData(storageKeys.observations, scriptURLs.observations),
        ]);

        alert("Sync Complete.");
    } catch (error) {
        console.error("Error during sync:", error);
        alert("An error occurred during sync. Check the console for details.");
    } finally {
        spinner.style.display = 'none'; // Hide spinner
        updatePendingCounts(); // Update counts after syncing
    }
}


// Attach event listener to the Sync All button
document.getElementById('syncAll').addEventListener('click', syncAllSubmissions);

// Function to update pending counts
function updatePendingCounts() {
    const storageKeys = {
        siteSignIn: 'site_sign_in_responses',
        deerCull: 'deer_cull_responses',
        observations: 'observations_responses',
    };

    const counts = {
        siteSignIn: JSON.parse(localStorage.getItem(storageKeys.siteSignIn) || '[]').length,
        deerCull: JSON.parse(localStorage.getItem(storageKeys.deerCull) || '[]').length,
        observations: JSON.parse(localStorage.getItem(storageKeys.observations) || '[]').length,
    };

    document.getElementById('pendingCountSiteSignIn').textContent = `(${counts.siteSignIn})`;
    document.getElementById('pendingCountDeerCull').textContent = `(${counts.deerCull})`;
    document.getElementById('pendingCountObservations').textContent = `(${counts.observations})`;
}

// Update counts on page load
document.addEventListener('DOMContentLoaded', updatePendingCounts);

// Listen for localStorage updates to keep counts live
window.addEventListener('storage', updatePendingCounts);


function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        console.log("Active login session found.");
    } else {
        window.location.href = 'index.html';
    }
}

window.onload = checkLoginStatus;