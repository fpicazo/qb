const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  const filePath = path.join('/var/www/html', req.url);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('File not found:', filePath);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    console.log('Serving:', filePath);
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(data);
  });
});

server.listen(80, () => {
  console.log('🚀 HTTP validator running on port 80');
});