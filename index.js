// Constants for storage keys
const STORAGE_KEYS = {
    siteSignIn: 'site_sign_in_responses',
    deerCull: 'deer_cull_responses',
    observations: 'observations_responses',
    siteSignOut: 'site_sign_out_responses',
    signInStatus: 'site_sign_in_status',
};

// Script URLs for API endpoints
const SCRIPT_URLS = {
    siteSignIn: "https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec",
    deerCull: "https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec",
    observations: "https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec",
    // Use the same URL as siteSignIn since we've updated that script to handle both functions
    signInStatus: "https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec?action=checkSignIn"
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
    // localStorage.removeItem('site_sign_in_location_histories');
    localStorage.removeItem('site_sign_in_pending_updates');
    localStorage.removeItem('current_site_sign_in_tracking_form_id');
    localStorage.removeItem('site_sign_in_responses');
    localStorage.removeItem('observations_latestStatus');
    localStorage.removeItem('dropdown_data');
    window.location.href = 'index.html';
}

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

function saveSignOutRequest(username) {
    const pendingSignOuts = JSON.parse(localStorage.getItem(STORAGE_KEYS.siteSignOut) || "[]");
    
    // Check if we already have a pending sign-out for this user
    const existingIndex = pendingSignOuts.findIndex(request => request.username === username);
    
    if (existingIndex >= 0) {
        // Update existing request with new timestamp
        pendingSignOuts[existingIndex].timestamp = new Date().toISOString();
    } else {
        // Add new sign-out request
        pendingSignOuts.push({
            username: username,
            action: "site_sign_out",
            timestamp: new Date().toISOString()
        });
    }

    localStorage.setItem(STORAGE_KEYS.siteSignOut, JSON.stringify(pendingSignOuts));
}


async function siteSignOutAction() {
    const username = localStorage.getItem('username');
    
    // Update local sign-in status
    const signInStatus = {
        status: "success",
        hasSignedIn: false,
        placeName: ""
    };
    localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(signInStatus));

    if (!navigator.onLine) {
        // Store sign-out request for later sync
        saveSignOutRequest(username);
        // Update UI to indicate offline status
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.innerText = "Offline: Site sign-out saved for later sync.";
        } else {
            alert("Offline: Site sign-out saved for later sync.");
        }
        return false;
    }

    try {
        const updateData = {
            username,
            action: "site_sign_out",
        };

        const scriptURL = SCRIPT_URLS.siteSignIn;
        const response = await fetch(scriptURL, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(updateData),
        });

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        
        return true;
    } catch (error) {
        console.error("Sign-out error:", error);
        // Store sign-out request for later sync
        saveSignOutRequest(username);
        // Update UI to indicate error
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.innerText = "Error during sign-out. Will retry when online.";
        }
        return false;
    }
}

async function siteSignOut() {
    const success = await siteSignOutAction();
    if (success || !navigator.onLine) {
        // Clear location tracking data
        // localStorage.removeItem('site_sign_in_location_histories');
        localStorage.removeItem('current_site_sign_in_tracking_form_id');
        
        // Update sign-in status locally for immediate UI effect
        const signInStatus = {
            status: "success",
            hasSignedIn: false,
            placeName: ""
        };
        localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(signInStatus));
    }
    location.reload();

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
            syncData(STORAGE_KEYS.siteSignOut, SCRIPT_URLS.siteSignIn), // Using siteSignIn endpoint for sign-out
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
        siteSignOut: JSON.parse(localStorage.getItem(STORAGE_KEYS.siteSignOut) || '[]').length,
    };

    const pendingCountSiteSignIn = document.getElementById('pendingCountSiteSignIn');
    const pendingCountDeerCull = document.getElementById('pendingCountDeerCull');
    const pendingCountObservations = document.getElementById('pendingCountObservations');
    const pendingSiteSignOut = document.getElementById('pendingSiteSignOut');

    if (pendingCountSiteSignIn) pendingCountSiteSignIn.textContent = `(${counts.siteSignIn})`;
    if (pendingCountDeerCull) pendingCountDeerCull.textContent = `(${counts.deerCull})`;
    if (pendingCountObservations) pendingCountObservations.textContent = `(${counts.observations})`;
    if (pendingSiteSignOut) pendingSiteSignOut.textContent = `(${counts.observations})`;
}

