// Constants for storage keys
const STORAGE_KEYS = {
    siteSignIn: 'site_sign_in_responses',
    deerCull: 'deer_cull_responses',
    observations: 'observations_responses',
    signInStatus: 'site_sign_in_status',
};

// Script URLs for API endpoints
const SCRIPT_URLS = {
    siteSignIn: "https://script.google.com/macros/s/AKfycbzeE4OFXJFIFkGHmNKFGM8zSwU1oclqZgGdkRApnrYJQtrfn07RWapRj8Z7K_NO-n-Y0w/exec",
    deerCull: "https://script.google.com/macros/s/AKfycbz7R7FuRXu4qi_cQd_Rg5sZY-D6pMEVRHol0FQRNuKXbR3MtXau6cnBuDpRxFAaozc/exec",
    observations: "https://script.google.com/macros/s/AKfycbywWOzFRrkypAlrbHhdBid60QTn1EurJ7Ko-hnMK3T9iy4nrtyabg6bOqoGrgBMXNDQ/exec",
    // Use the same URL as siteSignIn since we've updated that script to handle both functions
    signInStatus: "https://script.google.com/macros/s/AKfycbxdlAjqCgMPr6uPo-lFQCiCdDIt6JoAUBLKMAMnk7PSCt-oUOg1CJzGvqjW_OWAKZgazg/exec?action=checkSignIn"
};

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
    localStorage.removeItem(STORAGE_KEYS.signInStatus);
    sessionStorage.removeItem('isLoggedIn');
    window.location.href = 'index.html';
}

async function syncAllSubmissions() {
    if (!navigator.onLine) {
        alert("Device is offline. Please sync when back online.");
        return;
    }

    const spinner = document.getElementById('spinner');
    spinner.style.display = 'block'; // Show spinner

    const syncData = async (storageKey, scriptURL) => {
        const responses = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (responses.length === 0) {
            console.log(`No pending submissions for ${storageKey}`);
            return;
        }

        const unsynced = [];
        for (const response of responses) {
            try {
                // Add username to each submission if not already there
                if (!response.username && localStorage.getItem('username')) {
                    response.username = localStorage.getItem('username');
                }

                const networkResponse = await fetch(scriptURL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(response),
                });

                if (networkResponse.ok) {
                    const serverResponse = await networkResponse.json();
                    if (serverResponse.status === "success") {
                        console.log(`Submission for ${storageKey} successfully synced:`, response);

                        if (storageKey === STORAGE_KEYS.siteSignIn) {
                            const signInStatus = {
                                status: "success",
                                hasSignedIn: serverResponse.hasSignedIn,
                                placeName: serverResponse.propertyName,
                            };
                            localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(signInStatus));
                        }
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
            syncData(STORAGE_KEYS.siteSignIn, SCRIPT_URLS.siteSignIn),
            syncData(STORAGE_KEYS.deerCull, SCRIPT_URLS.deerCull),
            syncData(STORAGE_KEYS.observations, SCRIPT_URLS.observations),
        ]);

        await checkAndUpdateSignInStatus(true);
        updateFormAccessibility();
        alert("Sync Complete.");
    } catch (error) {
        console.error("Error during sync:", error);
        alert("An error occurred during sync. Check the console for details.");
    } finally {
        spinner.style.display = 'none';
        updatePendingCounts();
    }
}

// Function to update pending counts
function updatePendingCounts() {
    const counts = {
        siteSignIn: JSON.parse(localStorage.getItem(STORAGE_KEYS.siteSignIn) || '[]').length,
        deerCull: JSON.parse(localStorage.getItem(STORAGE_KEYS.deerCull) || '[]').length,
        observations: JSON.parse(localStorage.getItem(STORAGE_KEYS.observations) || '[]').length,
    };

    const pendingCountSiteSignIn = document.getElementById('pendingCountSiteSignIn');
    const pendingCountDeerCull = document.getElementById('pendingCountDeerCull');
    const pendingCountObservations = document.getElementById('pendingCountObservations');

    if (pendingCountSiteSignIn) pendingCountSiteSignIn.textContent = `(${counts.siteSignIn})`;
    if (pendingCountDeerCull) pendingCountDeerCull.textContent = `(${counts.deerCull})`;
    if (pendingCountObservations) pendingCountObservations.textContent = `(${counts.observations})`;
}

