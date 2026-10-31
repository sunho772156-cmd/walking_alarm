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
const sourceSounds = path.join(root, 'assets', 'alarm_sounds');
const manifestPath = path.join(sourceSounds, 'manifest.json');
let sounds = [];

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  sounds = Array.isArray(manifest.sounds) ? manifest.sounds : [];
}

// Publish only extracted audio files listed in the manifest; never copy source videos.
const publicManifest = sounds.filter((sound) => {
  if (!sound.file || path.basename(sound.file) !== sound.file || !sound.file.endsWith('.mp3')) return false;
  const source = path.join(sourceSounds, sound.file);
  if (!fs.existsSync(source)) return false;
  fs.copyFileSync(source, path.join(publicSounds, sound.file));
  return true;
}).map((sound) => ({
  name: sound.name,
  src: `assets/alarm_sounds/${encodeURIComponent(sound.file)}`,
}));

fs.writeFileSync(path.join(publicSounds, 'manifest.json'), JSON.stringify({ sounds: publicManifest }, null, 2));

console.log(`GitHub Pages files prepared in ${output} (${publicManifest.length} alarm sounds)`);
