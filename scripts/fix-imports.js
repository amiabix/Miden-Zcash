const fs = require('fs');
const path = require('path');

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.js') && !file.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // Fix relative imports without .js extension
      content = content.replace(/from\s+['"]\.\/([^'"]+)['"]/g, (match, p1) => {
        if (!p1.endsWith('.js') && !p1.endsWith('.json')) {
          return `from './${p1}.js'`;
        }
        return match;
      });
      fs.writeFileSync(fullPath, content);
    }
  }
}

fixImports(path.join(__dirname, '../dist'));
console.log('Fixed imports in dist/');