async function checkNetwork() {
    try {
        await fetch('https://www.google.com', { 
            method: 'HEAD', 
            mode: 'no-cors', 
            cache: 'no-store',
            timeout: 3000 
        });
        return true;
    } catch (error) {
        console.log('Network check failed:', error);
        return false;
    }
}

// Enhanced check and update sign-in status
async function checkAndUpdateSignInStatus(forceCheck = false) {
    const username = localStorage.getItem('username');
    if (!username) {
        console.error("No username found in local storage");
        return false;
    }

    // First, check cached status
    const cachedStatus = JSON.parse(localStorage.getItem(STORAGE_KEYS.signInStatus) || 'null');
    
    // If not force checking and we have a cached status, use it
    if (!forceCheck && cachedStatus) {
        console.log("Using cached sign-in status:", cachedStatus);
        return cachedStatus.hasSignedIn;
    }

    // Check network with more robust method
    const isOnline = await checkNetwork();
    
    // If offline and we have a cached status, use it
    if (!isOnline && cachedStatus) {
        console.log("Offline, using last known sign-in status:", cachedStatus);
        return cachedStatus.hasSignedIn;
    }

    // If online, try to fetch from server
    if (isOnline) {
        try {
            const response = await fetch(`${SCRIPT_URLS.signInStatus}&username=${username}`);

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem(STORAGE_KEYS.signInStatus, JSON.stringify(data));
                console.log("Updated sign-in status from server:", data);
                return data.hasSignedIn;
            } else {
                console.error("Error when checking sign-in status");
                // Fallback to cached status if available
                return cachedStatus ? cachedStatus.hasSignedIn : false;
            }
        } catch (error) {
            console.error("Error checking sign-in status:", error);
            // Fallback to cached status if available
            return cachedStatus ? cachedStatus.hasSignedIn : false;
        }
    }

    // If all else fails, return false
    return false;
}

