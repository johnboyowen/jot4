document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("offlineForm");
    const statusDisplay = document.getElementById("status");
    const viewPendingButton = document.getElementById("viewPending");
    const showFormButton = document.getElementById("showForm");
    const formContainer = document.getElementById("formContainer");
    const pendingContainer = document.getElementById("pendingSubmissions");
    const gpsButton = document.getElementById("captureGps");
    const latitudeDisplay = document.getElementById("latitudeDisplay");
    const longitudeDisplay = document.getElementById("longitudeDisplay");
    // const propertyNameSelect = document.getElementById("propertyName");
    const submitButton = document.getElementById("submitButton");

    const MAX_FILE_SIZE = 15000000; // 15MB per photo
    const MAX_PHOTOS = 5; // Maximum number of photos allowed
    const photoData = []; // Array to store resized Base64-encoded photos

    const takePhotoButton = document.getElementById("takePhoto");
    const photoPreview = document.getElementById("photoPreview");

    const thirdPartyInteractions = document.getElementById("thirdPartyInteractions");
    const thirdPartyText = document.getElementById("thirdPartyText");
    thirdPartyInteractions.addEventListener("change", () => {
        thirdPartyText.style.display = thirdPartyInteractions.value === "Yes" ? "block" : "none";
    });

    const healthSafety = document.getElementById("healthSafety");
    const healthSafetyText = document.getElementById("healthSafetyText");
    healthSafety.addEventListener("change", () => {
        healthSafetyText.style.display = healthSafety.value === "Yes" ? "block" : "none";
    });

    function updateStatus(message) {
        statusDisplay.textContent = message;
        localStorage.setItem("observations_latestStatus", message); // Save latest status specific to observations
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
                    document.getElementById("latitude").value = latitude;
                    document.getElementById("longitude").value = longitude;
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

    gpsButton.addEventListener("click", () => {
        if (navigator.geolocation) {
            let watchId;
            let timerId;
            const maxTime = 180;
            let remainingTime = maxTime;
            let lastLatitude = null;
            let lastLongitude = null;
            let lastAccuracy = null;
            const timerDisplay = document.createElement("div");
            timerDisplay.style.marginTop = "5px";
            timerDisplay.style.color = "#666";
            statusDisplay.parentNode.insertBefore(timerDisplay, statusDisplay.nextSibling);

            function stopWatching() {
                if (watchId) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }
                if (timerId) {
                    clearInterval(timerId);
                    timerId = null;
                }
                updateTimer("Timer stopped.");

                if (remainingTime <= 0 && lastLatitude !== null && lastLongitude !== null) {
                    document.getElementById("latitude").value = lastLatitude;
                    document.getElementById("longitude").value = lastLongitude;
                    latitudeDisplay.textContent = lastLatitude;
                    longitudeDisplay.textContent = lastLongitude;
                    updateStatus(`Timer expired. Using last available coordinates (accuracy: ${lastAccuracy ? lastAccuracy.toFixed(2) : 'unknown'} meters).`);
                    startLocationTracking()
                }
            }

            function updateTimer(message) {
                timerDisplay.textContent = message || `Time remaining: ${remainingTime}s`;
            }

            // Start the countdown timer
            timerId = setInterval(() => {
                remainingTime--;
                if (remainingTime <= 0) {
                    updateTimer("Time expired. Using last available coordinates.");
                    stopWatching();
                } else {
                    updateTimer();
                }
            }, 1000);

            updateStatus("Acquiring high-accuracy GPS location...");

            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const accuracy = position.coords.accuracy;
                    lastLatitude = position.coords.latitude;
                    lastLongitude = position.coords.longitude;
                    lastAccuracy = accuracy;

                    if (accuracy <= 10) {
                        document.getElementById("latitude").value = lastLatitude;
                        document.getElementById("longitude").value = lastLongitude;
                        latitudeDisplay.textContent = lastLatitude;
                        longitudeDisplay.textContent = lastLongitude;

                        updateStatus(`High-accuracy GPS location captured (${accuracy.toFixed(2)} meters).`);

                        stopWatching();
                    } else {
                        updateStatus(`Current GPS accuracy: ${accuracy.toFixed(2)} meters. Waiting for better accuracy...`);
                    }
                },
                (error) => {
                    updateStatus(handleLocationError(error));
                    latitudeDisplay.textContent = "N/A";
                    longitudeDisplay.textContent = "N/A";
                    stopWatching();
                },
                {
                    enableHighAccuracy: true,
                    timeout: maxTime * 1000,
                    maximumAge: 0
                }
            );
        } else {
            updateStatus("Geolocation is not supported by this browser.");
        }
    });

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

    const DB_NAME = 'ObservationsDB';
    const STORE_NAME = 'photos';
    let db;

    // Initialize IndexedDB
    function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    // Save photo to IndexedDB
    function savePhotoToIndexedDB(base64Data) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const photoObj = {
                data: base64Data,
                timestamp: new Date().getTime()
            };

            const request = store.add(photoObj);

            request.onsuccess = (event) => {
                resolve(event.target.result); // Returns the generated ID
            };

            request.onerror = (event) => {
                console.error("Error saving photo to IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Get photo from IndexedDB by ID
    function getPhotoFromIndexedDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.get(id);

            request.onsuccess = (event) => {
                if (request.result) {
                    resolve(request.result.data);
                } else {
                    reject(new Error('Photo not found'));
                }
            };

            request.onerror = (event) => {
                console.error("Error retrieving photo from IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Delete photo from IndexedDB by ID
    function deletePhotoFromIndexedDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                console.error("Error deleting photo from IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    }


    initIndexedDB()
        .then(() => {
            updateStatus("Storage system initialized.");
        })
        .catch(error => {
            console.error("Failed to initialize IndexedDB:", error);
            updateStatus("Failed to initialize storage system. Using fallback.");
        });

    function resizeImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_WIDTH = 800;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    takePhotoButton.addEventListener("click", async () => {
        if (photoData.length >= MAX_PHOTOS) {
            alert("You can only upload up to 5 photos.");
            return;
        }

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        const choice = confirm("Click OK for Camera or Cancel to select from Gallery");

        if (choice) {
            input.capture = "environment";
        }

        input.addEventListener("change", async () => {
            const file = input.files[0];
            if (file && file.size <= MAX_FILE_SIZE) {
                try {
                    const resizedPhoto = await resizeImage(file);

                    // Save to IndexedDB instead of keeping in memory
                    const photoId = await savePhotoToIndexedDB(resizedPhoto);
                    photoData.push(photoId); // Store the ID reference instead of actual data

                    const imgContainer = document.createElement("div");
                    imgContainer.style.position = "relative";
                    imgContainer.style.display = "inline-block";
                    imgContainer.style.marginRight = "10px";
                    imgContainer.dataset.photoId = photoId; // Store the photo ID in the DOM element

                    const img = document.createElement("img");
                    img.src = `data:image/jpeg;base64,${resizedPhoto}`;
                    img.style.width = "100px";
                    imgContainer.appendChild(img);

                    const deleteButton = document.createElement("button");
                    deleteButton.textContent = "X";
                    deleteButton.style.position = "absolute";
                    deleteButton.style.top = "2px";
                    deleteButton.style.right = "2px";
                    deleteButton.style.backgroundColor = "black";
                    deleteButton.style.color = "white";
                    deleteButton.style.border = "none";
                    deleteButton.style.cursor = "pointer";
                    deleteButton.style.fontSize = "10px";
                    deleteButton.style.padding = "1px 3px";
                    deleteButton.style.borderRadius = "3px";

                    deleteButton.addEventListener("click", async () => {
                        const photoId = parseInt(imgContainer.dataset.photoId);
                        const index = photoData.indexOf(photoId);
                        if (index !== -1) {
                            photoData.splice(index, 1);
                            // Delete from IndexedDB
                            try {
                                await deletePhotoFromIndexedDB(photoId);
                            } catch (error) {
                                console.error("Error deleting photo:", error);
                            }
                        }
                        photoPreview.removeChild(imgContainer);
                    });

                    imgContainer.appendChild(deleteButton);
                    photoPreview.appendChild(imgContainer);
                    updateStatus("Photo added successfully.");
                } catch (error) {
                    console.error("Error processing photo:", error);
                    alert("Error processing photo. Please try again.");
                }
            } else {
                alert("Each photo must be under 15MB.");
            }
        });

        input.click();
    });

    form.addEventListener("submit", async (e) => {
        submitButton.setAttribute("disabled", true);
        e.preventDefault();

        if (!document.getElementById("latitude").value || !document.getElementById("longitude").value) {
            submitButton.removeAttribute("disabled");
            alert("Please capture GPS location before submitting.");
            return;
        }

        if (!photoData || !photoData.length) {
            submitButton.removeAttribute("disabled");
            alert("At least 1 photo is required.");
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        data.timestamp = new Date().toLocaleString();
        // data.photos = JSON.stringify(photoData);
        data.photoIds = JSON.stringify(photoData);

        if (typeof locationHistory !== 'undefined' && locationHistory.length > 0) {
            // Format: "lat1,lon1;lat2,lon2;lat3,lon3"
            data.locationHistory = locationHistory.map(loc =>
                `${loc.latitude},${loc.longitude}`
            ).join(';');
        } else {
            data.locationHistory = "";
        }
        updateStatus("Submitting form...");

        try {
            await saveAndSync(data);
            form.reset();
            photoData.length = 0;
            photoPreview.innerHTML = "";
            document.getElementById("latitude").value = "";
            document.getElementById("longitude").value = "";
            latitudeDisplay.textContent = "N/A";
            longitudeDisplay.textContent = "N/A";
            updateStatus("Form submitted successfully.");
            submitButton.removeAttribute("disabled");

            // Reset green-highlighted dropdowns
            if (typeof resetDropdowns === 'function') {
                resetDropdowns();
            }

            updatePendingCount();
            window.location.href = "index_page.html"
        } catch (error) {
            submitButton.removeAttribute("disabled");
            console.error("Submission error:", error);
            if (String(error)?.includes("exceeded the quota")) {
                alert("Storage quota limit reached. Please try again later.");
                updateStatus("Storage quota limit reached.");
                return;
            }

            if (navigator.onLine) {
                alert("There was an issue with the server. Please try again.");
            } else {
                // Save the data offline if the network is unavailable
                saveOffline(data);
                updateStatus("Network issue detected. Your form has been saved offline and will sync automatically when online.");
            }
            window.location.href = "index_page.html"
        }
    });

    // Function to reset dropdown highlights
    function resetDropdowns() {
        const dropdowns = document.querySelectorAll("select");
        dropdowns.forEach((dropdown) => {
            dropdown.classList.remove("answered"); // Remove the 'answered' class
            dropdown.value = ""; // Reset the dropdown to its default value
        });
    }

    function saveAndSync(data) {
        return new Promise(async (resolve, reject) => {
            try {
                await saveOffline(data);
                updateStatus("Response saved offline.");
                await syncData();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    function saveOffline(data) {
        const responses = JSON.parse(localStorage.getItem("observations_responses") || "[]");
        responses.push(data);
        localStorage.setItem("observations_responses", JSON.stringify(responses));
        updatePendingCount();
    }

    async function syncData() {
        const responses = JSON.parse(localStorage.getItem("observations_responses") || "[]");
        if (responses.length === 0) {
            updateStatus("No data to sync.");
            return;
        }

        let unsyncedResponses = [];
        const username = localStorage.getItem("username")
        const signIn = JSON.parse(localStorage.getItem("site_sign_in_status") || "{}");

        for (const response of responses) {
            try {
                response.username = username
                response.propertyName = signIn.propertyName
                const photoIds = structuredClone(response.photoIds || []);
                // For each submission, get the actual photo data from IndexedDB
                if (response.photoIds) {
                    const photoIds = JSON.parse(response.photoIds);
                    const photoDataArray = [];

                    // Get all photos from IndexedDB based on their IDs
                    for (const id of photoIds) {
                        try {
                            const photoData = await getPhotoFromIndexedDB(id);
                            photoDataArray.push(photoData);
                        } catch (error) {
                            console.error("Error retrieving photo from IndexedDB:", error);
                        }
                    }

                    // Store the actual photo data in the response
                    response.photos = JSON.stringify(photoDataArray);

                    // Remove the temporary photoIds field
                    delete response.photoIds;
                }

                response.action = "observation"

                if (navigator.onLine) {
                    await sendToGoogleSheet(response);
                    // delete photos
                    await Promise.all(JSON.parse(photoIds).map(id => deletePhotoFromIndexedDB(id)));
                }else{
                    unsyncedResponses.push(response);
                }

                updateStatus("Data synced successfully.");
            } catch (error) {
                console.error("Sync error for response:", response, error);
                unsyncedResponses.push(response);
            }
        }

        localStorage.setItem("observations_responses", JSON.stringify(unsyncedResponses));
        if (unsyncedResponses.length > 0) {
            updateStatus("Some data could not be synced.");
        } else {
            localStorage.removeItem("observations_responses");
        }

        updatePendingCount();
    }

    async function sendToGoogleSheet(data) {
        const scriptURL = `https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec`;
        const response = await fetch(scriptURL, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        });

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
    }

    viewPendingButton.addEventListener("click", () => {
        formContainer.style.display = "none";
        pendingContainer.style.display = "block";
        showFormButton.style.display = "inline";
        viewPendingButton.style.display = "none";
        displayPendingSubmissions();
    });

    showFormButton.addEventListener("click", () => {
        formContainer.style.display = "block";
        pendingContainer.style.display = "none";
        showFormButton.style.display = "none";
        viewPendingButton.style.display = "inline";
    });

    function displayPendingSubmissions() {
        const responses = JSON.parse(localStorage.getItem("observations_responses") || "[]");

        if (responses.length === 0) {
            pendingContainer.innerHTML = "No pending submissions.";
        } else {
            pendingContainer.innerHTML = "";
            responses.forEach((data, index) => {
                const entry = document.createElement("div");
                entry.innerHTML = `
         <p><strong>Submission #${index + 1}</strong></p>
                <p>Property Name: ${data.propertyName}</p>
                <p>Observed Numbers: ${data.observedNumbers}</p>
                <p>Third Party Interactions: ${data.thirdPartyInteractions}</p>
                ${data.thirdPartyInteractions === "Yes" && data.thirdPartyText ? `<p>Details: ${data.thirdPartyText}</p>` : ""}
                <p>Health and Safety Recommendations/Incidents/Observations: ${data.healthSafety}</p>
                ${data.healthSafety === "Yes" && data.healthSafetyText ? `<p>Details: ${data.healthSafetyText}</p>` : ""}
                <p>Latitude: ${data.latitude}</p>
                <p>Longitude: ${data.longitude}</p>
                <p>Timestamp: ${data.timestamp}</p>
                <hr>`;
                pendingContainer.appendChild(entry);
            });

            const latestStatus = localStorage.getItem("observations_latestStatus") || "No recent status message.";
            const statusMessageElement = document.createElement("p");
            statusMessageElement.style.color = "green";
            statusMessageElement.textContent = latestStatus;
            pendingContainer.appendChild(statusMessageElement);
        }
    }

    function updatePendingCount() {
        const responses = JSON.parse(localStorage.getItem("observations_responses") || "[]");
        const pendingCount = responses.length;
        viewPendingButton.textContent = `View Pending Submissions (${pendingCount})`;
    }

    updatePendingCount();

    window.addEventListener("online", () => {
        updateStatus("Device back online. Attempting to sync saved data...");
        syncData();
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const dropdowns = document.querySelectorAll("select");

    dropdowns.forEach((dropdown) => {
        dropdown.addEventListener("change", () => {
            if (dropdown.value) {
                dropdown.classList.add("answered");
            } else {
                dropdown.classList.remove("answered");
            }
        });
    });
});


function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        console.log("Active login session found.");
    } else {
        window.location.href = 'index.html';
    }
}

const loadDropdownScriptUrl = "https://script.google.com/macros/s/AKfycbxHUmozCiDaUZ2bwTbtlNwuKKijFlr1d6z1RHQF2_engq-eEodaaHgmIoSStFdOa-iugA/exec";
const localStorageKey = "observationsFormData";

// document.addEventListener("DOMContentLoaded", function () {
//     const savedData = localStorage.getItem(localStorageKey);
//     if (savedData) {
//         populateForm(JSON.parse(savedData));
//     } else {
//         fetchFormData();
//     }

//     if (navigator.onLine) {
//         fetchFormData();
//     }
// });

// function fetchFormData() {
//     fetch(loadDropdownScriptUrl)
//         .then(response => response.json())
//         .then(data => {
//             populateForm(data);
//             localStorage.setItem(localStorageKey, JSON.stringify(data));
//         })
//         .catch(error => {
//             console.error("Error fetching form data:", error);
//         });
// }

// function populateForm(data) {
//     if (!data) return;

//     const propertySelect = document.getElementById("propertyName");

//     propertySelect.innerHTML = generateOptions(data.propertyNames);
// }

// function generateOptions(options, isMultiple = false) {
//     let optionsHTML = isMultiple ? "" : `<option value="">Please Select</option>`;
//     options.forEach(option => {
//         optionsHTML += `<option value="${option}">${option}</option>`;
//     });
//     return optionsHTML;
// }

window.onload = checkLoginStatus;