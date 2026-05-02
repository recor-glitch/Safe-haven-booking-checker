import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasEnvToken: !!process.env.NOTION_TOKEN,
    dbId: process.env.NOTION_DB_ID || "34e173006daf81d38d92c53194799ead" // Default fallback DB
  });
}
