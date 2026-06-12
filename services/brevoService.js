const Sib = require('sib-api-v3-sdk');

exports.sendResetPasswordEmail = async (email, uuid) => {
    const client = Sib.ApiClient.instance
    const apiKey = client.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    const tranEmailApi = new Sib.TransactionalEmailsApi()
    const sender = {
        email: 'sidhchakraborty66@gmail.com',
        name: 'Siddhartha Chakraborty'
    }
    const receiver = [{
        email: `${ email }`
    }]
    return tranEmailApi.sendTransacEmail({
        sender,
        to: receiver,
        subject: 'Reset Password',
        textContent: 'Click on the link to reset your { { params.role } }.',
        params: {
            role: 'Password'
        },
        htmlContent: `<h1> Daily Expense Tracker <h1>
                    <h3> Your password reset link <h3>
                    <p> Click here: <a href="${process.env.BASE_URL}/password/resetpassword/${uuid}">Reset</a><p>`
    })
}