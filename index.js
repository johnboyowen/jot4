// Constants for storage keys
const STORAGE_KEYS = {
    siteSignIn: 'site_sign_in_responses',
    deerCull: 'deer_cull_responses',
    observations: 'observations_responses',
    signInStatus: 'site_sign_in_status',
};

// Script URLs for API endpoints
const SCRIPT_URLS = {
    siteSignIn: "https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec",
    deerCull: "https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec",
    observations: "https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec",
    // Use the same URL as siteSignIn since we've updated that script to handle both functions
    signInStatus: "https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec?action=checkSignIn"
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
    sessionStorage.removeItem('username');
    localStorage.removeItem(STORAGE_KEYS.signInStatus);
    localStorage.removeItem('site_sign_in_latestStatus');
    localStorage.removeItem('site_sign_in_location_histories');
    localStorage.removeItem('site_sign_in_pending_updates');
    localStorage.removeItem('current_site_sign_in_tracking_form_id');
    localStorage.removeItem('site_sign_in_responses');
    localStorage.removeItem('observations_latestStatus');
    localStorage.removeItem('site_sign_in_data');
    window.location.href = 'index.html';
}

async function siteSignOutAction() {
    // TODO:
    // if (!navigator.onLine) {
    //     // Store update request for later sync
    //     saveUpdateRequest(formId, locationHistoryString);
    //     updateStatus("Offline: Location history update saved for later sync.");
    //     return;
    // }

    try {
        const formId = localStorage.getItem('current_site_sign_in_tracking_form_id')

        const updateData = {
            formId,
            action: "site_sign_out",
        };

        const scriptURL = `https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec`;
        const response = await fetch(scriptURL, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(updateData),
        });

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
    } catch (error) {
        console.error("Update error:", error);
        // Store update request for later sync
        saveUpdateRequest(formId, locationHistoryString);
        updateStatus("Error updating location history. Will retry when online.");
    }
}

