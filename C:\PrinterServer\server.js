require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

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

// Get list of printers using Windows command
function getPrinters() {
    return new Promise((resolve, reject) => {
        exec('wmic printer get name', (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            // Parse the output to get printer names
            const printers = stdout.split('\n')
                .map(line => line.trim())
                .filter(line => line && line !== 'Name')
                .filter(Boolean);
            resolve(printers);
        });
    });
}

// Print file using Windows print spooler
function printFile(printerName, filePath) {
    return new Promise((resolve, reject) => {
        const command = `rundll32 printui.dll,PrintUIEntry /k /n "${printerName}" "${filePath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

// Test print endpoint
app.post('/print', checkApiKey, async (req, res) => {
    try {
        console.log('Print request received');
        
        // Get list of printers
        const printers = await getPrinters();
        console.log('Available printers:', printers);

        // Find the "Barra" printer
        const printerName = printers.find(p => p.includes('Barra'));
        if (!printerName) {
            return res.status(500).json({ error: 'Printer "Barra" not found. Available printers: ' + printers.join(', ') });
        }
        console.log('Using printer:', printerName);

        // Create a temporary file with the print data
        const tempFile = path.join(os.tmpdir(), `print_${Date.now()}.txt`);
        
        // Create test print data
        const data = [
            '\x1B\x40',          // Initialize printer
            '\x1B\x61\x01',      // Center alignment
            '=== BAR TEST PRINT ===\n\n',
            'Mesa: 1\n',
            'Pedido: #123\n\n',
            'Items:\n',
            '- 2x Cerveza\n',
            '- 1x Coca Cola\n\n',
            new Date().toLocaleString() + '\n\n',
            'Impresora: ' + printerName + '\n',
            '\n\n\n\n\n',        // Feed lines
            '\x1D\x56\x41'       // Cut paper
        ].join('');

        // Write data to temp file
        fs.writeFileSync(tempFile, data, 'binary');

        // Send to printer
        await printFile(printerName, tempFile);

        // Clean up temp file
        fs.unlinkSync(tempFile);

        console.log('Print successful');
        res.json({ 
            success: true, 
            message: 'Print job sent',
            printer: printerName
        });

    } catch (error) {
        console.log('Top level error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// Status endpoint
app.get('/status', async (req, res) => {
    try {
        const printers = await getPrinters();
        res.json({ 
            status: 'Printer server is running',
            printersFound: printers.length,
            printers: printers
        });
    } catch (e) {
        res.json({ 
            status: 'Printer server is running',
            error: 'Error finding printers: ' + (e.message || String(e))
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', async () => {
    // List available printers on startup
    try {
        const printers = await getPrinters();
        console.log('Available printers:', printers);
    } catch (e) {
        console.log('Error listing printers:', e);
    }

    console.log(`Printer server running on http://127.0.0.1:${PORT}`);
    console.log('Waiting for print jobs...');
}); 
