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

    const takePhotoButton = document.getElementById("takePhoto");
    const photoPreview = document.getElementById("photoPreview");

    function updateStatus(message) {
        statusDisplay.textContent = message;
        localStorage.setItem("site_sign_in_latestStatus", message); // Save latest status specific to site sign-in
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
        ).join(","); // Convert array to a comma-separated string


        data.timestamp = new Date().toLocaleString();
        data.photos = JSON.stringify(photoData);

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
        }

        updatePendingCount();
    }

    async function sendToGoogleSheet(data) {
        data.action = "signin"
        const scriptURL = "https://script.google.com/macros/s/AKfycbxi3DVoVUTjMoC8TVbYTYJnmnIPiN3oit__-lYDUYT7aUD1JInvewOD6CqMWApizQWIlw/exec";
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
                                   <p>Lead Contractor: ${data.leadContractor}</p>
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

const loadDropdownScriptUrl = "https://script.google.com/macros/s/AKfycbzM9tkIAFX1n0YhF0TlMU1NOWx2yUGQj_lKOmGnDzop8gaPdKq5CK4dWnEErXGwyyKxcA/exec";
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
    const contractorSelect = document.getElementById("leadContractor");
    const stalkersSelect = document.getElementById("additionalStalkers");
    const exemptionsSelect = document.getElementById("exemptions");

    propertySelect.innerHTML = generateOptions(data.propertyNames);
    contractorSelect.innerHTML = generateOptions(data.leadContractors);
    stalkersSelect.innerHTML = generateOptions(data.additionalStalkers, true);
    exemptionsSelect.innerHTML = generateOptions(data.exemptions);
}

function generateOptions(options, isMultiple = false) {
    let optionsHTML = isMultiple ? "" : `<option value="">Please Select</option>`;
    options.forEach(option => {
        optionsHTML += `<option value="${option}">${option}</option>`;
    });
    return optionsHTML;
}

window.onload = checkLoginStatus;