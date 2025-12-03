const fs = require('fs');
const path = require('path');

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !file.includes('node_modules')) {
      fixImports(fullPath);
    } else if (file.endsWith('.js') && !file.includes('node_modules')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      // Fix relative imports without .js extension (but keep existing .js)
      content = content.replace(/from\s+['"]\.\/([^'"]+)['"]/g, (match, p1) => {
        if (!p1.endsWith('.js') && !p1.endsWith('.json') && !p1.includes('node_modules')) {
          return `from './${p1}.js'`;
        }
        return match;
      });
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log(`Fixed: ${fullPath}`);
      }
    }
  }
}

const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  fixImports(distDir);
  console.log('Fixed imports in dist/');
} else {
  console.log('dist/ directory not found');
}
