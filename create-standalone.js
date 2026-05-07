const fs = require('fs');
const path = require('path');

const cssPath = 'dist/assets/index-B_4r8TQJ.css';
const jsPath = 'dist/assets/index-CxE9y11O.js';

const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const standalone = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>401(k) Contribution Planner - 2026</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${js}
    </script>
  </body>
</html>`;

fs.writeFileSync('dist/401k-planner-standalone.html', standalone);
console.log('✓ Created dist/401k-planner-standalone.html');
