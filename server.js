require('dotenv').config()
const express = require('express')
const app = express()
const https = require('http').Server(app);
const path = require('path')
const { logger, logEvents } = require('./middleware/logger')
const errorHandler = require('./middleware/errorHandler')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const corsOptions = require('./config/corsOptions')
const connectDB = require('./config/dbConn')
const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid');
const conf = require("./config/conf");
const global = require('./middleware/global')
const jwt = require('jsonwebtoken')
const asyncHandler = require('express-async-handler')
const jwt_decode = require('jwt-decode')
const socketIO = require('socket.io')

(https, {
    cors: {
        origin: "*"
    }
});
const PORT = process.env.PORT || 8081
mongoose.set('strictQuery', false);
console.log(process.env.NODE_ENV)


connectDB()

app.use(logger)
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use('/uploads', express.static('uploads'));
const jobRoutes = require('./routes/jobs');


app.use('/', express.static(path.join(__dirname, 'public')))
app.use('/', require('./routes/root'))



 app.use('/api/recruiter/jobs', jobRoutes);


 app.use('/helth',  require('./routes/health'));



app.all('*', (req, res) => {
    res.status(404)
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'views', '404.html'))
    } else if (req.accepts('json')) {
        res.json({ message: '404 Not Found' })
    } else {
        res.type('txt').send('404 Not Found')
    }
})

app.use(errorHandler)


mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB')
    https.listen(PORT, () => console.log(`Server running on port ${PORT}`))
})

 

mongoose.connection.on('error', err => {
    console.log(err)
    logEvents(`${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`, 'mongoErrLog.log')
})

