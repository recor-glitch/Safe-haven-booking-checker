const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Proxy requests to Notion API
app.use('/api', async (req, res) => {
  const notionApiUrl = `https://api.notion.com/v1${req.path}`;
  
  try {
    const response = await axios({
      method: req.method,
      url: notionApiUrl,
      headers: {
        'Authorization': req.headers.authorization,
        'Notion-Version': req.headers['notion-version'] || '2022-06-28',
        'Content-Type': 'application/json',
      },
      data: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      console.error("Notion API Error:", error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
