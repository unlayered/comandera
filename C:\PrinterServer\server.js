require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

// Check if API key is configured
if (!process.env.API_KEY) {
    console.error('ERROR: API_KEY not set in environment variables');
    console.error('Please create a .env file with your API key');
    process.exit(1);
}

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

// Add rate limiting for security
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute

const rateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, firstRequest: now });
    } else {
        const data = requestCounts.get(ip);
        
        if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
            // Reset if window has passed
            data.count = 1;
            data.firstRequest = now;
        } else {
            data.count++;
            if (data.count > MAX_REQUESTS) {
                return res.status(429).json({ error: 'Too many requests' });
            }
        }
    }
    
    next();
};

app.use(rateLimit);

// Serve test page at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// Middleware to check API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        console.error('Invalid API key attempt:', apiKey);
        return res.status(401).json({ error: 'Unauthorized - Invalid API Key' });
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

// Print file using Windows print spooler (PowerShell method)
function printFile(printerName, filePath) {
    return new Promise((resolve, reject) => {
        // Use PowerShell's Out-Printer command, which is often more robust.
        // We escape the path to handle spaces or special characters.
        const escapedPath = filePath.replace(/'/g, "''");
        const command = `powershell -NoProfile -Command "Get-Content -Path '${escapedPath}' -Raw | Out-Printer -Name '${printerName}'"`;
        console.log(`Executing PowerShell print command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            // For PowerShell, it's important to check stderr, as that's where errors are written.
            if (stderr) {
                console.error(`PowerShell print command failed. Stderr: ${stderr}`);
                reject(new Error(`PowerShell print command failed: ${stderr}`));
                return;
            }
            if (error) {
                console.error(`Error executing PowerShell:`, error);
                reject(error);
                return;
            }
            console.log(`PowerShell print command successful. Stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(amount);
}

// Generate receipt content for order paid event
function generateOrderReceipt(event) {
    const { orderDetails } = event.data;
    const lines = [
        '\x1B\x40',          // Initialize Printer
        '\x1B\x61\x01',      // Center Alignment
        '=== ORDEN DE COMPRA ===\n\n',
        '\x1B\x61\x00',      // Left Alignment
        `Orden: #${event.orderId.slice(-6).toUpperCase()}\n`,
        `Cliente: ${orderDetails.customerName}\n`,
        `Email: ${orderDetails.customerEmail}\n\n`,
        '--------------------------------\n',
        'Items:\n',
        ...orderDetails.items.map(item => 
            `${item.quantity}x ${item.name}\n` +
            `  ${formatCurrency(item.unitPrice)} c/u\n` +
            `  Total: ${formatCurrency(item.quantity * item.unitPrice)}\n`
        ),
        '--------------------------------\n',
        '\x1B\x61\x02',      // Right Alignment
        `TOTAL: ${formatCurrency(orderDetails.totalAmount)}\n\n`,
        '\x1B\x61\x01',      // Center Alignment
        new Date().toLocaleString() + '\n\n',
        // Feed extra lines to push the paper out, then cut.
        '\n\n\n\n\n\n\n',    // Add 7 blank lines for spacing
        '\x1D\x56\x42\x00'   // A more compatible cut command (Full cut)
    ];
    
    return lines.join('');
}

// Generate receipt content for item redeemed event
function generateRedemptionReceipt(event) {
    const { redemptionDetails } = event.data;
    const lines = [
        '\x1B\x40',          // Initialize Printer
        '\x1B\x61\x01',      // Center Alignment
        '=== CANJE DE ITEM ===\n\n',
        '\x1B\x61\x00',      // Left Alignment
        `Orden: #${event.orderId.slice(-6).toUpperCase()}\n`,
        `Item: ${redemptionDetails.productName}\n`,
        `Cantidad: ${redemptionDetails.quantity}\n\n`,
        '\x1B\x61\x01',      // Center Alignment
        new Date().toLocaleString() + '\n\n',
        // Feed extra lines to push the paper out, then cut.
        '\n\n\n\n\n\n\n',    // Add 7 blank lines for spacing
        '\x1D\x56\x42\x00'   // A more compatible cut command (Full cut)
    ];
    
    return lines.join('');
}

// Print endpoint
app.post('/print', checkApiKey, async (req, res) => {
    try {
        console.log('Print request received:', req.body);
        
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
        
        // Generate receipt based on event type
        let data;
        const event = req.body;

        if (!event.type || !event.businessId || !event.orderId) {
            return res.status(400).json({ error: 'Missing required fields: type, businessId, orderId' });
        }

        if (event.type === 'order_paid') {
            if (!event.data?.orderDetails) {
                return res.status(400).json({ error: 'Missing orderDetails in event data' });
            }
            data = generateOrderReceipt(event);
        } else if (event.type === 'item_redeemed') {
            if (!event.data?.redemptionDetails) {
                return res.status(400).json({ error: 'Missing redemptionDetails in event data' });
            }
            data = generateRedemptionReceipt(event);
        } else {
            return res.status(400).json({ error: 'Invalid event type. Must be order_paid or item_redeemed' });
        }

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
            printer: printerName,
            eventType: event.type
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

const PORT = process.env.PORT || 3001;
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