async function updateFormAccessibility() {
    const hasSignedIn = await checkAndUpdateSignInStatus(!!navigator.onLine);
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

function siteSignIn(){
    if(JSON.parse(localStorage.getItem(STORAGE_KEYS.siteSignIn) || '[]').length){
        alert("Sync the previous site sign in to continue")
    }else{
        location.href='site_sign_in.html'
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
    // const existingSiteLOcationHistory = localStorage.getItem("site_sign_in_location_histories")
    // let locationHistory = existingSiteLOcationHistory ? JSON.parse(existingSiteLOcationHistory) : [];
    let locationHistory = [];

    // Function to update location history for an existing submission
    async function updateLocationHistory(formId) {
        // Ensure we have location history to save
        if (locationHistory.length === 0) {
            updateStatus("No location history to update.");
            return;
        }

        // Format location history as comma-separated values
        // Format: "lat1,lon1;lat2,lon2;lat3,lon3"
        // localStorage.setItem("site_sign_in_location_histories", JSON.stringify(locationHistory))
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

    // Function to remove pending update
    function removePendingUpdate(formId) {
        const pendingUpdates = JSON.parse(localStorage.getItem("site_sign_in_pending_updates") || "[]");
        const filteredUpdates = pendingUpdates.filter(update => update.formId !== formId);
        localStorage.setItem("site_sign_in_pending_updates", JSON.stringify(filteredUpdates));
    }

    // Function to send update to Google Sheet
    async function sendUpdateToGoogleSheet(data) {
        data.action = "site_sign_in_location_update"
        const scriptURL = `https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec`;
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

    function handleLocationError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return "Location permission denied.";
            case error.POSITION_UNAVAILABLE:
                return "Location information unavailable.";
            case error.TIMEOUT:
                return "Request timed out.";
            default:
                return "An unknown error occurred.";
        }
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

// Create a logger that shows messages on the page instead of console
function setupDebugDisplay() {
    // Create a debug container at the bottom of the page
    const debugContainer = document.createElement('div');
    debugContainer.id = 'debug-log';
    debugContainer.style.cssText = `
      position: fixed;
      bottom: 40px; /* Above the version number */
      left: 0;
      right: 0;
      max-height: 40vh;
      overflow-y: auto;
      background-color: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      z-index: 1000;
      border-top: 1px solid #333;
    `;
    document.body.appendChild(debugContainer);
    
    // Add a clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Logs';
    clearButton.style.cssText = `
      position: fixed;
      bottom: 40px;
      right: 10px;
      z-index: 1001;
      padding: 5px;
      background-color: #444;
      color: white;
      border: none;
      border-radius: 3px;
    `;
    clearButton.addEventListener('click', () => {
      const logContainer = document.getElementById('debug-log');
      if (logContainer) {
        logContainer.innerHTML = '';
      }
    });
    document.body.appendChild(clearButton);
    
    // Override console methods
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    // Function to add log to the debug container
    function addLogToDisplay(type, ...args) {
      const logContainer = document.getElementById('debug-log');
      if (!logContainer) return;
      
      const logEntry = document.createElement('div');
      logEntry.className = `log-${type}`;
      
      // Add timestamp
      const timestamp = new Date().toLocaleTimeString();
      logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> `;
      
      // Style based on type
      switch(type) {
        case 'error':
          logEntry.style.color = '#ff5555';
          break;
        case 'warn':
          logEntry.style.color = '#ffaa00';
          break;
        case 'info':
          logEntry.style.color = '#5555ff';
          break;
        default:
          logEntry.style.color = '#00ff00';
      }
      
      // Format and add the actual message
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch(e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      logEntry.innerHTML += message.replace(/\n/g, '<br>');
      logContainer.appendChild(logEntry);
      
      // Auto-scroll to bottom
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // Override console methods
    console.log = function(...args) {
      originalConsole.log.apply(console, args);
      addLogToDisplay('log', ...args);
    };
    
    console.error = function(...args) {
      originalConsole.error.apply(console, args);
      addLogToDisplay('error', ...args);
    };
    
    console.warn = function(...args) {
      originalConsole.warn.apply(console, args);
      addLogToDisplay('warn', ...args);
    };
    
    console.info = function(...args) {
      originalConsole.info.apply(console, args);
      addLogToDisplay('info', ...args);
    };
    
    // Add network status monitoring
    window.addEventListener('online', () => {
      addLogToDisplay('info', '🌐 Network: Online');
    });
    
    window.addEventListener('offline', () => {
      addLogToDisplay('warn', '🌐 Network: Offline');
    });
    
    // Log initial network state
    addLogToDisplay('info', `🌐 Initial Network Status: ${navigator.onLine ? 'Online' : 'Offline'}`);
    
    // Add a function to log storage changes
    function logStorageChanges() {
      const storageKeys = [
        'site_sign_in_responses',
        'deer_cull_responses',
        'observations_responses',
        'site_sign_out_responses',
        'site_sign_in_status',
        'site_sign_in_pending_updates',
        'isLoggedIn',
        'username'
      ];
      
      window.addEventListener('storage', (event) => {
        if (storageKeys.includes(event.key)) {
          addLogToDisplay('info', `Storage updated: ${event.key}`);
          try {
            addLogToDisplay('info', `New value: ${event.newValue}`);
          } catch(e) {
            addLogToDisplay('error', `Could not display new value: ${e.message}`);
          }
        }
      });
    }
    
    logStorageChanges();
    
    // Return a reference to the original console methods
    return originalConsole;
  }
  
  // Add hooks for specific functions we want to monitor
  function addFunctionHooks() {
    // Helper function to wrap existing functions with logging
    function wrapFunction(obj, funcName, wrapperFn) {
      const original = obj[funcName];
      obj[funcName] = function(...args) {
        wrapperFn(funcName, ...args);
        return original.apply(this, args);
      };
    }
    
    // Intercept key functions from the application
    if (typeof siteSignOutAction === 'function') {
      const originalSignOut = siteSignOutAction;
      siteSignOutAction = async function() {
        console.log('📤 Starting siteSignOutAction');
        const result = await originalSignOut();
        console.log(`📤 siteSignOutAction finished, result: ${result}`);
        return result;
      };
    }
    
    if (typeof checkAndUpdateSignInStatus === 'function') {
      const originalCheck = checkAndUpdateSignInStatus;
      checkAndUpdateSignInStatus = async function(forceCheck = false) {
        console.log(`🔍 checkAndUpdateSignInStatus called, forceCheck: ${forceCheck}`);
        const result = await originalCheck(forceCheck);
        console.log(`🔍 Sign-in status: ${result ? 'Signed In' : 'Not Signed In'}`);
        return result;
      };
    }
    
    if (typeof syncAllSubmissions === 'function') {
      const originalSync = syncAllSubmissions;
      syncAllSubmissions = async function() {
        console.log('🔄 Starting syncAllSubmissions');
        try {
          await originalSync();
          console.log('🔄 syncAllSubmissions completed successfully');
        } catch (error) {
          console.error('🔄 syncAllSubmissions failed', error);
        }
      };
    }
    
    if (typeof updateFormAccessibility === 'function') {
      const originalUpdateForm = updateFormAccessibility;
      updateFormAccessibility = async function() {
        console.log('🔐 Starting updateFormAccessibility');
        await originalUpdateForm();
        console.log('🔐 updateFormAccessibility completed');
      };
    }
    
    if (typeof checkNetwork === 'function') {
      const originalCheckNetwork = checkNetwork;
      checkNetwork = async function() {
        console.log('🌐 Checking network connectivity');
        const result = await originalCheckNetwork();
        console.log(`🌐 Network check result: ${result ? 'Online' : 'Offline'}`);
        return result;
      };
    }
    
    // Add hook for localStorage operations
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      console.log(`💾 localStorage.setItem: ${key}`);
      originalSetItem.call(localStorage, key, value);
    };
    
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = function(key) {
      console.log(`🗑️ localStorage.removeItem: ${key}`);
      originalRemoveItem.call(localStorage, key);
    };
  }
  
  // Call this function after the DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    const originalConsole = setupDebugDisplay();
    addFunctionHooks();
    
    // Log initial state
    setTimeout(() => {
      console.log('📱 Debug display initialized');
      console.log('📊 Current localStorage keys:', Object.keys(localStorage));
      console.log('👤 Username:', localStorage.getItem('username'));
      console.log('🔑 Login status:', localStorage.getItem('isLoggedIn'));
      
      const signInStatus = JSON.parse(localStorage.getItem('site_sign_in_status') || 'null');
      console.log('🔐 Site sign-in status:', signInStatus);
      
      console.log('📡 Network status:', navigator.onLine ? 'Online' : 'Offline');
      
      // Log pending submissions
      const pendingSignIns = JSON.parse(localStorage.getItem('site_sign_in_responses') || '[]');
      const pendingDeerCull = JSON.parse(localStorage.getItem('deer_cull_responses') || '[]');
      const pendingObservations = JSON.parse(localStorage.getItem('observations_responses') || '[]');
      const pendingSignOuts = JSON.parse(localStorage.getItem('site_sign_out_responses') || '[]');
      
      console.log(`📥 Pending submissions: SignIns: ${pendingSignIns.length}, DeerCull: ${pendingDeerCull.length}, Observations: ${pendingObservations.length}, SignOuts: ${pendingSignOuts.length}`);
    }, 1000);
  });