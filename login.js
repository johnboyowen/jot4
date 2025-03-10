const apiUrl = "https://script.google.com/macros/s/AKfycbxdlAjqCgMPr6uPo-lFQCiCdDIt6JoAUBLKMAMnk7PSCt-oUOg1CJzGvqjW_OWAKZgazg/exec?action=login";

async function fetchAndStoreCredentials() {
    try {
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.success) {
            localStorage.setItem("credentials", JSON.stringify(result.credentials));
        } else {
            console.error("Failed to fetch credentials:", result.message);
        }
    } catch (error) {
        console.error("Error fetching credentials:", error);
    }
}

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.getElementById('rememberMe').checked;

    let credentials = JSON.parse(localStorage.getItem("credentials")) || [];

    if (navigator.onLine) {
        await fetchAndStoreCredentials();
        credentials = JSON.parse(localStorage.getItem("credentials")) || [];
    } else {
        console.log("Offline: Using stored credentials.");
    }

    let isValid = credentials.some(encoded => {
        let decoded = atob(encoded);
        let [storedUser, storedPass] = decoded.split(":");
        return storedUser === username && storedPass === password;
    });

    if (isValid) {
        document.getElementById('status').innerText = "Login successful";
        localStorage.setItem('username', username);

        if (rememberMe) {
            localStorage.setItem('isLoggedIn', 'true');
        } else {
            sessionStorage.setItem('isLoggedIn', 'true');
        }

        window.location.href = 'index_page.html';
    } else {
        document.getElementById('error').innerText = "Invalid credentials. Try again.";
    }
}

async function refreshCredentialsIfOnline() {
    if (navigator.onLine) {
        console.log("Online: Fetching latest credentials...");
        await fetchAndStoreCredentials();
    } else {
        console.log("Offline: Using stored credentials.");
    }
}

async function checkLoginStatusAndLoadData() {
    console.log("Checking login status...");

    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        console.log("User is logged in.");
        await refreshCredentialsIfOnline();
    } else {
        console.log("No active login session found.");
        await refreshCredentialsIfOnline();
    }
}

window.onload = checkLoginStatusAndLoadData;
