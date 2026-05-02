const axios = require('axios');

async function search() {
  try {
    const response = await axios({
      method: 'POST',
      url: 'https://api.notion.com/v1/search',
      headers: {
        'Authorization': 'Bearer ntn_E62243752154JFy0bCxEeYDsYBAu8DeotdwDctV1HVD8a1',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      data: {
        filter: {
          value: 'database',
          property: 'object'
        }
      }
    });
    
    console.log(JSON.stringify(response.data.results.map(db => ({ id: db.id, title: db.title?.[0]?.plain_text })), null, 2));
  } catch (e) {
    console.error(e.response?.data || e.message);
  }
}

search();