document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    fetch('http://localhost:3000/protected', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('user-info').textContent = `Welcome, ${data.user.username}! Your role is: ${data.user.role}`;
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while fetching user data');
    });

    document.getElementById('logout').addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });
});