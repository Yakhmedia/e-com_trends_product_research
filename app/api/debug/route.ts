import { NextRequest, NextResponse } from "next/server";

const SERP_API_KEY = process.env.SERP_API_KEY!;

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword") ?? "bicycle";
  const dataType = req.nextUrl.searchParams.get("type") ?? "GEO_MAP";

  const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(keyword)}&data_type=${dataType}&api_key=${SERP_API_KEY}`;
  const res = await fetch(url);
  const raw = await res.json();
  return NextResponse.json(raw);
}
