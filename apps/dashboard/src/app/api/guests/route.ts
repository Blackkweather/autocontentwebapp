import { NextResponse } from "next/server";
import { supabaseAdmin } from "@club-os/core/database/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("guests")
    .select("*")
    .order("total_spend", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guests: data ?? [] });
}
