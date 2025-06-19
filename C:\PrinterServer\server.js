require('dotenv').config();
const express = require('express');
const path = require('path');

// Initialize escpos differently
const escpos = require('escpos');
const USB = require('escpos-usb');
escpos.USB = USB;

// Bypass proxy settings for local connections
process.env.NO_PROXY = 'localhost,127.0.0.1';
if (process.env.HTTP_PROXY || process.env.http_proxy) {
    process.env.NO_PROXY += ',localhost,127.0.0.1';
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

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

// Serve test page at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// Configure printer
const deviceConfig = {
    vid: 0x0FE6,  // Your Vendor ID
    pid: 0x811E   // Your Product ID
};

// List available devices
try {
    const devices = USB.findPrinter();
    console.log('Available USB devices:', devices);
} catch (e) {
    console.log('Error finding USB devices:', e);
}

// Middleware to check API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Test print endpoint
app.post('/print', checkApiKey, (req, res) => {
    try {
        // Find printer
        const devices = USB.findPrinter();
        if (!devices || devices.length === 0) {
            throw new Error('No USB printers found');
        }

        // Use the first found printer
        const device = new USB();
        const printer = new escpos.Printer(device);

        device.open(function(error){
            if(error) {
                console.error('Printer open error:', error);
                return res.status(500).json({ 
                    error: 'Printer connection failed',
                    details: error.message || String(error)
                });
            }

            printer
                .font('a')
                .align('ct')
                .text('Hello World!')
                .text('Test Print')
                .text(new Date().toLocaleString())
                .cut()
                .close();

            res.json({ 
                success: true, 
                message: 'Print job sent',
                printerInfo: devices[0]
            });
        });

    } catch (error) {
        console.error('Printer error:', error);
        res.status(500).json({ 
            error: 'Print failed', 
            details: error.message || String(error)
        });
    }
});

// Add a simple GET endpoint for testing connection
app.get('/status', (req, res) => {
    try {
        const devices = USB.findPrinter();
        res.json({ 
            status: 'Printer server is running',
            printersFound: devices.length,
            printers: devices
        });
    } catch (e) {
        res.json({ 
            status: 'Printer server is running',
            error: 'Error finding printers: ' + (e.message || String(e))
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => {  // Explicitly listen on localhost only
    console.log(`Printer server running on http://127.0.0.1:${PORT}`);
    console.log('Waiting for print jobs...');
}); 
