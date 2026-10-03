const path = require('path');

// Servir os ficheiros estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Entregar o index.html
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});
