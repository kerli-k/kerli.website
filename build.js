const fs = require('fs');
const path = require('path');

const dirs = { partials: 'partials', pages: 'pages', out: 'dist', css: 'css', js: 'js', img: 'img' };
fs.rmSync(dirs.out, { recursive: true, force: true });
fs.mkdirSync(dirs.out, { recursive: true });

const header = fs.readFileSync(path.join(dirs.partials, 'header.html'), 'utf8');
const footer = fs.readFileSync(path.join(dirs.partials, 'footer.html'), 'utf8');

fs.readdirSync(dirs.pages).forEach(file => {
  if (!file.endsWith('.html')) return;
  const content = fs.readFileSync(path.join(dirs.pages, file), 'utf8');
  
  // Extract title from HTML comment: <!-- title: Blog -->
  const titleMatch = content.match(/<!--\s*title:\s*(.*?)\s*-->/);
  const title = titleMatch ? titleMatch[1] : file.replace('.html', '');
  const fullTitle = title === 'index' ? 'kerli' : `${title} · kerli`;

  const finalHtml = header.replace('{{title}}', fullTitle) + content + footer;
  fs.writeFileSync(path.join(dirs.out, file), finalHtml);
});

// Copy assets recursively
const copy = (src, dest) => {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest);
  fs.readdirSync(src).forEach(f => {
    const s = path.join(src, f), d = path.join(dest, f);
    fs.statSync(s).isDirectory() ? copy(s, d) : fs.copyFileSync(s, d);
  });
};
copy(dirs.css, path.join(dirs.out, 'css'));
copy(dirs.js, path.join(dirs.out, 'js'));
copy(dirs.img, path.join(dirs.out, 'img'));
copy('public', dirs.out);
console.log('Build complete -> /dist');