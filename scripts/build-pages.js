const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });

for (const file of ['index.html', 'style.css', 'app.js', 'distance-verifier.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

const publicSounds = path.join(output, 'assets', 'alarm_sounds');
fs.mkdirSync(publicSounds, { recursive: true });
fs.writeFileSync(path.join(publicSounds, 'manifest.json'), JSON.stringify({ sounds: [] }, null, 2));

console.log(`GitHub Pages files prepared in ${output}`);
