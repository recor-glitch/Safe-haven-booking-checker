import { NextResponse } from 'next/server';
import axios from 'axios';

async function handleRequest(request, context) {
  // Await the params object in Next.js 15+ (if using latest)
  const params = await context.params;
  const pathArray = params.notion || [];
  const path = pathArray.join('/');
  
  // Also pass the query string if there is one
  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const suffix = queryString ? `?${queryString}` : '';
  
  const notionApiUrl = `https://api.notion.com/v1/${path}${suffix}`;
  
  const method = request.method;
  
  // Use environment variable if available, otherwise fallback to header
  const authHeader = process.env.NOTION_TOKEN 
    ? `Bearer ${process.env.NOTION_TOKEN}`
    : request.headers.get('authorization') || '';

  const headers = {
    'Authorization': authHeader,
    'Notion-Version': request.headers.get('notion-version') || '2022-06-28',
    'Content-Type': 'application/json',
  };

  let data = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const text = await request.text();
      if (text) {
        data = JSON.parse(text);
      }
    } catch (e) {
      console.error("Error parsing request body:", e);
    }
  }

  try {
    const response = await axios({
      method,
      url: notionApiUrl,
      headers,
      data,
      validateStatus: () => true, // resolve all HTTP status codes
    });
    
    return NextResponse.json(response.data, { status: response.status });
  } catch (error) {
    console.error("Notion API Error:", error.message);
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
