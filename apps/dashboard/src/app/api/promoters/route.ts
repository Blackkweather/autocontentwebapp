import { NextResponse } from "next/server";
import { supabaseAdmin } from "@club-os/core/database/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("promoters")
    .select("*")
    .order("revenue", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promoters: data ?? [] });
}
