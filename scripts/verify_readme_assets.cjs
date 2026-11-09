const fs = require('fs');
const path = require('path');

const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
const regex = /(?:src|href)="([^"]+)"/g;
let match;
const links = [];

while ((match = regex.exec(readme)) !== null) {
  const link = match[1];
  if (link && !link.startsWith('http') && !link.startsWith('#') && !link.startsWith('mailto')) {
    links.push(link);
  }
}

// Markdown links
const mdRegex = /\[.*?\]\((.*?)\)/g;
while ((match = mdRegex.exec(readme)) !== null) {
  const link = match[1];
  if (link && !link.startsWith('http') && !link.startsWith('#') && !link.startsWith('mailto')) {
    links.push(link);
  }
}

console.log('--- Verifying Assets in README.md ---');
let missing = 0;
for (const link of links) {
  const clean = link.split('#')[0];
  const target = path.resolve(__dirname, '..', clean);
  if (!fs.existsSync(target)) {
    console.error('  ❌ MISSING:', clean);
    missing++;
  } else {
    console.log('  ✓ FOUND:', clean);
  }
}

console.log(`\nResult: Total = ${links.length}, Missing = ${missing}`);
if (missing > 0) {
  process.exit(1);
} else {
  console.log('🏆 100% OF REFERENCED ASSETS VERIFIED ON DISK!');
}
