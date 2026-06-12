const cashfree = Cashfree({
    mode: "sandbox"
});

document.getElementById("renderBtn").addEventListener("click", () => {
    const token = localStorage.getItem('token');
    axios.post('/payment/pay', {}, { headers: { 'Authorization': token } })
    .then((res) => {
        let checkoutOptions = {
            paymentSessionId: res.data.paymentSessionId,
            redirectTarget: "_self"
        };
        cashfree.checkout(checkoutOptions)
    })
    .catch((err) => {
        console.log(err.message);
    })
});