require('dotenv').config();
const express = require('express');
const path = require('path');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

// Bypass proxy settings for local connections
process.env.NO_PROXY = 'localhost,127.0.0.1';
if (process.env.HTTP_PROXY || process.env.http_proxy) {
    process.env.NO_PROXY += ',localhost,127.0.0.1';
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

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

// Middleware to check API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Initialize printer
let printer;
try {
    printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: 'printer:YOUR_PRINTER_NAME', // We'll need to replace this with your actual printer name
        driver: require('printer'),
        options: {
            timeout: 5000
        }
    });
    console.log('Printer initialized');
} catch (error) {
    console.error('Printer initialization error:', error);
}

// Test print endpoint
app.post('/print', checkApiKey, async (req, res) => {
    try {
        console.log('Print request received');
        
        if (!printer) {
            return res.status(500).json({ error: 'Printer not initialized' });
        }

        let isConnected = await printer.isPrinterConnected();
        console.log('Printer connected:', isConnected);

        if (!isConnected) {
            return res.status(500).json({ error: 'Printer not connected' });
        }

        // Test print
        printer.alignCenter();
        printer.println('Hello World!');
        printer.println('Test Print');
        printer.println(new Date().toLocaleString());
        printer.cut();
        
        try {
            await printer.execute();
            console.log('Print successful');
            res.json({ success: true, message: 'Print job sent' });
        } catch (error) {
            console.error('Print execution error:', error);
            res.status(500).json({ error: 'Print failed', details: error.message });
        }

    } catch (error) {
        console.log('Top level error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// Status endpoint
app.get('/status', async (req, res) => {
    try {
        if (!printer) {
            return res.json({ 
                status: 'Printer not initialized',
                error: 'Printer configuration missing'
            });
        }

        const isConnected = await printer.isPrinterConnected();
        res.json({ 
            status: 'Printer server is running',
            printerConnected: isConnected
        });
    } catch (e) {
        res.json({ 
            status: 'Printer server is running',
            error: 'Error checking printer: ' + (e.message || String(e))
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Printer server running on http://127.0.0.1:${PORT}`);
    console.log('Waiting for print jobs...');
}); 
