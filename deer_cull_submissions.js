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

    const MAX_FILE_SIZE = 15000000; // 15MB per photo
    const MAX_PHOTOS = 5; // Maximum number of photos allowed
    const photoData = []; // Array to store resized Base64-encoded photos

    const takePhotoButton = document.getElementById("takePhoto");
    const photoPreview = document.getElementById("photoPreview");

    function updateStatus(message) {
        statusDisplay.textContent = message;
        localStorage.setItem("deer_cull_latestStatus", message); // Store latest status message specific to Deer Cull
    }

gpsButton.addEventListener("click", () => {
    if (navigator.geolocation) {
        let watchId;
        let timerId;
        const maxTime = 180; // Maximum allowed time in seconds
        let remainingTime = maxTime;

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
        }

        function updateTimer(message) {
            timerDisplay.textContent = message || `Time remaining: ${remainingTime}s`;
        }

        // Start the countdown timer
        timerId = setInterval(() => {
            remainingTime--;
            if (remainingTime <= 0) {
                updateTimer("Time expired. Try again.");
                stopWatching(); // Stop watching when the timer ends
            } else {
                updateTimer();
            }
        }, 1000); // Update every second

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const accuracy = position.coords.accuracy;

                // Check if accuracy is within acceptable range (e.g., 10 meters)
                if (accuracy <= 10) {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;

                    document.getElementById("latitude").value = latitude;
                    document.getElementById("longitude").value = longitude;
                    latitudeDisplay.textContent = latitude;
                    longitudeDisplay.textContent = longitude;

                    updateStatus(`High-accuracy GPS location captured (${accuracy.toFixed(2)} meters).`);
                    
                    // Stop watching once the desired accuracy is achieved
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
                enableHighAccuracy: true, // Use GPS as the priority
                timeout: maxTime * 1000, // Set timeout in milliseconds
                maximumAge: 0            // Always fetch fresh location
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

                    resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]); // Resize and convert to Base64
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

    // Ensure GPS coordinates are captured
    if (!document.getElementById("latitude").value || !document.getElementById("longitude").value) {
        alert("Please capture GPS location before submitting.");
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    data.timestamp = new Date().toLocaleString();
    data.photos = JSON.stringify(photoData);

    updateStatus("Submitting form...");

    try {
        // Attempt to save and sync data
        await saveAndSync(data);

        // Reset the form after successful submission
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

        if (navigator.onLine) {
            alert("There was an issue with the server. Please try again.");
        } else {
            // Save the data offline if the network is unavailable
            saveOffline(data);
            updateStatus("Network issue detected. Your form has been saved offline and will sync automatically when online.");
        }
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
        const responses = JSON.parse(localStorage.getItem("deer_cull_responses") || "[]");
        responses.push(data);
        localStorage.setItem("deer_cull_responses", JSON.stringify(responses));
    }

async function syncData() {
    const responses = JSON.parse(localStorage.getItem("deer_cull_responses") || "[]");
    if (responses.length === 0) {
        updateStatus("No data to sync.");
        return;
    }

    let unsyncedResponses = [];
    for (const response of responses) {
        try {
            await sendToGoogleSheet(response); // Check submission success
            updateStatus("Data synced successfully."); // Mark as synced
        } catch (error) {
            console.error("Sync error for response:", response, error);
            unsyncedResponses.push(response); // Keep unsynced responses
        }
    }

    // Update local storage with unsynced responses
    localStorage.setItem("deer_cull_responses", JSON.stringify(unsyncedResponses));

    if (unsyncedResponses.length > 0) {
        updateStatus("Some data could not be synced.");
    } else {
        localStorage.removeItem("deer_cull_responses"); // Clear storage if all synced
    }

    updatePendingCount();
}

async function sendToGoogleSheet(data) {
    const scriptURL = "https://script.google.com/macros/s/AKfycbz7R7FuRXu4qi_cQd_Rg5sZY-D6pMEVRHol0FQRNuKXbR3MtXau6cnBuDpRxFAaozc/exec";
    const response = await fetch(scriptURL, {
        method: "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data),
    });

    if (!response.ok) {
        throw new Error("Failed to communicate with Google Apps Script");
    }

    const result = await response.json();
    if (result.status !== "success") {
        throw new Error("Google Apps Script failed to process the submission");
    }

    return true; // Return true if submission was successful
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
        const responses = JSON.parse(localStorage.getItem("deer_cull_responses") || "[]");

        if (responses.length === 0) {
            pendingContainer.innerHTML = "No pending submissions.";
        } else {
            pendingContainer.innerHTML = "";
            responses.forEach((data, index) => {
                const entry = document.createElement("div");
                entry.innerHTML = `<p><strong>Submission #${index + 1}</strong></p>
                                   <p>Name: ${data.name}</p>
                                   <p>Land Type: ${data.landType}</p>
                                   <p>Maturity: ${data.maturity}</p>
                                   <p>Species: ${data.species}</p>
                                   <p>Carcass Fate: ${data.carcassFate}</p>
                                   <p>Latitude: ${data.latitude}</p>
                                   <p>Longitude: ${data.longitude}</p>
                                   <p>Timestamp: ${data.timestamp}</p>
                                   <hr>`;
                pendingContainer.appendChild(entry);
            });

            const latestStatus = localStorage.getItem("deer_cull_latestStatus") || "No recent status message.";
            const statusMessageElement = document.createElement("p");
            statusMessageElement.style.color = "green";
            statusMessageElement.textContent = latestStatus;
            pendingContainer.appendChild(statusMessageElement);
        }
    }

    function updatePendingCount() {
        const responses = JSON.parse(localStorage.getItem("deer_cull_responses") || "[]");
        const pendingCount = responses.length;
        viewPendingButton.textContent = `View Pending Submissions (${pendingCount})`;
    }

    updatePendingCount();

    window.addEventListener("online", () => {
        updateStatus("Device back online. Attempting to sync saved data...");
        syncData();
    });
});


async function showStorageUsage() {
    try {
        let totalUsageBytes = 0;

        // Calculate LocalStorage usage in bytes
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            totalUsageBytes += key.length + value.length;
        }

        // Convert to MB
        const usedMB = (totalUsageBytes / (1024 * 1024)).toFixed(2);
        const maxQuotaMB = 5; // Typical LocalStorage quota is 5 MB
        const usedPercentage = ((usedMB / maxQuotaMB) * 100).toFixed(2);

        // Update the UI
        const storageInfo = document.getElementById('storage-info');
        const progressBar = document.getElementById('storage-progress');

        if (storageInfo && progressBar) {
            storageInfo.innerHTML = `
                <p><strong>LocalStorage Used:</strong> ${usedMB} MB</p>
                <p><strong>LocalStorage Quota:</strong> ${maxQuotaMB} MB</p>
                <p><strong>Used:</strong> ${usedPercentage}%</p>
            `;
            progressBar.max = 100;
            progressBar.value = usedPercentage;
        }
    } catch (error) {
        console.error('Error calculating LocalStorage usage:', error);
        const storageInfo = document.getElementById('storage-info');
        if (storageInfo) {
            storageInfo.innerHTML = `<p>Error fetching LocalStorage usage info.</p>`;
        }
    }
}

// Call the function on page load
document.addEventListener("DOMContentLoaded", () => {
    // Handle dropdown highlighting
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

    // Show storage usage on page load
    showStorageUsage();
});

// Update storage usage when the service worker sends a message
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'STORAGE_UPDATED') {
            showStorageUsage();
        }
    });
}


function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        console.log("Active login session found.");
    } else {
        window.location.href = 'index.html';
    }
}

window.onload = checkLoginStatus;