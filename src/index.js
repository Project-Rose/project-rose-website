import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' assert { type: 'json' };
import express from 'express';
import chalk from 'chalk';

const app = express();
const port = config.http.port;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', 'errors', '404.html'));
});

app.listen(port, () => {
  console.log(chalk.bold.blueBright(`Server is running on port ${port}`));
});
