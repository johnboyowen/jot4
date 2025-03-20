const STORAGE_KEYS = {
    signInData: 'site_sign_in_data',
    signInStatus: 'site_sign_in_status',
};

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
    const propertyNameSelect = document.getElementById("propertyName");
    const boatInspectionGroup = document.getElementById("boatInspectionGroup");

    const MAX_FILE_SIZE = 15000000; // 15MB per photo
    const MAX_PHOTOS = 5; // Maximum number of photos allowed
    const photoData = []; // Array to store resized Base64-encoded photos
    const propellerPhotoData = []; // Array to store resized Base64-encoded photos
    const auxPropellerPhotoData = []; // Array to store resized Base64-encoded photos

    const takePhotoButton = document.getElementById("takePhoto");
    const photoPreview = document.getElementById("photoPreview");

    function updateStatus(message) {
        statusDisplay.textContent = message;
        localStorage.setItem("site_sign_in_latestStatus", message); // Save latest status specific to site sign-in
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
        const scriptURL = `https://script.google.com/macros/s/AKfycbwF21dLgvO7OQ9kv5DemOKwPqVsykfzKh3aT4nJPVwf6NfgCloGUuUlo3jYvc8ni4UqMg/exec`;
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

    propertyNameSelect.addEventListener("change", () => {
        if (propertyNameSelect.value === "Knoydart") {
            boatInspectionGroup.style.display = "block";
        } else {
            boatInspectionGroup.style.display = "none";
        }
    });

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

            gpsButton.setAttribute("disabled", true)

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
                        startLocationTracking()
                        gpsButton.removeAttribute("disabled")
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
                    photoData.push(resizedPhoto);

                    const imgContainer = document.createElement("div");
                    imgContainer.style.position = "relative";
                    imgContainer.style.display = "inline-block";
                    imgContainer.style.marginRight = "10px";

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

                    deleteButton.addEventListener("click", () => {
                        const index = photoData.indexOf(resizedPhoto);
                        if (index !== -1) photoData.splice(index, 1);
                        photoPreview.removeChild(imgContainer);
                    });

                    imgContainer.appendChild(deleteButton);
                    photoPreview.appendChild(imgContainer);
                    updateStatus("Photo added successfully.");
                } catch (error) {
                    alert("Error processing photo. Please try again.");
                }
            } else {
                alert("Each photo must be under 15MB.");
            }
        });

        input.click();
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!document.getElementById("latitude").value || !document.getElementById("longitude").value) {
            alert("Please capture GPS location before submitting.");
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        data.additionalStalkers = Array.from(
            form.querySelector("#additionalStalkers").selectedOptions,
            option => option.value
        ).join(",");

        data.timestamp = new Date().toLocaleString();
        data.photos = JSON.stringify(photoData);
        data.propellerPhoto = propellerPhotoData;
        data.auxPropellerPhoto = auxPropellerPhotoData;

        if (locationHistory.length > 0) {
            // Format: "lat1,lon1;lat2,lon2;lat3,lon3"
            data.locationHistory = locationHistory.map(loc =>
                `${loc.latitude},${loc.longitude}`
            ).join(';');
        } else {
            data.locationHistory = "";
        }

        const formId = `form_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        data.formId = formId;

        try {
            await saveAndSync(data);
            localStorage.setItem("current_site_sign_in_tracking_form_id", formId);
            form.reset();
            photoData.length = 0;
            photoPreview.innerHTML = "";
            document.getElementById("latitude").value = "";
            document.getElementById("longitude").value = "";
            latitudeDisplay.textContent = "N/A";
            longitudeDisplay.textContent = "N/A";
            updateStatus("Form submitted successfully.");

            // Reset green-highlighted dropdowns
            resetDropdowns();

            updatePendingCount();
        } catch (error) {
            console.error("Submission error:", error);
            alert("There was an error submitting the form. Please try again.");
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
        saveOffline(data);
        updateStatus("Response saved offline.");
        if (navigator.onLine) {
            syncData();
        }
    }

    function saveOffline(data) {
        const responses = JSON.parse(localStorage.getItem("site_sign_in_responses") || "[]");
        responses.push(data);
        localStorage.setItem("site_sign_in_responses", JSON.stringify(responses));
    }

    async function syncData() {
        const responses = JSON.parse(localStorage.getItem("site_sign_in_responses") || "[]");
        if (responses.length === 0) {
            updateStatus("No data to sync.");
            return;
        }

        let unsyncedResponses = [];
        const username = localStorage.getItem("username")
        for (const response of responses) {
            try {
                response.username = username
                await sendToGoogleSheet(response);
                updateStatus("Data synced successfully.");
            } catch (error) {
                console.error("Sync error for response:", response, error);
                unsyncedResponses.push(response);
            }
        }

        localStorage.setItem("site_sign_in_responses", JSON.stringify(unsyncedResponses));
        if (unsyncedResponses.length > 0) {
            updateStatus("Some data could not be synced.");
        } else {
            localStorage.removeItem("site_sign_in_responses");
            window.location.href = "index_page.html"
        }

        updatePendingCount();
    }

    async function sendToGoogleSheet(data) {
        data.action = "signin"
        const scriptURL = "https://script.google.com/macros/s/AKfycbwF21dLgvO7OQ9kv5DemOKwPqVsykfzKh3aT4nJPVwf6NfgCloGUuUlo3jYvc8ni4UqMg/exec";
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
        const responses = JSON.parse(localStorage.getItem("site_sign_in_responses") || "[]");

        if (responses.length === 0) {
            pendingContainer.innerHTML = "No pending submissions.";
        } else {
            pendingContainer.innerHTML = "";
            responses.forEach((data, index) => {
                const entry = document.createElement("div");
                entry.innerHTML = `<p><strong>Submission #${index + 1}</strong></p>
                                   <p>Property Name: ${data.propertyName}</p>
                                   <p>Number of Stalkers: ${data.numberOfStalkers}</p>
                                   <p>Names of Additional Stalkers: ${data.additionalStalkers}</p>
                                   <p>JMT Approval: ${data.jmtApproval}</p>
                                   <p>Exemptions Granted: ${data.exemptions}</p>
                                   <p>Latitude: ${data.latitude}</p>
                                   <p>Longitude: ${data.longitude}</p>
                                   <p>Timestamp: ${data.timestamp}</p>
                                   <hr>`;
                pendingContainer.appendChild(entry);
            });

            const latestStatus = localStorage.getItem("site_sign_in_latestStatus") || "No recent status message.";
            const statusMessageElement = document.createElement("p");
            statusMessageElement.style.color = "green";
            statusMessageElement.textContent = latestStatus;
            pendingContainer.appendChild(statusMessageElement);
        }
    }

    function updatePendingCount() {
        const responses = JSON.parse(localStorage.getItem("site_sign_in_responses") || "[]");
        const pendingCount = responses.length;
        viewPendingButton.textContent = `View Pending Submissions (${pendingCount})`;
    }

    updatePendingCount();

    window.addEventListener("online", () => {
        updateStatus("Device back online. Attempting to sync saved data...");
        syncData();
    });

    function setupKnoydartConditionalForm() {
        const propertyNameSelect = document.getElementById("propertyName");
        const formContainer = document.getElementById("offlineForm");
        const submitButtonContainer = document.getElementById("buttons");

        // Create container divs for Knoydart-specific sections
        const onShoreSection = document.createElement("div");
        onShoreSection.id = "onShoreSection";
        onShoreSection.className = "knoydart-section";
        onShoreSection.style.display = "none";
        onShoreSection.innerHTML = `
            <h3>On Shore Safe Start Up</h3>
            
            <div class="form-group">
                <label for="skipperDetails">Skipper Details</label>
                <select id="skipperDetails" name="skipperDetails">
                    <option value="">Please Select</option>
                    <option value="David Balharry">David Balharry</option>
                    <option value="John Macrae">John Macrae</option>
                    <option value="Ally Macaskill">Ally Macaskill</option>
                    <option value="Stewart MacSween">Stewart MacSween</option>
                    <option value="Michael Stokes">Michael Stokes</option>
                    <option value="Colin Grant">Colin Grant</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="validLicense">Are you in possession of a valid RYA/MCA Powerboat Level 2 Licence?</label>
                <select id="validLicense" name="validLicense">
                    <option value="">Please Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
                <div id="licenseWarning" class="warning-message" style="display: none; color: red;">
                    PLEASE SUSPEND FURTHER ACTION YOU ARE NOT COMPETENT TO OPERATE SAFELY
                </div>
            </div>
            
            <div class="form-group">
                <label for="commercialEndorsement">Is your licence endorsed for 'COMMERCIAL USE'?</label>
                <select id="commercialEndorsement" name="commercialEndorsement">
                    <option value="">Please Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
                <div id="endorsementWarning" class="warning-message" style="display: none; color: red;">
                    PLEASE SUSPEND FURTHER ACTION YOU ARE NOT AUTHORISED TO USE/TAKE PASSENGERS ONBOARD FOR JMT USE
                </div>
            </div>
            
            <div class="form-group">
                <label for="passengerCount">Please confirm number of passengers including skipper</label>
                <select id="passengerCount" name="passengerCount">
                    <option value="">Please Select</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                </select>
                <div class="helper-text">NOTE: TOTAL PASSENGER COUNT MUST BE AT LEAST 2 AND MUST NOT EXCEED 6</div>
            </div>
            
            <div class="form-group">
                <label for="passengerNames">Please provide passenger names</label>
                <textarea id="passengerNames" name="passengerNames" rows="4"></textarea>
            </div>
            
            <div class="form-group">
                <label for="safetyBriefing">Have passengers heard, read and understood the JMT safety briefing and emergency procedure?</label>
                <select id="safetyBriefing" name="safetyBriefing">
                    <option value="">Please Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
                <div id="briefingWarning" class="warning-message" style="display: none; color: red;">
                    PLEASE SUSPEND FURTHER ACTION UNTIL PASSENGERS ARE FULLY BRIEFED
                </div>
            </div>
            
            <div class="form-group">
                <label for="lifeJacketsChecked">Have life jackets been condition and date checked?</label>
                <select id="lifeJacketsChecked" name="lifeJacketsChecked">
                    <option value="">Please Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
                <div id="lifeJacketsWarning" class="warning-message" style="display: none; color: red;">
                    PLEASE SUSPEND FURTHER ACTION UNTIL COMPLIANT LIFE JACKETS ARE OBTAINED
                </div>
            </div>
            
            <div class="form-group">
                <label for="lifeJacketsWorn">Have passengers been issued with life jackets and are worn correctly?</label>
                <select id="lifeJacketsWorn" name="lifeJacketsWorn">
                    <option value="">Please Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                </select>
                <div id="lifeJacketsWornWarning" class="warning-message" style="display: none; color: red;">
                    PLEASE SUSPEND FURTHER ACTION UNTIL PASSENGERS ARE PREPARED
                </div>
            </div>
            
            <div class="form-group">
                <label for="windDirection">Wind Direction</label>
                <select id="windDirection" name="windDirection">
                    <option value="">Please Select</option>
                    <option value="0">0° — north wind (N)</option>
                    <option value="22.5">22.5° — north-northeast wind (NNE)</option>
                    <option value="45">45° — northeast wind (NE)</option>
                    <option value="67.5">67.5° — east-northeast wind (ENE)</option>
                    <option value="112.5">112.5° — east-southeast wind (ESE)</option>
                    <option value="135">135° — southeast wind (SE)</option>
                    <option value="157.5">157.5° — south-southeast wind (SSE)</option>
                    <option value="180">180° — south wind (S)</option>
                    <option value="202.5">202.5° — south-southwest wind (SSW)</option>
                    <option value="225">225° — southwest wind (SW)</option>
                    <option value="247.5">247.5° — west-southwest wind (WSW)</option>
                    <option value="270">270° — west wind (W)</option>
                    <option value="292.5">292.5° — west-northwest wind (WNW)</option>
                    <option value="315">315° — northwest wind (NW)</option>
                    <option value="337.5">337.5° — north-northwest wind (NNW)</option>
                    <option value="360">360° — north wind (N)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="windSpeed">Wind Speed</label>
                <select id="windSpeed" name="windSpeed">
                    <option value="">Please Select</option>
                    <option value="lt4">< 4 knots</option>
                    <option value="4-9">4-9 knots</option>
                    <option value="9-13">9-13 knots</option>
                    <option value="13-17">13-17 knots</option>
                    <option value="17-22">17-22 knots</option>
                    <option value="gt22">> 22 knots</option>
                </select>
                <div id="windWarning" class="warning-message" style="display: none; color: red;"></div>
            </div>
        `;

        const onVesselSection = document.createElement("div");
        onVesselSection.id = "onVesselSection";
        onVesselSection.className = "knoydart-section";
        onVesselSection.style.display = "none";
        onVesselSection.innerHTML = `
            <h3>On Vessel Safe Start Up before embarking and 1st passage</h3>
            
            <div class="form-group vessel-group">
                <h4>Mooring Condition</h4>
                <div class="sub-group">
                    <label for="mooringRopes">Mooring ropes in good condition</label>
                    <select id="mooringRopes" name="mooringRopes">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="shacklesCondition">Shackles are operable, lubricated and in good condition</label>
                    <select id="shacklesCondition" name="shacklesCondition">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div id="mooringFaultRecord" class="fault-record" style="display: none;">
                    <label for="mooringFault">Fault Record:</label>
                    <textarea id="mooringFault" name="mooringFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
            </div>
            
            <div class="form-group vessel-group">
                <h4>Vessel Integrity checked for damage or water ingress</h4>
                <div class="sub-group">
                    <label for="externalHull">External Hull Condition checked</label>
                    <select id="externalHull" name="externalHull">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="internalStructure">Internal structure/deck checked</label>
                    <select id="internalStructure" name="internalStructure">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="bulkheads">Bulkheads/structural members checked</label>
                    <select id="bulkheads" name="bulkheads">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="hingedHull">Hinged Hull section checked and watertight</label>
                    <select id="hingedHull" name="hingedHull">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div id="hullFaultRecord" class="fault-record" style="display: none;">
                    <label for="hullFault">Fault Record:</label>
                    <textarea id="hullFault" name="hullFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
            </div>

            <div class="form-group vessel-group">
                <h4>Propeller/Rudder</h4>
                <div class="sub-group">
                    <label for="rudderOperational">Rudder/steering operational and checked for damage/corrosion/wear</label>
                    <select id="rudderOperational" name="rudderOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="mainPropeller">Main propeller checked for damage/corrosion/wear</label>
                    <select id="mainPropeller" name="mainPropeller">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="mainPropellerPhoto">Attach Photograph of Main propeller</label>
                    <button type="button" id="takeMainPropellerPhoto" class="btn btn-primary">Take Photo</button>
                    <div id="mainPropellerPhotoPreview" class="photo-preview"></div>
                </div>
                
                <div id="mainPropellerFaultRecord" class="fault-record" style="display: none;">
                    <label for="mainPropellerFault">Fault Record:</label>
                    <textarea id="mainPropellerFault" name="mainPropellerFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
                
                <div class="sub-group">
                    <label for="auxPropeller">Auxiliary engine propeller checked for damage/corrosion/wear</label>
                    <select id="auxPropeller" name="auxPropeller">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="auxPropellerPhoto">Attach Photograph of Auxiliary propeller</label>
                    <button type="button" id="takeAuxPropellerPhoto" class="btn btn-primary">Take Photo</button>
                    <div id="auxPropellerPhotoPreview" class="photo-preview"></div>
                </div>
                
                <div id="auxPropellerFaultRecord" class="fault-record" style="display: none;">
                    <label for="auxPropellerFault">Fault Record:</label>
                    <textarea id="auxPropellerFault" name="auxPropellerFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
            </div>

            <div class="form-group vessel-group">
                <h4>Engine Condition/Fuel system</h4>
                <div class="sub-group">
                    <label for="mainEngineCasing">Main engine casing checked for damage/corrosion/leaks</label>
                    <select id="mainEngineCasing" name="mainEngineCasing">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="correctEngineOil">Confirm correct engine oil level</label>
                    <select id="correctEngineOil" name="correctEngineOil">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="coolantTellTail">Confirm coolant tell tale </label>
                    <select id="coolantTellTail" name="coolantTellTail">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="auxEngineCasing">Auxilliary engine casing checked for damage/corrosion/leaks</label>
                    <select id="auxEngineCasing" name="auxEngineCasing">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="fuelLinesStatus">Fuel lines checked for damage/wear/leaks</label>
                    <select id="fuelLinesStatus" name="fuelLinesStatus">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="auxEngineOperational">Confirm auxilliary engine is operational</label>
                    <select id="auxEngineOperational" name="auxEngineOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div id="auxEngineFaultRecord" class="fault-record" style="display: none;">
                    <label for="auxEngineFault">Fault Record:</label>
                    <textarea id="auxEngineFault" name="auxEngineFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>

                <div class="sub-group">
                    <label for="fuelTankFull">Confirm fuel tank is full</label>
                    <select id="fuelTankFull" name="fuelTankFull">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="contaminationCheck">Fuel separator checked for contamination</label>
                    <select id="contaminationCheck" name="contaminationCheck">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div id="contaminationFaultRecord" class="fault-record" style="display: none;">
                    <label for="contaminationFault">Fault Record:</label>
                    <textarea id="contaminationFault" name="contaminationFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        REFILL (E5 Grade) OR CLEAN DOWN AND REFILL (E5 Grade)
                    </div>
                </div>

            </div>

            <div class="form-group vessel-group">
                <h4>Electrical/Navigation system</h4>
                <div class="sub-group">
                    <label for="batteriesOperational">Confirm batteries are secured and checked for damage/corrosion/leaks and isolation</label>
                    <select id="batteriesOperational" name="batteriesOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div class="sub-group">
                    <label for="compassOperational">Check compass is readable and accurate</label>
                    <select id="compassOperational" name="compassOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                <div class="sub-group">
                    <label for="navigationLightOperational">Confirm navigation lights are visible and operational</label>
                    <select id="navigationLightOperational" name="navigationLightOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                
                <div id="navigationLightFaultRecord" class="fault-record" style="display: none;">
                    <label for="navigationLightFault">Fault Record:</label>
                    <textarea id="navigationLightFault" name="navigationLightFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
            </div>

            <div class="form-group vessel-group">
                <h4>Safety/Fire Equipment</h4>
                <div class="sub-group">
                    <label for="lifeBeltsOperational">Ensure life belts (circular and horseshoe) are accessible and in good condition</label>
                    <select id="lifeBeltsOperational" name="lifeBeltsOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="lifeRaftOperational">Ensure life raft is serviceable and secured on vessel</label>
                    <select id="lifeRaftOperational" name="lifeRaftOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="additionalLifeJacketsAvailability">Check and confirm additional life jackets are available on vessel (at least 2)</label>
                    <select id="additionalLifeJacketsAvailability" name="additionalLifeJacketsAvailability">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="killCordOperational">Confirm 'Kill Cord' is present, operational and in good condition</label>
                    <select id="killCordOperational" name="killCordOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="fireExtinguishersAvailability">Fire extinguishers are available on vessel within validation period (minimum 2 number)</label>
                    <select id="fireExtinguishersAvailability" name="fireExtinguishersAvailability">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div class="sub-group">
                    <label for="vhfRadioOperational">Confirm VHF radio is operational and set to scan or channel 16</label>
                    <select id="vhfRadioOperational" name="vhfRadioOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                <div id="vhfRadioFaultRecord" class="fault-record" style="display: none;">
                    <label for="vhfRadioFault">Fault Record:</label>
                    <textarea id="vhfRadioFault" name="vhfRadioFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>

                <div class="sub-group">
                    <label for="firstAidKitAvailability">Check and confirm completeness of first aid kit</label>
                    <select id="firstAidKitAvailability" name="firstAidKitAvailability">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>

                 <div id="firstAidKitFaultRecord" class="fault-record" style="display: none;">
                    <label for="firstAidKitFault">Fault Record:</label>
                    <textarea id="firstAidKitFault" name="firstAidKitFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        ESTABLISH WHAT REQUIRES TO BE REPLENISHED
                    </div>
                </div>

            </div>

            <div class="form-group vessel-group">
                <h4>Start up</h4>
                <div class="sub-group">
                    <label for="engineOperational">Confirm engine start up/warm up </label>
                    <select id="engineOperational" name="engineOperational">
                        <option value="">Please Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                <div id="engineFaultRecord" class="fault-record" style="display: none;">
                    <label for="engineFault">Fault Record:</label>
                    <textarea id="engineFault" name="engineFault" rows="2"></textarea>
                    <div class="warning-message" style="color: red;">
                        DO NOT USE VESSEL
                    </div>
                </div>
            </div>
            
        `;

        // Insert the sections in the existing form
        formContainer.insertBefore(onShoreSection, submitButtonContainer);
        formContainer.insertBefore(onVesselSection, submitButtonContainer);

        // Add event listeners for Knoydart property selection
        propertyNameSelect.addEventListener("change", function () {
            const kSectionForms = [...document.getElementsByClassName("knoydart-section")[0].getElementsByTagName('select'), ...document.getElementsByClassName("knoydart-section")[1].getElementsByTagName('select')]
            if (this.value === "Knoydart") {
                kSectionForms.forEach(select => select.setAttribute("required", true))
                document.getElementById("boatInspectionGroup").style.display = "block";
                document.getElementById("onShoreSection").style.display = "block";
                document.getElementById("onVesselSection").style.display = "block";
            } else {
                kSectionForms.forEach(select => select.removeAttribute("required"))
                document.getElementById("boatInspectionGroup").style.display = "none";
                document.getElementById("onShoreSection").style.display = "none";
                document.getElementById("onVesselSection").style.display = "none";
            }
        });

        // Setup warning messages for specific selections
        document.getElementById("validLicense").addEventListener("change", function () {
            document.getElementById("licenseWarning").style.display =
                this.value === "No" ? "block" : "none";
        });

        document.getElementById("commercialEndorsement").addEventListener("change", function () {
            document.getElementById("endorsementWarning").style.display =
                this.value === "No" ? "block" : "none";
        });

        document.getElementById("safetyBriefing").addEventListener("change", function () {
            document.getElementById("briefingWarning").style.display =
                this.value === "No" ? "block" : "none";
        });

        document.getElementById("lifeJacketsChecked").addEventListener("change", function () {
            document.getElementById("lifeJacketsWarning").style.display =
                this.value === "No" ? "block" : "none";
        });

        document.getElementById("lifeJacketsWorn").addEventListener("change", function () {
            document.getElementById("lifeJacketsWornWarning").style.display =
                this.value === "No" ? "block" : "none";
        });

        // Wind warning conditions
        const windDirection = document.getElementById("windDirection");
        const windSpeed = document.getElementById("windSpeed");
        const windWarning = document.getElementById("windWarning");

        function checkWindConditions() {
            const directionVal = windDirection.value;
            const speedVal = windSpeed.value;

            windWarning.style.display = "none";
            windWarning.textContent = "";

            // Check SSW/SW directions with high wind speeds
            if ((directionVal === "202.5" || directionVal === "225") &&
                (speedVal === "13-17" || speedVal === "17-22" || speedVal === "gt22")) {
                windWarning.style.display = "block";
                windWarning.textContent = "PLEASE REVIEW WIND SPEED PRIOR TO DEPARTURE/RETURN. WITH SSW/SW WIND DIRECTION AND EXCEEDING 20MPH, BOAT USE IS PROHIBITED";
            }
            // Check high wind speeds regardless of direction
            else if (speedVal === "17-22" || speedVal === "gt22") {
                windWarning.style.display = "block";
                windWarning.textContent = "BOAT USE IS PROHIBITED - WIND SPEED TOO HIGH";
            }
            // Check moderate wind speeds
            else if (speedVal === "13-17") {
                windWarning.style.display = "block";
                windWarning.textContent = "CAUTION HIGH RISK OF DIFFICULT HANDLING, PLEASE REVIEW WIND DIRECTION PRIOR TO DEPARTURE/RETURN";
            }
        }

        windDirection.addEventListener("change", checkWindConditions);
        windSpeed.addEventListener("change", checkWindConditions);

        // Handle vessel fault records
        document.getElementById("mooringRopes").addEventListener("change", function () {
            checkMooringFaults();
        });

        document.getElementById("shacklesCondition").addEventListener("change", function () {
            checkMooringFaults();
        });

        function checkMooringFaults() {
            const mooringRopes = document.getElementById("mooringRopes").value;
            const shacklesCondition = document.getElementById("shacklesCondition").value;

            if ((mooringRopes === "No" || shacklesCondition === "No") &&
                (mooringRopes !== "" && shacklesCondition !== "")) {
                document.getElementById("mooringFaultRecord").style.display = "block";
            } else {
                document.getElementById("mooringFaultRecord").style.display = "none";
            }
        }

        // Similar functions for the vessel integrity section
        const vesselIntegrityFields = ["externalHull", "internalStructure", "bulkheads", "hingedHull"];

        function checkVesselIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            vesselIntegrityFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("hullFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("hullFaultRecord").style.display = "none";
            }
        }

        vesselIntegrityFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", checkVesselIntegrity);
        });

        const propellerIntegrityFields = ["rudderOperational", "mainPropeller"];

        function propellerIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            propellerIntegrityFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("mainPropellerFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("mainPropellerFaultRecord").style.display = "none";
            }
        }

        propellerIntegrityFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", propellerIntegrity);
        });

        const auxPropellerIntegrityFields = ["auxPropeller"];

        function auxPropellerIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            auxPropellerIntegrityFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("auxPropellerFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("auxPropellerFaultRecord").style.display = "none";
            }
        }

        auxPropellerIntegrityFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", auxPropellerIntegrity);
        });


        const engineConditionFields = ["mainEngineCasing", "correctEngineOil", "coolantTellTail", "auxEngineCasing", "fuelLinesStatus", "auxEngineOperational"];

        function engineConditionIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            engineConditionFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("auxEngineFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("auxEngineFaultRecord").style.display = "none";
            }
        }

        engineConditionFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", engineConditionIntegrity);
        });

        const fuelTankFields = ["fuelTankFull", "contaminationCheck"];

        function fuelTankIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            fuelTankFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("contaminationFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("contaminationFaultRecord").style.display = "none";
            }
        }

        fuelTankFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", fuelTankIntegrity);
        });


        const electricalFields = ["batteriesOperational", "compassOperational", "navigationLightOperational"];

        function electricalIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            electricalFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("navigationLightFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("navigationLightFaultRecord").style.display = "none";
            }
        }

        electricalFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", electricalIntegrity);
        });

        const safetyFields = ["lifeBeltsOperational", "lifeRaftOperational", "additionalLifeJacketsAvailability", "killCordOperational", "fireExtinguishersAvailability", "vhfRadioOperational"];

        function safetyIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            safetyFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("vhfRadioFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("vhfRadioFaultRecord").style.display = "none";
            }
        }

        safetyFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", safetyIntegrity);
        });

        const firstAidFields = ["firstAidKitAvailability"];

        function firstAidIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            firstAidFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("firstAidKitFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("firstAidKitFaultRecord").style.display = "none";
            }
        }

        firstAidFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", firstAidIntegrity);
        });


        const engineStartUpFields = ["engineOperational"];

        function engineStartupIntegrity() {
            let hasNegativeResponse = false;
            let allFieldsAnswered = true;

            engineStartUpFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value === "No") {
                    hasNegativeResponse = true;
                }
                if (field.value === "") {
                    allFieldsAnswered = false;
                }
            });

            if (hasNegativeResponse && allFieldsAnswered) {
                document.getElementById("engineFaultRecord").style.display = "block";
            } else if (allFieldsAnswered) {
                document.getElementById("engineFaultRecord").style.display = "none";
            }
        }

        engineStartUpFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener("change", engineStartupIntegrity);
        });


        // // Add "take vessel photo" functionality 
        // document.getElementById("takeVesselPhoto").addEventListener("click", function () {
        //     // Reuse your existing photo taking code but for vessel photos
        //     const input = document.createElement("input");
        //     input.type = "file";
        //     input.accept = "image/*";
        //     input.capture = "environment";

        //     input.addEventListener("change", async () => {
        //         const file = input.files[0];
        //         if (file) {
        //             try {
        //                 // You could reuse your existing resizeImage function here
        //                 const reader = new FileReader();
        //                 reader.onload = (event) => {
        //                     const img = document.createElement("img");
        //                     img.src = event.target.result;
        //                     img.style.width = "100px";
        //                     img.style.marginRight = "10px";
        //                     document.getElementById("vesselPhotoPreview").appendChild(img);
        //                 };
        //                 reader.readAsDataURL(file);
        //             } catch (error) {
        //                 alert("Error processing photo. Please try again.");
        //             }
        //         }
        //     });

        //     input.click();
        // });

        document.getElementById("takeMainPropellerPhoto").addEventListener("click", function () {
            if (propellerPhotoData.length >= 1) {
                alert("You can only upload 1 photo.")
                return;
            }

            // Reuse your existing photo taking code but for vessel photos
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";

            input.addEventListener("change", async () => {
                const file = input.files[0];
                if (file && file.size <= MAX_FILE_SIZE) {
                    try {
                        const resizedPhoto = await resizeImage(file);
                        propellerPhotoData.push(resizedPhoto);
    
                        const imgContainer = document.createElement("div");
                        imgContainer.style.position = "relative";
                        imgContainer.style.display = "inline-block";
                        imgContainer.style.marginRight = "10px";
    
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
    
                        deleteButton.addEventListener("click", () => {
                            const index = propellerPhotoData.indexOf(resizedPhoto);
                            if (index !== -1) propellerPhotoData.splice(index, 1);
                            document.getElementById("mainPropellerPhotoPreview").removeChild(imgContainer);
                        });
    
                        imgContainer.appendChild(deleteButton);
                        document.getElementById("mainPropellerPhotoPreview").appendChild(imgContainer);
                        updateStatus("Photo added successfully.");
                    } catch (error) {
                        alert("Error processing photo. Please try again.");
                    }
                } else {
                    alert("Each photo must be under 15MB.");
                }
            });
            input.click();
        });

        document.getElementById("takeAuxPropellerPhoto").addEventListener("click", function () {
            if (auxPropellerPhotoData.length >= 1) {
                alert("You can only upload 1 photo.")
                return;
            }
            // Reuse your existing photo taking code but for vessel photos
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";

            input.addEventListener("change", async () => {
                const file = input.files[0];
                if (file && file.size <= MAX_FILE_SIZE) {
                    try {
                        const resizedPhoto = await resizeImage(file);
                        auxPropellerPhotoData.push(resizedPhoto);
    
                        const imgContainer = document.createElement("div");
                        imgContainer.style.position = "relative";
                        imgContainer.style.display = "inline-block";
                        imgContainer.style.marginRight = "10px";
    
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
    
                        deleteButton.addEventListener("click", () => {
                            const index = auxPropellerPhotoData.indexOf(resizedPhoto);
                            if (index !== -1) auxPropellerPhotoData.splice(index, 1);
                            document.getElementById("auxPropellerPhotoPreview").removeChild(imgContainer);
                        });
    
                        imgContainer.appendChild(deleteButton);
                        document.getElementById("auxPropellerPhotoPreview").appendChild(imgContainer);
                        updateStatus("Photo added successfully.");
                    } catch (error) {
                        alert("Error processing photo. Please try again.");
                    }
                } else {
                    alert("Each photo must be under 15MB.");
                }
            });

            input.click();
        });
    }

    setupKnoydartConditionalForm();
});

window.addEventListener('storage', function (event) {
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
        updatePendingCounts();
        updateFormAccessibility();
    }
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

const loadDropdownScriptUrl = "https://script.google.com/macros/s/AKfycbwF21dLgvO7OQ9kv5DemOKwPqVsykfzKh3aT4nJPVwf6NfgCloGUuUlo3jYvc8ni4UqMg/exec?action=dropdowns";
const localStorageKey = STORAGE_KEYS.signInData;

document.addEventListener("DOMContentLoaded", function () {
    const savedData = localStorage.getItem(localStorageKey);
    if (savedData) {
        console.log("Using data from localStorage");
        populateForm(JSON.parse(savedData));
    } else {
        console.log("No data in localStorage, fetching from server");
        fetchFormData();
    }

    if (navigator.onLine) {
        fetchFormData();
    }
});

function fetchFormData() {
    fetch(loadDropdownScriptUrl)
        .then(response => response.json())
        .then(data => {
            populateForm(data);
            localStorage.setItem(localStorageKey, JSON.stringify(data));
        })
        .catch(error => {
            console.error("Error fetching form data:", error);
        });
}

function populateForm(data) {
    if (!data) return;

    const propertySelect = document.getElementById("propertyName");
    const stalkersSelect = document.getElementById("additionalStalkers");
    const exemptionsSelect = document.getElementById("exemptions");
    const contractorSelect = document.getElementById("leadContractor");

    propertySelect.innerHTML = generateOptions(data.propertyNames);
    stalkersSelect.innerHTML = generateOptions(data.additionalStalkers, true);
    exemptionsSelect.innerHTML = generateOptions(data.exemptions);
    contractorSelect.innerHTML = generateOptions(data.leadContractors);
}

function generateOptions(options, isMultiple = false) {
    let optionsHTML = isMultiple ? "" : `<option value="">Please Select</option>`;
    options.forEach(option => {
        optionsHTML += `<option value="${option}">${option}</option>`;
    });
    return optionsHTML;
}

window.onload = checkLoginStatus;