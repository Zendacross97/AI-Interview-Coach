require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http'); // Native Node module
const { initWebSocketGateway } = require('./ws');

const app = express();
const server = http.createServer(app); // Wrap Express app inside a standard HTTP server

const userRoute = require('./routes/userRoutes');
const paymentRoute = require('./routes/paymentRoute');
const interviewRoute = require('./routes/interviewRoute');

app.use(cors({
    origin: process.env.BASE_URL,
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.use('/user', userRoute);
app.use('/password', userRoute);
app.use('/payment', paymentRoute);
app.use('/interview', interviewRoute);

initWebSocketGateway(server); // Passes server target into your custom router engine setup

mongoose.connect(process.env.MONGODB_URL)
.then(res => {
    server.listen(process.env.PORT, () => {
        console.log(`Server is listening globally on port: ${process.env.PORT}`);
    });
})
.catch(err => {
    console.log(err);
});