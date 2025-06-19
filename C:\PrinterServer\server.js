require('dotenv').config();
const express = require('express');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

const app = express();
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Printer server running on port ${PORT}`);
    console.log('Waiting for print jobs...');
}); 