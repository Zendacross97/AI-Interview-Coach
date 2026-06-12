function signUp(event) {
    event.preventDefault();
    const name = event.target.name.value;
    const email = event.target.email.value;
    const password = event.target.password.value;
    const signUpDetails = { name, email, password };
    axios.post('/user/signup', signUpDetails)
    .then((res) => {
        const p = document.querySelector('.signup-message');
        p.innerHTML = '';
        alert(res.data.message);
        window.location.href = '/';
    })
    .catch((err) => {
        const p = document.querySelector('.signup-message');
        p.innerHTML = (err.response && err.response.data && err.response.data.error) ? err.response.data.error : 'An error occurred';
        p.style.color = 'red';
        console.log(err.message);
    });
    event.target.name.value = '';
    event.target.email.value = '';
    event.target.password.value = '';
}

function logIn(event) {
    event.preventDefault();
    const email = event.target.email.value;
    const password = event.target.password.value;
    const loginDetails = { email, password };
    axios.post('/user/login', loginDetails)
    .then((res) => {
        alert(res.data.message);
        localStorage.setItem('token', res.data.token);
        window.location.href = '/interview';
    })
    .catch((err) => {
        const p = document.querySelector('.login-message');
        p.innerHTML = (err.response && err.response.data && err.response.data.error) ? err.response.data.error : 'An error occurred';
        p.style.color = 'red';
        console.log(err.message);
    });
    event.target.email.value = '';
    event.target.password.value = '';
}

function forgotPassword(event) {
    event.preventDefault();
    const email = event.target.email.value;
    const p = document.querySelector('.forgot-message');
    axios.get(`/password/forgotpassword/${ email }`)
    .then((res) => {
        p.innerHTML = res.data.message;
        p.style.color = 'green';
    })
    .catch((err) => {
        p.innerHTML = (err.response && err.response.data && err.response.data.error) ? err.response.data.error : 'An error occurred';
        p.style.color = 'red';
        console.log(err.message);
    })
}

function resetPassword(event) {
    event.preventDefault();
    const password = event.target.password.value;
    const confirmPassword = event.target.confirmPassword.value;
    const passwordDetails = { password, confirmPassword };
    const uuid = window.location.href.split('/').pop();
    const p = document.querySelector('.reset-message');
    axios.post(`/password/updatepassword/${ uuid }`, passwordDetails)
    .then((res) => {
        alert(res.data.message);
        window.location.href = '/';
    })
    .catch((err) => {
        p.innerHTML = (err.response && err.response.data && err.response.data.error) ? err.response.data.error : 'An error occurred';
        p.style.color = 'red';
        console.log(err.message);
    })
}