async function siteSignOut() {
    await siteSignOutAction()
    localStorage.removeItem('site_sign_in_location_histories');
    localStorage.removeItem('current_site_sign_in_tracking_form_id');
    location.reload()
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
    const signOutButton = document.getElementById("signOutButton")
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
        if (signOutButton) signOutButton.setAttribute("disabled", true)
    } else {
        if (signOutButton) signOutButton.removeAttribute("disabled")
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

    const statusDisplay = document.getElementById("status");
    const latitudeDisplay = document.getElementById("latitudeDisplay");
    const longitudeDisplay = document.getElementById("longitudeDisplay");

    function updateStatus(message) {
        statusDisplay.textContent = message;
        localStorage.setItem("observations_latestStatus", message);
    }

    let locationTrackingInterval = null;
    const existingSiteLOcationHistory = localStorage.getItem("site_sign_in_location_histories")
    let locationHistory = existingSiteLOcationHistory ? JSON.parse(existingSiteLOcationHistory) : [];

    // Function to update location history for an existing submission
    async function updateLocationHistory(formId) {
        // Ensure we have location history to save
        if (locationHistory.length === 0) {
            updateStatus("No location history to update.");
            return;
        }

        // Format location history as comma-separated values
        // Format: "lat1,lon1;lat2,lon2;lat3,lon3"
        localStorage.setItem("site_sign_in_location_histories", JSON.stringify(locationHistory))
        const locationHistoryString = locationHistory.map(loc =>
            `${loc.latitude},${loc.longitude}`
        ).join(';');

        // Check if online
        if (!navigator.onLine) {
            // Store update request for later sync
            saveUpdateRequest(formId, locationHistoryString);
            updateStatus("Offline: Location history update saved for later sync.");
            return;
        }

        try {
            // Get user and property info
            const username = localStorage.getItem("username");
            const signIn = JSON.parse(localStorage.getItem("site_sign_in_status"));

            // Prepare data for update
            const updateData = {
                action: "updateLocation",
                formId: formId,
                locationHistory: locationHistoryString,
                username: username,
                propertyName: signIn.propertyName
            };

            // Send update to server
            await sendUpdateToGoogleSheet(updateData);
            updateStatus("Location history updated successfully.");

            // Remove any pending update requests for this form
            removePendingUpdate(formId);
        } catch (error) {
            console.error("Update error:", error);
            // Store update request for later sync
            saveUpdateRequest(formId, locationHistoryString);
            updateStatus("Error updating location history. Will retry when online.");
        }
    }

    // Function to save update request for later sync
    function saveUpdateRequest(formId, locationHistoryString) {
        const pendingUpdates = JSON.parse(localStorage.getItem("site_sign_in_pending_updates") || "[]");

        // Check if update for this form already exists
        const existingIndex = pendingUpdates.findIndex(update => update.formId === formId);
        if (existingIndex >= 0) {
            // Update existing request
            pendingUpdates[existingIndex].locationHistory = locationHistoryString;
        } else {
            // Add new update request
            pendingUpdates.push({
                formId: formId,
                locationHistory: locationHistoryString,
                timestamp: new Date().toISOString()
            });
        }

        localStorage.setItem("site_sign_in_pending_updates", JSON.stringify(pendingUpdates));
    }

    // Function to remove pending update
    function removePendingUpdate(formId) {
        const pendingUpdates = JSON.parse(localStorage.getItem("site_sign_in_pending_updates") || "[]");
        const filteredUpdates = pendingUpdates.filter(update => update.formId !== formId);
        localStorage.setItem("site_sign_in_pending_updates", JSON.stringify(filteredUpdates));
    }

    // Function to send update to Google Sheet
    async function sendUpdateToGoogleSheet(data) {
        data.action = "site_sign_in_location_update"
        const scriptURL = `https://script.google.com/macros/s/AKfycbxnV1V18XsCZHuqcHJGFKpGiPx8Qymlvlh73pVaD0Nx9UCshH8cQATn_qK_-Gt_7_C7VA/exec`;
        const response = await fetch(scriptURL, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        });

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        return response.json();
    }

    // Function to sync all pending location updates
    async function syncPendingLocationUpdates() {
        const pendingUpdates = JSON.parse(localStorage.getItem("site_sign_in_pending_updates") || "[]");
        if (pendingUpdates.length === 0) {
            return;
        }

        updateStatus(`Syncing ${pendingUpdates.length} pending location updates...`);

        // Get user and property info
        const username = localStorage.getItem("username");
        const signIn = JSON.parse(localStorage.getItem("site_sign_in_status"));

        let failedUpdates = [];

        for (const update of pendingUpdates) {
            try {
                const updateData = {
                    action: "updateLocation",
                    formId: update.formId,
                    locationHistory: update.locationHistory,
                    username: username,
                    propertyName: signIn.propertyName
                };

                await sendUpdateToGoogleSheet(updateData);
            } catch (error) {
                console.error("Sync error for update:", update, error);
                failedUpdates.push(update);
            }
        }

        if (failedUpdates.length > 0) {
            localStorage.setItem("site_sign_in_pending_updates", JSON.stringify(failedUpdates));
            updateStatus(`${pendingUpdates.length - failedUpdates.length} updates synced, ${failedUpdates.length} failed.`);
        } else {
            localStorage.removeItem("site_sign_in_pending_updates");
            updateStatus("All location updates synced successfully.");
        }
    }

    function startLocationTracking() {
        if (locationTrackingInterval) {
            clearInterval(locationTrackingInterval);
        }

        captureCurrentLocation();

        locationTrackingInterval = setInterval(() => {
            captureCurrentLocation();

            const formId = localStorage.getItem("current_site_sign_in_tracking_form_id");
            if (formId) {
                updateLocationHistory(formId);
            }
        }, 10 * 60 * 1000);

        updateStatus("Location tracking started. Updates every 10 minutes.");
    }

    if (localStorage.getItem("current_site_sign_in_tracking_form_id")) {
        startLocationTracking()
    }

    function captureCurrentLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    const timestamp = new Date().toISOString();

                    // Add to location history
                    locationHistory.push({
                        latitude,
                        longitude,
                        accuracy,
                        timestamp
                    });

                    // Update the display
                    latitudeDisplay.textContent = latitude;
                    longitudeDisplay.textContent = longitude;

                    updateStatus(`Location updated (${accuracy.toFixed(2)} meters accuracy). Total locations: ${locationHistory.length}`);
                    updateLocationHistoryDisplay();
                },
                (error) => {
                    updateStatus(`Failed to update location: ${handleLocationError(error)}`);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            updateStatus("Geolocation is not supported by this browser.");
        }
    }

    function updateLocationHistoryDisplay() {
        const locationHistoryElement = document.getElementById("locationHistory");
        if (locationHistoryElement) {
            locationHistoryElement.innerHTML = "";

            if (locationHistory.length === 0) {
                locationHistoryElement.textContent = "No location history yet.";
                return;
            }

            const list = document.createElement("ul");
            locationHistory.forEach((loc, index) => {
                const item = document.createElement("li");
                const time = new Date(loc.timestamp).toLocaleTimeString();
                item.textContent = `${index + 1}. ${time}: ${loc.latitude}, ${loc.longitude} (±${loc.accuracy.toFixed(2)}m)`;
                list.appendChild(item);
            });

            locationHistoryElement.appendChild(list);
        }
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