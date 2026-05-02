const axios = require('axios');

async function checkDatabases(token) {
  console.log('Checking which databases your token can access...');
  try {
    const response = await axios({
      method: 'POST',
      url: 'https://api.notion.com/v1/search',
      headers: {
        'Authorization': `Bearer ${token}`,
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
    
    const dbs = response.data.results;
    if (dbs.length === 0) {
      console.log('\n❌ ERROR: Your integration has NO access to any databases.');
      console.log('You must go to your Notion Database -> ... (top right) -> Connections -> Add connection -> Select "Room Availability"');
    } else {
      console.log(`\n✅ SUCCESS! Your integration has access to ${dbs.length} database(s):`);
      dbs.forEach(db => {
        const title = db.title?.[0]?.plain_text || 'Untitled';
        console.log(`- Title: "${title}" | ID: ${db.id.replace(/-/g, '')}`);
      });
      console.log('\nPlease copy the correct ID above and let me know, or if it matches what we have, we will use it.');
    }
  } catch (e) {
    if (e.response && e.response.status === 401) {
      console.log('\n❌ ERROR: API token is invalid. Make sure you copied it exactly.');
    } else {
      console.error('\n❌ ERROR:', e.response?.data?.message || e.message);
    }
  }
}

const token = process.argv[2];
if (!token) {
  console.log('Please provide your token like this: node check-access.js ntn_YOUR_TOKEN');
} else {
  checkDatabases(token);
}