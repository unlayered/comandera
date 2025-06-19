require('dotenv').config();
const express = require('express');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// Bypass proxy settings for local connections
process.env.NO_PROXY = 'localhost,127.0.0.1';
if (process.env.HTTP_PROXY || process.env.http_proxy) {
    process.env.NO_PROXY += ',localhost,127.0.0.1';
}

const app = express();
app.use(express.json());

// Add CORS for local testing
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Configure printer
const deviceConfig = {
    vid: 0x0FE6,  // Your Vendor ID
    pid: 0x811E   // Your Product ID
};

// Middleware to check API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Test print endpoint
app.post('/print', checkApiKey, async (req, res) => {
    try {
        const device = new escpos.USB(deviceConfig.vid, deviceConfig.pid);
        const printer = new escpos.Printer(device);

        device.open(function(error){
            if(error) {
                console.error('Printer open error:', error);
                return res.status(500).json({ error: 'Printer connection failed' });
            }

            printer
                .font('a')
                .align('ct')
                .text('Hello World!')
                .text('Test Print')
                .text(new Date().toLocaleString())
                .cut()
                .close();

            res.json({ success: true, message: 'Print job sent' });
        });

    } catch (error) {
        console.error('Printer error:', error);
        res.status(500).json({ error: 'Print failed', details: error.message });
    }
});

// Add a simple GET endpoint for testing connection
app.get('/status', (req, res) => {
    res.json({ status: 'Printer server is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {  // Explicitly listen on localhost only
    console.log(`Printer server running on http://127.0.0.1:${PORT}`);
    console.log('Waiting for print jobs...');
}); 
