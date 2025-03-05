async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.getElementById('rememberMe').checked;

    const apiUrl = "https://script.google.com/macros/s/AKfycbxyKCu2b4PsAjYV3O_e4CTOs7OYRoNuw5OsKqZUdIMnPp53tp9wqqLyal8EchuXmdtpRw/exec";

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.success) {
            document.getElementById('status').innerText = result.message;

            if (rememberMe) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', username);
            } else {
                sessionStorage.setItem('isLoggedIn', 'true');
            }

            window.location.href = 'index_page.html';
        } else {
            document.getElementById('error').innerText = result.message;
        }
    } catch (error) {
        document.getElementById('error').innerText = 'Login failed. Try again.';
    }
}


function checkLoginStatus() {
    if (localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true') {
        window.location.href = 'index_page.html';
    } else {
        console.log("No active login session found.");
    }
}

window.onload = checkLoginStatus;
