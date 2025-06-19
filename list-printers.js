const { ThermalPrinter } = require('node-thermal-printer');

try {
    // Try to get system printers
    const printers = require('printer').getPrinters();
    console.log('\nAvailable printers:');
    printers.forEach((printer, index) => {
        console.log(`${index + 1}. Name: ${printer.name}`);
        console.log(`   Status: ${printer.status}`);
        console.log(`   Default: ${printer.isDefault}`);
        console.log('---');
    });
} catch (error) {
    console.error('Error listing printers:', error);
} 
