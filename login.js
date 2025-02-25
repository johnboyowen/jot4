function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    // Check credentials (replace this with actual authentication logic as needed)
    if (username === "Deer" && password === "jot") {
        // If login is successful, show success status
        document.getElementById('status').innerText = 'Login successful!';
        
        // Store login status
        if (rememberMe) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', username);
        } else {
            sessionStorage.setItem('isLoggedIn', 'true');
        }
        
        // Redirect to the main app page
        window.location.href = 'index_page.html';
    } else {
        // Display invalid credentials message
        document.getElementById('status').innerText = 'Invalid credentials';
    }
}

// Check if the user is already logged in
function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        window.location.href = 'index_page.html'; // Adjust to your main app page
    }
}

// Run checkLoginStatus on page load
window.onload = checkLoginStatus;