// Check if the user has already signed in today
async function checkAndUpdateSignInStatus(forceCheck = false) {
    const username = localStorage.getItem('username');
    if (!username) {
        console.error("No username found in local storage");
        return false;
    }

    const cachedStatus = JSON.parse(localStorage.getItem(STORAGE_KEYS.signInStatus) || 'null');
    if (cachedStatus && !forceCheck) {
        console.log("Using cached sign-in status:", cachedStatus);
        return cachedStatus.hasSignedIn;
    }

    if (!navigator.onLine && cachedStatus) {
        console.log("Offline, using last known sign-in status:", cachedStatus);
        return cachedStatus.hasSignedIn;
    }

    try {
        const response = await fetch(`${SCRIPT_URLS.signInStatus}&username=${username}`);

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(data));
            console.log("Updated sign-in status from server:", data);
            return data.hasSignedIn;
        } else {
            console.error("Error when checking sign-in status");
            return false;
        }
    } catch (error) {
        console.error("Error checking sign-in status:", error);
        return false;
    }
}

async function updateFormAccessibility() {
    const hasSignedIn = await checkAndUpdateSignInStatus(true);
    const signInButton = document.getElementById("signInButton")
    const deerCullSubmissionsButton = document.getElementById("deerCullSubmissionsButton")
    const observationsButton = document.getElementById("observationsButton")
    const statusTextObject = document.getElementById("status")
    const siteSignInStatus = document.getElementById("siteSignInStatus")
    
    siteSignInStatus.innerText = hasSignedIn ? "Done" : "Not Done"
    if (!hasSignedIn) {
        statusTextObject.innerText = "Complete the site sign in"
        if (signInButton) signInButton.removeAttribute("disabled")
        if (deerCullSubmissionsButton) deerCullSubmissionsButton.setAttribute("disabled", true)
        if (observationsButton) observationsButton.setAttribute("disabled", true)
    } else {
        if (signInButton) signInButton.setAttribute("disabled", true)
        statusTextObject.innerText = ""
        if (deerCullSubmissionsButton) deerCullSubmissionsButton.removeAttribute("disabled")
        if (observationsButton) observationsButton.removeAttribute("disabled")
    }
}

// Function to set up the site sign-in form submission
function setupSiteSignInForm() {
    const form = document.querySelector('form');
    if (form && window.location.pathname.includes('site_sign_in.html')) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();

            // Get form data
            const formData = {};
            new FormData(form).forEach((value, key) => {
                formData[key] = value;
            });

            // Add required fields
            formData.username = localStorage.getItem('username') || '';
            formData.timestamp = new Date().toISOString();

            // Store in local storage
            const responses = JSON.parse(localStorage.getItem(STORAGE_KEYS.siteSignIn) || '[]');
            responses.push(formData);
            localStorage.setItem(STORAGE_KEYS.siteSignIn, JSON.stringify(responses));

            // Update sign-in status in local storage
            const signInStatus = {
                status: "success",
                hasSignedIn: true,
                propertyName: formData.propertyName
            };
            localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(signInStatus));

            // Try to sync immediately if online
            if (navigator.onLine) {
                syncAllSubmissions().then(() => {
                    alert("Site sign-in submitted successfully!");
                    window.location.href = 'index.html';
                });
            } else {
                alert("Form saved locally. It will be synced when you're back online.");
                window.location.href = 'index.html';
            }
        });
    }
}

function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        console.log("Active login session found.");
    } else {
        window.location.href = 'index.html';
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    document.getElementById("username").innerText = localStorage.getItem("username") || ""
    checkLoginStatus();
    updatePendingCounts();
    setupSiteSignInForm();
    await updateFormAccessibility();

    const syncAllButton = document.getElementById('syncAll');
    if (syncAllButton) {
        syncAllButton.addEventListener('click', syncAllSubmissions);
    }
});

window.addEventListener('storage', function (event) {
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
        updatePendingCounts();
        updateFormAccessibility();
    }
});

window.addEventListener('online', updateFormAccessibility);
window.addEventListener('offline', updateFormAccessibility);

window.onload = checkLoginStatus;