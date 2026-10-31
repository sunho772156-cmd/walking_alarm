const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'assets', 'alarm_sounds');
function locateFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    // Winget installs may not be added to PATH until a new terminal is opened.
  }

  const packagesRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
    : '';
  if (packagesRoot && fs.existsSync(packagesRoot)) {
    for (const packageName of fs.readdirSync(packagesRoot).filter((name) => name.startsWith('Gyan.FFmpeg.Shared_'))) {
      const packageRoot = path.join(packagesRoot, packageName);
      for (const buildName of fs.readdirSync(packageRoot)) {
        const candidate = path.join(packageRoot, buildName, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

const ffmpeg = locateFfmpeg();
const videos = fs.readdirSync(root)
  .filter((name) => path.extname(name).toLowerCase() === '.mp4')
  .sort((left, right) => left.localeCompare(right));

if (videos.length === 0) {
  console.error('No .mp4 files found in the project folder.');
  process.exit(1);
}

if (!ffmpeg) {
  console.error('FFmpeg was not found on PATH. Install FFmpeg, reopen the terminal, then run `npm run extract-alarm`.');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const sounds = [];
const failures = [];

for (const [index, video] of videos.entries()) {
  const baseName = path.basename(video, path.extname(video));
  const safeName = baseName.normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || `video_${index + 1}`;
  const fileName = `${String(index + 1).padStart(2, '0')}_${safeName}.mp3`;
  const destination = path.join(outputDir, fileName);

  try {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', path.join(root, video),
      '-map', '0:a:0', '-vn',
      '-codec:a', 'libmp3lame', '-q:a', '2',
      destination,
    ], { stdio: 'pipe' });
    sounds.push({
      name: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(baseName)
        ? `Alarm sound ${index + 1}`
        : baseName,
      sourceFile: video,
      file: fileName,
      src: `/assets/alarm_sounds/${encodeURIComponent(fileName)}`,
    });
    console.log(`Extracted: ${video} -> assets/alarm_sounds/${fileName}`);
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    failures.push({ video, message });
    console.error(`Failed: ${video}\n${message}`);
  }
}

if (sounds.length > 0) {
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ sounds }, null, 2)}\n`, 'utf8');
  console.log(`Wrote manifest for ${sounds.length} alarm sound(s).`);
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${videos.length} video(s) could not be converted.`);
  process.exitCode = 1;
}
